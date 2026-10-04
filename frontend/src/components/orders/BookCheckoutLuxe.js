import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';
import {
  confirmStripePayment,
  createOrder,
  createStripeCheckoutSession,
  deleteOrder,
  getOrderById,
  getApiBaseUrl,
  getGelatoStatus,
  getOrderTracking,
  getPaymentMode,
  listOrdersByBook,
  updateOrderStatus
} from '../../services/ordersApi';
import { estimatePrice } from '../../services/compositionApi';
import { isCurrentlyAnonymous } from '../../services/anonymousSession';
// formatPriceCents/getOrderStatusConfig ne sont plus utilises ICI : ils ont
// suivi les blocs d'affichage dans checkout/ (StepProduct, StepPayment,
// StepTracking), qui sont desormais seuls responsables du rendu.
import { includesPdf, includesPrint, isOrderPaid, isPdfReady, pdfJobIdOf } from '../../utils/orderWorkflow';
import {
  getBookLifecycleStatusFromBook,
  isBookLifecycleAtLeast
} from '../../utils/bookLifecycle';
import OrderSteps from './checkout/OrderSteps';
import StepProduct from './checkout/StepProduct';
import StepAddress from './checkout/StepAddress';
import StepPayment from './checkout/StepPayment';
import StepTracking from './checkout/StepTracking';
import i18n from '../../i18n';
import '../../styles/luxe-theme.css';
import './OrdersLuxe.css';

// Chantier bilingue (2026-09-30) : i18n.t() directement plutot que le hook
// useTranslation — ce composant ecrit la plupart de ses messages depuis des
// callbacks asynchrones (apres un sondage, un webhook Stripe...), pas
// seulement pendant le rendu ; lire la langue COURANTE au moment de l'appel
// est donc plus sur qu'une fermeture sur un `t` capture au rendu precedent.
// Raccourci local : evite de repeter le prefixe de namespace partout.
const t = (key, options) => i18n.t(`checkout:${key}`, options);

const DEFAULT_ADDRESS = {
  // Porte par la COMMANDE, pas seulement par le compte : c'est ce qui permet
  // d'ecrire au client sans lui imposer un mot de passe, et c'est la seule
  // adresse dont dispose le webhook Stripe (non authentifie).
  email: '',
  fullName: '',
  line1: '',
  line2: '',
  postalCode: '',
  city: '',
  country: 'France',
  phone: ''
};

const wait = (durationMs) => new Promise((resolve) => {
  setTimeout(resolve, durationMs);
});
const isMissingPdfJobError = (error) => (
  /job export introuvable|introuvable/i.test(String(error?.message || ''))
);
const isPdfOrderLinkError = (error) => (
  /commande associee au pdf introuvable/i.test(String(error?.message || ''))
);
const getPdfFallbackName = (kind) => {
  if (kind === 'cover') return 'couverture.pdf';
  if (kind === 'interior') return 'interieur.pdf';
  return 'livre-final.pdf';
};
const NETWORK_TIMEOUT_MS = Number(process.env.REACT_APP_API_TIMEOUT_MS || 20000);

// Lancer un rendu est la requete la plus exposee au REVEIL du serveur :
// une instance Render gratuite s'endort apres 15 minutes sans trafic et met
// 30 a 60 s a repartir. Avec les 20 s des appels ordinaires, ce POST
// expirait cote navigateur alors que le serveur acceptait la demande : on
// perdait l'identifiant du job (donc la barre de progression, qui n'avait
// plus rien a suivre) et l'ecran relancait une fabrication toutes les 15 s.
// Constate le 2026-09-15 : « Le serveur met trop de temps a repondre ».
const PDF_START_TIMEOUT_MS = Number(process.env.REACT_APP_PDF_START_TIMEOUT_MS || 90000);
const PREVIEW_FORMAT_IDS = new Set(['livret', 'standard', 'luxe']);
const PREVIEW_FORMAT_ALIASES = {
  prestige: 'standard',
  carre: 'luxe'
};
const PREVIEW_TEXT_DENSITY_IDS = new Set(['airy', 'balanced', 'compact']);
const PREVIEW_IMAGE_DENSITY_IDS = new Set(['discrete', 'balanced', 'immersive']);
const PREVIEW_LINE_SPACING_IDS = new Set(['compact', 'balanced', 'airy']);
const PREVIEW_FORMAT_LAYOUT_DEFAULTS = {
  livret: { textDensity: 'compact', imageDensity: 'discrete' },
  standard: { textDensity: 'balanced', imageDensity: 'balanced' },
  luxe: { textDensity: 'airy', imageDensity: 'immersive' }
};
const normalizePreviewFormat = (value) => {
  const normalized = String(value || '').toLowerCase();
  const canonical = PREVIEW_FORMAT_ALIASES[normalized] || normalized;
  return PREVIEW_FORMAT_IDS.has(canonical) ? canonical : 'standard';
};

const fetchJsonWithTimeout = async (url, options = {}, timeoutMs = NETWORK_TIMEOUT_MS) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    const payload = await response.json().catch(() => ({}));
    return { response, payload };
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error(t('flow.errors.timeoutRetry'));
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
};

const BookCheckoutLuxe = () => {
  const { bookId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const stripeResumeRef = useRef('');
  const autoRecoverInFlightRef = useRef(false);
  const jobMonitorRef = useRef('');
  const [loading, setLoading] = useState(true);
  const [book, setBook] = useState(null);
  const [orderType, setOrderType] = useState('pdf');
  const [quantity, setQuantity] = useState(1);
  const [address, setAddress] = useState(DEFAULT_ADDRESS);
  // Facturation (retour utilisateur, 2026-09-27) : cochee par defaut ("meme
  // que l'adresse de livraison"), decochable pour saisir une adresse a part
  // (ex. entreprise qui livre chez un particulier). Champs distincts de
  // `address` — jamais partages tant que la case reste cochee.
  const [billingSameAsShipping, setBillingSameAsShipping] = useState(true);
  const [billingAddress, setBillingAddress] = useState(DEFAULT_ADDRESS);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState(null);
  const [latestOrder, setLatestOrder] = useState(null);
  // Message de remerciement (retour utilisateur, 2026-09-27) : UNE SEULE
  // FOIS, juste apres le retour de Stripe — jamais a chaque fois qu'on
  // revient consulter le suivi plus tard. Volontairement un simple etat
  // memoire (pas persiste) : un rechargement de page perd le signal "on
  // vient de payer", ce qui est exactement le comportement voulu.
  const [justPaid, setJustPaid] = useState(false);
  // Case CGV (retour utilisateur, 2026-09-28) : c'est elle qui rend
  // opposable l'exclusion du droit de retractation (art. L221-28, voir
  // CGVLuxe.js/§5) — l'acceptation doit etre ECRITE et ANTERIEURE au
  // paiement, jamais deduite implicitement d'un simple clic sur "Payer".
  const [cgvAccepted, setCgvAccepted] = useState(false);
  // Mode production actif ? Decide si "Supprimer cette commande et
  // recommencer" s'affiche (uniquement en mode test, retour utilisateur
  // 2026-10-04 — voir backend/routes/orders.js GET /gelato/status).
  const [gelatoStatus, setGelatoStatus] = useState(null);
  const [deletingOrder, setDeletingOrder] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [pdfJob, setPdfJob] = useState(null);
  const [downloadingKind, setDownloadingKind] = useState('');

  // Prix reel (estimatePrice/computeOrderPricing, backend/routes/orders.js)
  // — plus jamais un calcul local reimplemente : c'est exactement le meme
  // calcul deja utilise par Configuration et par l'Apercu final
  // (BookPreviewFinalLuxe.js), donc jamais 3 prix divergents pour le meme
  // livre. `total` reste 0 tant que la premiere estimation n'est pas revenue
  // plutot que d'afficher un chiffre invente en attendant.
  // shipping ajoute (chantier "tarification dynamique", 2026-09-27, §3 :
  // "ne jamais faire 44,30€ livraison incluse") — deja renvoye par la meme
  // reponse (price-estimate), simplement pas encore lu ici avant ce
  // chantier. `total` incluait DEJA la livraison depuis le meme chantier
  // cote backend ; ce qui change ici, c'est de pouvoir l'AFFICHER a part.
  const [estimate, setEstimate] = useState({ total: 0 });
  useEffect(() => {
    if (!book?.id) return undefined;
    let cancelled = false;
    const charger = () => {
      estimatePrice(book.id, { printFormat: book.print_format, pageCount: book.page_count, type: orderType, quantity })
        .then((result) => {
          if (!cancelled) {
            setEstimate({
              total: result.totalCents, unit: result.unitCents, shipping: result.shippingCents, currency: result.currency
            });
          }
        })
        .catch(() => { if (!cancelled) setEstimate({ total: 0 }); });
    };
    charger();
    // Pays choisi dans l'en-tete (chantier international, 2026-10-02) :
    // avant qu'une commande existe, un changement de pays doit redemander
    // l'estimation dans la nouvelle devise.
    const onCountryChange = () => charger();
    window.addEventListener('bookipix:country-changed', onCountryChange);
    return () => {
      cancelled = true;
      window.removeEventListener('bookipix:country-changed', onCountryChange);
    };
  }, [book?.id, book?.print_format, book?.page_count, orderType, quantity]);

  // LES TROIS PRIX, POUR LES AFFICHER DEVANT LES TROIS PRODUITS.
  // Meme source que le prix facture (estimatePrice -> computeOrderPricing) :
  // on demande simplement les trois, a l'unite. Le total dependant de la
  // quantite reste calcule par le serveur dans `estimate` ci-dessus — on ne
  // multiplie rien ici, pour ne pas reimplementer un second calcul de prix.
  const [pricesByType, setPricesByType] = useState({});
  useEffect(() => {
    if (!book?.id) return undefined;
    let cancelled = false;
    const charger = () => {
      Promise.all(['pdf', 'print', 'pack'].map((type) => (
        estimatePrice(book.id, {
          printFormat: book.print_format,
          pageCount: book.page_count,
          type,
          quantity: 1
        })
          .then((result) => [type, Number(result.unitCents)])
          .catch(() => [type, null])
      ))).then((entries) => {
        if (cancelled) return;
        setPricesByType(Object.fromEntries(entries.filter(([, cents]) => Number.isFinite(cents))));
      });
    };
    charger();
    const onCountryChange = () => charger();
    window.addEventListener('bookipix:country-changed', onCountryChange);
    return () => {
      cancelled = true;
      window.removeEventListener('bookipix:country-changed', onCountryChange);
    };
  }, [book?.id, book?.print_format, book?.page_count]);

  // COMMANDER EXIGE UN COMPTE — ET LE DIRE DOIT MENER QUELQUE PART.
  //
  // POST /api/orders refuse une session anonyme (403 requiresAccount, voir
  // backend/routes/orders.js) : c'est le bon point d'etranglement, sans email
  // l'acheteur ne pourrait ni retrouver sa commande ni la suivre. Mais le
  // message arrivait APRES le clic sur Payer et ne renvoyait nulle part.
  //
  // Deux corrections : on l'annonce sur l'ecran de paiement AVANT le clic, et
  // le bouton emmene vraiment a l'inscription en memorisant ou revenir. La
  // conversion d'une session anonyme garde le MEME identifiant de compte
  // (services/anonymousSession.js) : le livre, les photos et la commande en
  // cours sont donc retrouves tels quels au retour.
  const [anonymousSession, setAnonymousSession] = useState(false);
  useEffect(() => {
    let cancelled = false;
    isCurrentlyAnonymous()
      .then((value) => { if (!cancelled) setAnonymousSession(Boolean(value)); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // L'adresse est verifiee EN PLACE (voir StepPayment/EmailOtpForm) : il n'y
  // a plus de redirection vers une page d'inscription, donc plus de
  // `returnTo` a poser ni de retour a orchestrer. On se contente de prendre
  // acte : la session n'est plus anonyme, et le paiement redevient possible.
  const compteVerifie = useCallback(async (resultat) => {
    setAnonymousSession(false);
    setNotice({
      type: 'success',
      message: Number(resultat?.transferred) > 0
        ? t('flow.notices.addressVerifiedTransferred')
        : t('flow.notices.addressVerified')
    });
  }, []);

  const canOrder = useMemo(
    () => isBookLifecycleAtLeast(getBookLifecycleStatusFromBook(book), 'finalized'),
    [book]
  );
  const stripeTestEnabled = process.env.REACT_APP_STRIPE_ENABLED === '1';
  // Vrai Stripe (argent reel) vs test, pour le libelle du bouton de paiement
  // (retour utilisateur, 2026-10-04 : "il affiche stripe test" alors que la
  // session Stripe ouverte etait deja une vraie cs_live_... — ce libelle
  // etait fige en dur sur "test", meme apres bascule en production reelle
  // depuis /admin). false par defaut (repli prudent tant que l'appel n'a pas
  // repondu) : ne jamais annoncer "argent reel" avant d'en etre sur.
  const [stripeLive, setStripeLive] = useState(false);
  useEffect(() => {
    let annule = false;
    getPaymentMode().then(({ live }) => { if (!annule) setStripeLive(Boolean(live)); });
    return () => { annule = true; };
  }, []);
  const hasPendingPaymentOrder = (
    String(latestOrder?.status || '').toLowerCase() === 'awaiting_payment'
  );
  const checkoutFormLocked = hasPendingPaymentOrder;

  // --- Parcours en 4 ecrans (2026-09-11) -----------------------------------
  // L'etape n'est PAS une navigation libre : elle est derivee de l'etat reel
  // de la commande (voir derivedStep plus bas). `manualStep` ne sert qu'a
  // avancer/reculer AVANT le paiement ; des qu'une commande existe, l'etat
  // reel reprend la main.
  const [manualStep, setManualStep] = useState(0);
  // "Continuer" reste cliquable meme formulaire incomplet (retour
  // utilisateur, 2026-10-04 : un bouton desactive ne disait jamais quel
  // champ manquait) — ce drapeau revele les champs en erreur APRES une
  // tentative, jamais avant. Remis a false en quittant l'etape adresse.
  const [addressAttempted, setAddressAttempted] = useState(false);
  const [tracking, setTracking] = useState(null);
  const [loadingTracking, setLoadingTracking] = useState(false);
  const effectiveOrderType = checkoutFormLocked
    ? String(latestOrder?.type || orderType).toLowerCase()
    : orderType;
  const effectiveTotal = checkoutFormLocked
    ? Number(latestOrder?.total_cents || estimate.total)
    : estimate.total;
  const effectiveQuantity = checkoutFormLocked
    ? Math.max(1, Number(latestOrder?.quantity || quantity || 1))
    : quantity;
  const effectiveUnit = checkoutFormLocked
    ? Number(latestOrder?.unit_cents || estimate.unit || 0)
    : (estimate.unit || 0);
  // Une fois la commande creee, la livraison vient du snapshot FIGE (§18/§19
  // — jamais recalculee), pas d'une nouvelle estimation.
  const effectiveShipping = checkoutFormLocked
    ? Number(latestOrder?.snapshot?.shippingPriceCents ?? estimate.shipping ?? 0)
    : (estimate.shipping || 0);
  // Devise REELLEMENT facturee (chantier international, 2026-10-02) : une
  // fois la commande creee, c'est celle FIGEE sur son snapshot (jamais
  // recalculee, meme principe que shippingPriceCents juste au-dessus) ;
  // avant, celle de la derniere estimation en cours.
  const effectiveCurrency = checkoutFormLocked
    ? (latestOrder?.currency || estimate.currency || 'EUR')
    : (estimate.currency || 'EUR');

  // Etapes affichees : une commande PDF n'a rien a livrer, mais garde quand
  // meme cette etape sous une forme allegee (facturation seule, voir
  // StepAddress.js: billingOnly) — sans ca, aucune identite n'etait jamais
  // collectee et la facture retombait sur un nom devine (retour utilisateur,
  // 2026-10-04).
  const steps = useMemo(() => {
    const list = [{ key: 'product', label: t('flow.steps.product') }];
    list.push({
      key: 'address',
      label: includesPrint(effectiveOrderType) ? t('flow.steps.delivery') : t('flow.steps.billing')
    });
    list.push({ key: 'payment', label: t('flow.steps.payment') });
    list.push({ key: 'tracking', label: t('flow.steps.tracking') });
    return list;
  }, [effectiveOrderType]);

  const addressComplete = useMemo(() => (
    ['fullName', 'line1', 'postalCode', 'city', 'country']
      .every((field) => String(address?.[field] || '').trim().length > 0)
  ), [address]);

  // Meme exigence que l'adresse de livraison. Pour l'impression, seulement
  // quand la case "meme adresse" est decochee — sinon la facturation suit
  // `address` et n'a rien a valider separement. Pour un PDF, ce formulaire
  // EST la seule saisie de l'etape (pas de case a cocher, rien a comparer) :
  // toujours requis.
  const billingComplete = useMemo(() => {
    if (!includesPrint(effectiveOrderType)) {
      return ['fullName', 'line1', 'postalCode', 'city', 'country']
        .every((field) => String(billingAddress?.[field] || '').trim().length > 0);
    }
    return billingSameAsShipping
      || ['fullName', 'line1', 'postalCode', 'city', 'country']
        .every((field) => String(billingAddress?.[field] || '').trim().length > 0);
  }, [effectiveOrderType, billingSameAsShipping, billingAddress]);

  // Etape REELLE : une commande payee renvoie au suivi (sans retour possible),
  // une commande en attente de paiement renvoie a l'ecran paiement. Tant
  // qu'aucune commande n'existe, l'utilisateur avance librement dans les
  // etapes de saisie.
  const derivedStep = useMemo(() => {
    const indexOfKey = (key) => steps.findIndex((step) => step.key === key);
    const status = String(latestOrder?.status || '').toLowerCase();
    if (latestOrder && status !== 'awaiting_payment') return indexOfKey('tracking');
    if (hasPendingPaymentOrder) return indexOfKey('payment');
    return Math.min(manualStep, indexOfKey('payment'));
  }, [latestOrder, hasPendingPaymentOrder, manualStep, steps]);

  const currentStepKey = steps[derivedStep]?.key || 'product';
  const isTrackingStep = currentStepKey === 'tracking';

  useEffect(() => {
    const loadData = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          navigate('/login');
          return;
        }

        const { data: bookData, error: bookError } = await supabase
          .from('books')
          .select('*')
          .eq('id', bookId)
          .eq('owner_id', user.id)
          .single();

        if (bookError || !bookData) {
          throw new Error(t('flow.errors.bookNotFound'));
        }

        setBook(bookData);
        const bookOrders = await listOrdersByBook(bookId).catch(() => []);
        let latestBookOrder = Array.isArray(bookOrders) ? bookOrders[0] : null;

        // RATTRAPER UN PAIEMENT QUE CETTE PAGE N A PAS PU ANNONCER.
        //
        // Le 2026-09-19, un client a paye 94,50 EUR et est retombe sur une
        // page blanche : la commande est restee « en attente de paiement »
        // alors que Stripe avait encaisse. Tant que seule la page de retour
        // annonce le paiement, un onglet ferme trop tot, un reseau qui
        // lache ou un telephone qui se verrouille suffisent a le perdre.
        //
        // Rouvrir la commande suffit maintenant a le retrouver. Le serveur
        // redemande la session a Stripe et n enregistre rien si elle n est
        // pas payee (il repond 409) — donc aucun risque a essayer.
        //
        // Le vrai filet reste le webhook Stripe : lui n a besoin d aucun
        // navigateur. Ceci le complete, ca ne le remplace pas.
        // Pas sur le retour de Stripe lui-meme : cet ecran a deja son
        // propre enchainement (resumeAfterStripe), qui lance en plus la
        // generation du PDF. Deux confirmations en parallele se
        // marcheraient sur les pieds pour rien.
        const retourDeStripe = new URLSearchParams(location.search || '').get('payment') === 'success';
        const sessionEnAttente = !retourDeStripe && String(latestBookOrder?.status || '').toLowerCase() === 'awaiting_payment'
          ? String(latestBookOrder?.metadata?.stripeCheckoutSessionId || '').trim()
          : '';
        if (sessionEnAttente) {
          const rattrapee = await confirmStripePayment(latestBookOrder.id, sessionEnAttente)
            .catch(() => null);
          if (rattrapee) {
            latestBookOrder = rattrapee;
            setNotice({
              type: 'success',
              message: t('flow.notices.paymentRecovered')
            });
          }
        }

        if (latestBookOrder) {
          setLatestOrder(latestBookOrder);
          const recoveredJobId = String(latestBookOrder?.metadata?.pdfJobId || '').trim();
          if (recoveredJobId) {
            const recoveredStatus = latestBookOrder?.status === 'pdf_ready' || latestBookOrder?.metadata?.pdfReady
              ? 'ready'
              : 'rendering';
            setPdfJob({
              jobId: recoveredJobId,
              status: recoveredStatus,
              completedAt: latestBookOrder?.metadata?.pdfCompletedAt || null
            });
          }
        }
      } catch (error) {
        setNotice({ type: 'error', message: error.message });
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [bookId, navigate]);

  useEffect(() => {
    if (!checkoutFormLocked || !latestOrder) {
      return;
    }

    const normalizedType = String(latestOrder?.type || '').toLowerCase();
    if (normalizedType === 'pdf' || normalizedType === 'print' || normalizedType === 'pack') {
      setOrderType(normalizedType);
    }
    setQuantity(Math.max(1, Number(latestOrder?.quantity || 1)));

    if (includesPrint(normalizedType)) {
      const shipping = latestOrder?.shipping_address && typeof latestOrder.shipping_address === 'object'
        ? latestOrder.shipping_address
        : {};
      setAddress((previous) => ({
        ...previous,
        ...shipping
      }));

      // Meme reprise que l'adresse de livraison, pour une commande deja
      // creee (awaiting_payment) rechargee sur cet ecran : voir
      // routes/orders.js, metadata.billingAddress/billingSameAsShipping.
      const sameAsShipping = latestOrder?.metadata?.billingSameAsShipping;
      if (typeof sameAsShipping === 'boolean') setBillingSameAsShipping(sameAsShipping);
      const billing = latestOrder?.metadata?.billingAddress;
      if (billing && typeof billing === 'object') {
        setBillingAddress((previous) => ({ ...previous, ...billing }));
      }
    }
  }, [checkoutFormLocked, latestOrder]);

  // Adresse enregistree dans le compte (Espace client > Mes adresses) :
  // pre-remplissage, jamais un ecrasement.
  //
  // Les deux ecrans etaient jusqu'ici totalement deconnectes : on pouvait
  // enregistrer son adresse dans les parametres sans qu'elle serve jamais a
  // rien, et la saisir a la commande sans qu'elle apparaisse nulle part —
  // "lorsqu'on enregistre une adresse, on la voit pas" (2026-09-14).
  //
  // Priorite absolue a l'adresse de la COMMANDE quand il y en a une (c'est
  // celle que l'utilisateur vient de saisir pour CET envoi) : on ne remplit
  // que les champs encore vides.
  useEffect(() => {
    if (checkoutFormLocked) return;
    let annule = false;
    (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        // L'adresse email du compte pre-remplit le champ quand il y en a une :
        // un utilisateur connecte n'a pas a la retaper.
        const emailCompte = data?.user?.email;
        if (!annule && emailCompte) {
          setAddress((previous) => (previous.email ? previous : { ...previous, email: emailCompte }));
        }
        const enregistree = data?.user?.user_metadata?.shipping_address;
        if (annule || !enregistree || typeof enregistree !== 'object') return;
        setAddress((previous) => {
          const suivant = { ...previous };
          let change = false;
          Object.entries(enregistree).forEach(([champ, valeur]) => {
            if (champ === 'updatedAt' || !valeur) return;
            if (!String(suivant[champ] || '').trim()) { suivant[champ] = valeur; change = true; }
          });
          return change ? suivant : previous;
        });
      } catch (_error) {
        // Jamais bloquant : la saisie manuelle reste le chemin normal.
      }
    })();
    return () => { annule = true; };
  }, [checkoutFormLocked]);

  const setAddressField = (event) => {
    const { name, value } = event.target;
    setAddress((previous) => ({ ...previous, [name]: value }));
  };

  const setBillingAddressField = (event) => {
    const { name, value } = event.target;
    setBillingAddress((previous) => ({ ...previous, [name]: value }));
  };

  const getAuthHeaders = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) {
      throw new Error(t('flow.errors.sessionInvalid'));
    }

    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    };
  };

  // `forceRegenerate` : refabrique le PDF au lieu de renvoyer celui deja
  // produit.
  //
  // Le serveur reutilise le PDF d'un job existant tant qu'il est `ready` —
  // economie legitime, un rendu coute plusieurs minutes. Mais le frontend
  // n'envoyait JAMAIS ce drapeau : une fois un PDF genere, il etait
  // impossible d'en obtenir un autre, meme apres correction du rendu. C'est
  // ce qui a fait croire qu'un defaut de double page persistait alors qu'il
  // etait corrige — on retelechargeait l'ancien fichier (2026-09-15).
  const startPdfExport = async (orderId = '', forceRegenerate = false) => {
    const headers = await getAuthHeaders();
    const normalizedOrderId = String(orderId || '').trim();
    const previewFormat = normalizePreviewFormat(book?.cover_config?.previewFormat);
    const previewLayoutDefaults = PREVIEW_FORMAT_LAYOUT_DEFAULTS[previewFormat]
      || PREVIEW_FORMAT_LAYOUT_DEFAULTS.standard;
    const rawLayoutSettings = (
      book?.cover_config?.previewLayoutSettings
      && typeof book.cover_config.previewLayoutSettings === 'object'
    )
      ? book.cover_config.previewLayoutSettings
      : {};
    const payloadBody = {
      ...(forceRegenerate ? { forceRegenerate: true } : {}),
      previewFormat,
      previewLayoutSettings: {
        textDensity: PREVIEW_TEXT_DENSITY_IDS.has(rawLayoutSettings.textDensity)
          ? rawLayoutSettings.textDensity
          : previewLayoutDefaults.textDensity,
        imageDensity: PREVIEW_IMAGE_DENSITY_IDS.has(rawLayoutSettings.imageDensity)
          ? rawLayoutSettings.imageDensity
          : previewLayoutDefaults.imageDensity,
        lineSpacing: PREVIEW_LINE_SPACING_IDS.has(rawLayoutSettings.lineSpacing)
          ? rawLayoutSettings.lineSpacing
          : 'balanced',
        fontScale: Number.isFinite(Number(rawLayoutSettings.fontScale))
          ? Math.min(1.08, Math.max(0.9, Number(rawLayoutSettings.fontScale)))
          : 1
      }
    };
    if (normalizedOrderId) {
      payloadBody.orderId = normalizedOrderId;
    }
    const { response, payload } = await fetchJsonWithTimeout(
      `${getApiBaseUrl()}/books/${bookId}/export-final-pdf`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(payloadBody)
      },
      PDF_START_TIMEOUT_MS
    );
    if (!response.ok) {
      throw new Error(payload?.error || t('flow.errors.pdfStartFailed'));
    }
    return payload;
  };

  const [regeneratingPdf, setRegeneratingPdf] = useState(false);

  // Refabrique le PDF depuis le livre ACTUEL, en ignorant celui deja produit.
  const handleRegeneratePdf = async () => {
    if (regeneratingPdf) return;
    setRegeneratingPdf(true);
    setNotice(null);
    try {
      const job = await startPdfExportWithRetry(latestOrder?.id || '', 2, true);
      setPdfJob(job);
      setNotice({ type: 'success', message: t('flow.pdfBuilding') });
      await pollPdfJobUntilReady(job.jobId);
    } catch (error) {
      setNotice({ type: 'error', message: error.message });
    } finally {
      setRegeneratingPdf(false);
    }
  };

  const startPdfExportWithRetry = async (orderId, maxAttempts = 4, forceRegenerate = false) => {
    let lastError = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        // eslint-disable-next-line no-await-in-loop
        return await startPdfExport(orderId, forceRegenerate);
      } catch (error) {
        if (isPdfOrderLinkError(error) && orderId) {
          try {
            // eslint-disable-next-line no-await-in-loop
            return await startPdfExport('', forceRegenerate);
          } catch (fallbackError) {
            lastError = fallbackError;
          }
        } else {
          lastError = error;
        }
        const message = String(error?.message || '').toLowerCase();
        const isPaymentPropagationIssue = (
          message.includes('uniquement apres paiement')
          || message.includes('paiement requis')
          || message.includes('commande associee au pdf introuvable')
        );
        if (!isPaymentPropagationIssue || attempt === maxAttempts) {
          break;
        }
        // eslint-disable-next-line no-await-in-loop
        await wait(1200 * attempt);
      }
    }
    throw lastError || new Error(t('flow.errors.pdfStartFailed'));
  };

  const pollPdfJobUntilReady = async (jobId) => {
    const headers = await getAuthHeaders();
    // ~15 min de fenetre. Mesure sur un livre reel de 34 pages en luxe :
    // environ 5 min de rendu en local, davantage sur Render (CPU plus
    // lent). L'ancienne fenetre (80 x 2,5 s = 3 min 20) expirait AVANT la
    // fin : l'utilisateur voyait une erreur alors que le serveur finissait
    // correctement son travail, et relancait un rendu pour rien.
    const maxAttempts = 360;
    const delayMs = 2500;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      // eslint-disable-next-line no-await-in-loop
      const { response, payload } = await fetchJsonWithTimeout(
        `${getApiBaseUrl()}/books/${bookId}/export-final-pdf/${jobId}/status`,
        {
          method: 'GET',
          headers
        },
        // Meme raison que PDF_START_TIMEOUT_MS : le premier sondage peut
        // tomber sur un serveur encore en train de se reveiller.
        PDF_START_TIMEOUT_MS
      );
      if (!response.ok) {
        const errorMessage = String(payload?.error || t('flow.errors.pdfTrackingFailed'));
        const normalizedError = errorMessage.toLowerCase();
        const canRetryOnPaymentPropagation = (
          normalizedError.includes('uniquement apres paiement')
          || normalizedError.includes('paiement requis')
        );
        if (canRetryOnPaymentPropagation && attempt < 10) {
          // eslint-disable-next-line no-await-in-loop
          await wait(delayMs);
          // eslint-disable-next-line no-continue
          continue;
        }
        throw new Error(errorMessage);
      }

      setPdfJob(payload);

      if (payload.status === 'ready') {
        return payload;
      }

      if (payload.status === 'failed') {
        throw new Error(payload.error || t('flow.errors.pdfGenerationFailed'));
      }

      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    // La fabrication N'EST PAS annulee : seul le suivi dans cet onglet
    // s'arrete. Le dire, sinon l'utilisateur relance un rendu de plusieurs
    // minutes alors que le premier va aboutir.
    throw new Error(t('flow.errors.pdfStillWorking'));
  };

  const fetchPdfDownloadBlob = async ({ jobId, kind, headers }) => {
    const response = await fetch(
      `${getApiBaseUrl()}/books/${bookId}/export-final-pdf/${jobId}/download/${kind}`,
      { method: 'GET', headers }
    );

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload?.error || t('flow.errors.downloadFailed'));
    }

    const blob = await response.blob();
    const fallbackName = getPdfFallbackName(kind);
    const disposition = response.headers.get('content-disposition') || '';
    const match = disposition.match(/filename="?([^";]+)"?/i);
    const fileName = match?.[1] || fallbackName;

    return { blob, fileName };
  };


  // TELECHARGER NE DOIT PAS REFABRIQUER LE LIVRE EN CACHETTE.
  //
  // Au premier clic, si le serveur ne retrouvait pas le job, ce bouton
  // relancait une generation ENTIERE et l attendait : plusieurs minutes,
  // bouton fige sur « Telechargement... », sans un mot d explication. Le
  // second clic aboutissait parce que l etat avait ete rafraichi entre
  // temps — d'ou « j'etais oblige de cliquer deux fois » (2026-09-19).
  //
  // Desormais : on relit la commande AVANT (c'est instantane, et c'est ce
  // qui manquait au premier clic), puis on telecharge. Si le fichier a
  // vraiment disparu, on le DIT et on laisse la personne decider de
  // relancer — une attente de plusieurs minutes se demande, elle ne
  // s impose pas.
  const downloadPdfFile = async (kind) => {
    try {
      setDownloadingKind(kind);
      const headers = await getAuthHeaders();

      // La commande en base sait quel fichier est pret ; l onglet, lui,
      // peut porter un identifiant vieux de plusieurs generations.
      let jobIdToUse = latestOrder?.metadata?.pdfJobId || pdfJob?.jobId;
      if (latestOrder?.id) {
        const fraiche = await getOrderById(latestOrder.id).catch(() => null);
        if (fraiche) {
          setLatestOrder(fraiche);
          jobIdToUse = fraiche?.metadata?.pdfJobId || jobIdToUse;
        }
      }

      if (!jobIdToUse) {
        setNotice({
          type: 'warning',
          message: t('flow.errors.noPdfYet')
        });
        return;
      }

      let blobResult;
      try {
        blobResult = await fetchPdfDownloadBlob({ jobId: jobIdToUse, kind, headers });
      } catch (error) {
        if (!isMissingPdfJobError(error)) {
          throw error;
        }
        setNotice({
          type: 'warning',
          message: t('flow.errors.pdfGone')
        });
        return;
      }

      const { blob, fileName } = blobResult;
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      setNotice({ type: 'error', message: error.message });
    } finally {
      setDownloadingKind('');
    }
  };

  // Mode production actif ? Charge une fois, jamais bloquant — en cas
  // d'echec, "Supprimer cette commande et recommencer" reste affiche par
  // defaut (repli cote sans danger : il reste de toute facon protege par
  // les propres garde-fous du serveur, voir DELETE /:orderId).
  useEffect(() => {
    let cancelled = false;
    getGelatoStatus()
      .then((status) => { if (!cancelled) setGelatoStatus(status); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Suivi reel : charge a l'affichage de l'ecran de suivi, rafraichi a la
  // demande, et automatiquement tant que la commande n'est pas dans un etat
  // terminal — jamais de sondage infini.
  const refreshTracking = useCallback(async (orderId) => {
    if (!orderId) return;
    setLoadingTracking(true);
    try {
      const result = await getOrderTracking(orderId);
      setTracking(result);
      if (result?.status && result.status !== latestOrder?.status) {
        setLatestOrder((previous) => (previous ? { ...previous, status: result.status } : previous));
      }
    } catch (_err) {
      // Jamais bloquant : l'ecran affiche le dernier etat connu.
    } finally {
      setLoadingTracking(false);
    }
  }, [latestOrder?.status]);

  useEffect(() => {
    if (!isTrackingStep || !latestOrder?.id) return undefined;
    refreshTracking(latestOrder.id);

    const terminal = ['delivered', 'cancelled', 'failed'];
    if (terminal.includes(String(latestOrder.status || '').toLowerCase())) return undefined;

    // PLUS SOUVENT TANT QU'ON ATTEND L'IMPRIMEUR (2026-09-20).
    //
    // L'envoi a Gelato part tout seul apres le paiement, en tache de fond.
    // Pendant ce temps l'ecran affiche « Transmission en cours… », et une
    // minute de latence pour voir apparaitre le numero de commande donne
    // l'impression que rien ne se passe — c'est exactement ce qui a ete
    // signale (« on ne sait pas que ca a ete envoye »). Une fois le numero
    // connu, l'etat evolue en heures ou en jours : une minute suffit
    // largement, et interroger l'imprimeur plus souvent ne servirait a rien.
    const enAttenteDeLImprimeur = includesPrint(latestOrder.type)
      && !(latestOrder?.metadata?.gelatoOrderId || tracking?.gelatoOrderId);
    const delai = enAttenteDeLImprimeur ? 15000 : 60000;

    const timer = setInterval(() => refreshTracking(latestOrder.id), delai);
    return () => clearInterval(timer);
    // `tracking?.gelatoOrderId` EST une dependance necessaire : sans elle,
    // l'intervalle rapide pose au montage resterait a 15 s pour toujours.
    // Il ne change qu'une fois (absent -> connu), donc pas de re-creation
    // en boucle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTrackingStep, latestOrder?.id, latestOrder?.type, tracking?.gelatoOrderId]);

  // Supprimer la commande pour RECOMMENCER le parcours (2026-09-11, demande
  // utilisateur : pouvoir reessayer un autre type, un autre format, un autre
  // paiement sans rester bloque). C'est la seule facon de revenir a l'ecran 1 :
  // des qu'une commande existe, l'etape est imposee par son etat reel
  // (derivedStep) et la creation d'une nouvelle est verrouillee.
  //
  // Le serveur refuse les cas vraiment irreversibles (commande partie en
  // production, ou payee avec Stripe en mode live) : inutile de dupliquer ce
  // jugement ici, on affiche son message.
  const deleteCurrentOrder = async () => {
    if (!latestOrder?.id || deletingOrder) return;
    const label = latestOrder.order_number ? ` ${latestOrder.order_number}` : '';
    // eslint-disable-next-line no-restricted-globals
    if (!window.confirm(t('flow.reset.confirm', { label }))) return;

    setDeletingOrder(true);
    setDeleteError('');
    try {
      await deleteOrder(latestOrder.id);
      // Remise a zero complete : sans effacer aussi le suivi, l'ecran
      // garderait l'etat de la commande supprimee.
      setLatestOrder(null);
      setTracking(null);
      setManualStep(0);
    } catch (err) {
      setDeleteError(err?.message || t('flow.errors.deleteOrderFailed'));
    } finally {
      setDeletingOrder(false);
    }
  };

  const submitOrder = async () => {
    try {
      setSubmitting(true);
      setNotice(null);

      if (!canOrder) {
        throw new Error(t('flow.errors.bookNotFinalized'));
      }
      if (!stripeTestEnabled) {
        throw new Error(t('flow.errors.stripeDisabled'));
      }
      // Defense en profondeur : le bouton est deja desactive sans la case
      // cochee (voir StepPayment.js), mais un appel direct a cette fonction
      // ne doit jamais pouvoir la contourner.
      if (!cgvAccepted) {
        throw new Error(t('flow.errors.cgvRequired'));
      }

      const createdOrder = await createOrder({
        bookId,
        type: orderType,
        quantity,
        shippingAddress: includesPrint(orderType) ? address : null,
        // "Meme que la livraison" (cochee par defaut, retour utilisateur
        // 2026-09-27) : n'envoie une adresse de facturation DISTINCTE que si
        // la case a ete decochee — sinon le serveur la deduit lui-meme de
        // l'adresse de livraison (voir routes/orders.js). Pour un PDF,
        // `billingAddress` EST la seule saisie de l'etape precedente
        // (StepAddress.js: billingOnly) : toujours envoyee, jamais null
        // (retour utilisateur, 2026-10-04).
        billingAddress: includesPrint(orderType)
          ? (!billingSameAsShipping ? billingAddress : null)
          : billingAddress,
        // Preuve d'acceptation des CGV, ECRITE et ANTERIEURE au paiement
        // (retour utilisateur, 2026-09-28) — c'est elle qui rend opposable
        // l'exclusion du droit de retractation (voir CGVLuxe.js §5).
        cgvAccepted: true
      });

      // L'adresse d'expedition est aussi MEMORISEE sur le compte : elle
      // s'affiche alors dans l'Espace client et pre-remplit la prochaine
      // commande. Silencieux et non bloquant — un echec ici ne doit jamais
      // empecher une commande deja creee d'aller au paiement.
      if (includesPrint(orderType)) {
        // Les autres cles de user_metadata sont recopiees explicitement (meme
        // precaution que AccountSpaceLuxe.saveAddress) : on ne compte pas sur
        // le comportement de fusion du fournisseur d'authentification pour ne
        // pas perdre une donnee de compte.
        supabase.auth.getUser()
          .then(({ data }) => supabase.auth.updateUser({
            data: {
              ...(data?.user?.user_metadata || {}),
              shipping_address: { ...address, updatedAt: new Date().toISOString() }
            }
          }))
          .catch(() => {});
      }

      const checkoutSession = await createStripeCheckoutSession(createdOrder.id);
      if (!checkoutSession?.checkoutUrl) {
        throw new Error(t('flow.errors.stripeOpenFailed'));
      }
      window.location.assign(checkoutSession.checkoutUrl);
      return;
    } catch (error) {
      setNotice({ type: 'error', message: error.message });
      // Refus « compte requis » (onglet reste ouvert, session expiree) : on
      // fait reapparaitre la demande d'adresse, qui vit dans cet ecran.
      if (error?.requiresAccount) {
        setAnonymousSession(true);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const payPendingOrder = async () => {
    try {
      setSubmitting(true);
      setNotice(null);

      if (!stripeTestEnabled) {
        throw new Error(t('flow.errors.stripeDisabled'));
      }
      if (!cgvAccepted) {
        throw new Error(t('flow.errors.cgvRequired'));
      }
      if (!latestOrder?.id || String(latestOrder.status || '').toLowerCase() !== 'awaiting_payment') {
        throw new Error(t('flow.errors.noPendingOrder'));
      }

      const checkoutSession = await createStripeCheckoutSession(latestOrder.id);
      if (!checkoutSession?.checkoutUrl) {
        throw new Error(t('flow.errors.stripeOpenFailed'));
      }
      window.location.assign(checkoutSession.checkoutUrl);
    } catch (error) {
      setNotice({ type: 'error', message: error.message });
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    if (!stripeTestEnabled) {
      return;
    }

    const params = new URLSearchParams(location.search || '');
    const payment = String(params.get('payment') || '').toLowerCase();
    const orderId = params.get('orderId');
    const sessionId = params.get('session_id');
    const resumeKey = `${orderId || ''}:${sessionId || ''}`;

    if (payment === 'cancel') {
      setNotice({ type: 'warning', message: t('flow.notices.paymentCancelled') });
      navigate(`/book/${bookId}/checkout`, { replace: true });
      return;
    }

    if (payment !== 'success' || !orderId || !sessionId || stripeResumeRef.current === resumeKey) {
      return;
    }

    stripeResumeRef.current = resumeKey;

    const resumeAfterStripe = async () => {
      try {
        setSubmitting(true);
        setNotice({ type: 'info', message: t('flow.notices.paymentReceived') });

        let currentOrder = await confirmStripePayment(orderId, sessionId);
        setLatestOrder(currentOrder);
        // Le paiement est confirme des ici : le message de remerciement ne
        // doit pas attendre la fabrication du PDF/l'envoi a l'imprimeur
        // (qui peuvent echouer/prendre du temps) pour s'afficher.
        setJustPaid(true);
        let finalNotice = { type: 'success', message: t('flow.notices.paymentConfirmed') };

        if (includesPdf(currentOrder.type) && ['paid', 'pdf_generating'].includes(currentOrder.status)) {
          if (currentOrder.status === 'paid') {
            currentOrder = await updateOrderStatus(currentOrder.id, 'pdf_generating');
            setLatestOrder(currentOrder);
          }

          let exportJob = null;
          try {
            exportJob = await startPdfExportWithRetry(currentOrder.id);
          } catch (_error) {
            exportJob = null;
          }

          if (exportJob?.jobId) {
            setPdfJob(exportJob);
            currentOrder = await updateOrderStatus(currentOrder.id, 'pdf_generating', {
              pdfJobId: exportJob.jobId,
              pdfRequestedAt: exportJob.createdAt || new Date().toISOString()
            });
            setLatestOrder(currentOrder);
          }

          if (exportJob?.jobId) {
            try {
              const readyJob = await pollPdfJobUntilReady(exportJob.jobId);

              if (includesPrint(currentOrder.type)) {
                currentOrder = await updateOrderStatus(currentOrder.id, 'print_queued', {
                  pdfReady: true,
                  pdfJobId: readyJob.jobId,
                  pdfCompletedAt: readyJob.completedAt || new Date().toISOString()
                });
              } else {
                currentOrder = await updateOrderStatus(currentOrder.id, 'pdf_ready', {
                  pdfReady: true,
                  pdfJobId: readyJob.jobId,
                  pdfCompletedAt: readyJob.completedAt || new Date().toISOString()
                });
              }
              setLatestOrder(currentOrder);
              finalNotice = {
                type: 'success',
                message: t('flow.notices.pdfReady')
              };
            } catch (_pollError) {
              // Retour utilisateur (2026-09-27) : "pas un echec silencieux".
              // pollPdfJobUntilReady() leve pour DEUX raisons tres
              // differentes — un rendu genuinement ECHOUE (le serveur a deja
              // essaye deux fois, voir routes/books.js processPdfExportJob),
              // ou un rendu simplement LENT qui continue de son cote. Le
              // message rassurant "sera disponible sous peu" etait affiche
              // dans les DEUX cas — y compris quand la fabrication avait deja
              // definitivement echoue et ne repartirait jamais toute seule.
              // metadata.pdfError, ecrit par le serveur UNIQUEMENT en cas
              // d'echec reel (jamais pour une simple lenteur), fait la
              // difference de facon fiable.
              const refreshedOrder = await getOrderById(currentOrder.id).catch(() => null);
              if (refreshedOrder) {
                setLatestOrder(refreshedOrder);
              }
              const echecReel = refreshedOrder?.metadata?.pdfError;
              finalNotice = echecReel
                ? { type: 'error', message: t('flow.notices.pdfFailedWithReason', { reason: echecReel }) }
                : { type: 'warning', message: t('flow.pdfBuilding') };
            }
          } else {
            finalNotice = {
              type: 'warning',
              message: t('flow.notices.pdfStartingBackground')
            };
          }
        } else if (includesPrint(currentOrder.type) && currentOrder.status === 'paid') {
          currentOrder = await updateOrderStatus(currentOrder.id, 'print_queued');
          setLatestOrder(currentOrder);
          finalNotice = { type: 'success', message: t('flow.notices.productionStarted') };
        }

        setNotice(finalNotice);
      } catch (error) {
        setNotice({ type: 'error', message: error.message || t('flow.errors.afterStripeGeneric') });
      } finally {
        setSubmitting(false);
        navigate(`/book/${bookId}/checkout`, { replace: true });
      }
    };

    resumeAfterStripe();
  }, [location.search, bookId, navigate, stripeTestEnabled]);

  // ON SURVEILLE LE PDF, PAS LE STATUT DE LA COMMANDE.
  //
  // Cette relecture ne partait qu'au statut `pdf_generating`. Or ce statut
  // n'existe que pour une commande PDF SEULE : sur un « Pack », le statut
  // decrit l'impression et vaut deja `print_queued` ou `sent_to_printer`.
  // La boucle ne demarrait donc jamais, et rien ne venait relire
  // `metadata.pdfReady` — le seul endroit ou vit l'etat du PDF.
  //
  // Resultat signale le 2026-09-25 : le PDF etait bel et bien pret cote
  // serveur (visible dans l'espace admin), et l'ecran de suivi restait
  // indefiniment sur « Assemblage du PDF... ». Rien ne le debloquait, meme
  // en rechargeant la page.
  //
  // La condition porte maintenant sur ce qu'on attend vraiment : une
  // commande payee, qui comporte un PDF, dont le PDF n'est pas encore pret.
  // Elle couvre donc aussi `pdf_generating`, sans cas particulier.
  useEffect(() => {
    if (!latestOrder?.id || !includesPdf(latestOrder.type)) {
      return undefined;
    }
    if (!isOrderPaid(latestOrder.status) || isPdfReady(latestOrder)) {
      return undefined;
    }

    let active = true;
    let timer = null;

    const refreshOrder = async () => {
      try {
        const freshOrder = await getOrderById(latestOrder.id);
        if (!active) return;

        setLatestOrder(freshOrder);
        if (isPdfReady(freshOrder)) {
          setNotice({
            type: 'success',
            message: t('flow.notices.pdfReady')
          });
          return;
        }
        // Une generation qui a echoue ne se debloquera pas toute seule :
        // on arrete de sonder plutot que de tourner indefiniment. Le
        // message d'erreur, lui, est porte par l'ecran de suivi.
        if (freshOrder?.metadata?.pdfError) {
          return;
        }
      } catch (_error) {
        // Silent retry in background
      }

      if (active) {
        timer = setTimeout(refreshOrder, 5000);
      }
    };

    timer = setTimeout(refreshOrder, 4000);

    return () => {
      active = false;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [latestOrder?.id, latestOrder?.status, latestOrder?.type, latestOrder?.metadata?.pdfReady]);

  useEffect(() => {
    if (!latestOrder?.id || !includesPdf(latestOrder.type)) {
      return undefined;
    }

    // Conditionne au PDF lui-meme, pas au statut de la commande : sur un
    // « Pack », ce statut decrit l'impression et a deja pu passer a
    // `sent_to_printer` (voir orderWorkflow.isPdfReady).
    const existingJobId = pdfJobIdOf(latestOrder);
    if (!isOrderPaid(latestOrder.status) || !existingJobId || isPdfReady(latestOrder)) {
      return undefined;
    }

    const monitorKey = `${latestOrder.id}:${existingJobId}:${latestOrder.type}`;
    if (jobMonitorRef.current === monitorKey) {
      return undefined;
    }
    jobMonitorRef.current = monitorKey;

    let active = true;
    const monitorAndRecoverPdfJob = async () => {
      try {
        const readyJob = await pollPdfJobUntilReady(existingJobId);
        if (!active) return;

        const nextStatus = includesPrint(latestOrder.type) ? 'print_queued' : 'pdf_ready';
        const updatedOrder = await updateOrderStatus(latestOrder.id, nextStatus, {
          pdfReady: true,
          pdfJobId: readyJob.jobId,
          pdfCompletedAt: readyJob.completedAt || new Date().toISOString()
        });
        if (!active) return;

        setLatestOrder(updatedOrder);
        setPdfJob(readyJob);
        setNotice({
          type: 'success',
          message: t('flow.notices.pdfReady')
        });
        return;
      } catch (error) {
        if (!active) return;
        if (!isMissingPdfJobError(error)) {
          // Le SUIVI s arrete, pas forcement la fabrication : elle vit dans
          // le serveur, pas dans cet onglet. Sans message, la barre restait
          // figee sur sa derniere valeur sans rien dire (2026-09-16 : «
          // bloque sur 15 / 32 pages » alors que le PDF etait deja pret et
          // l email parti).
          //
          // MAIS (retour utilisateur, 2026-09-27, "pas un echec silencieux") :
          // pollPdfJobUntilReady() leve aussi bien pour un rendu simplement
          // LENT que pour un rendu qui a DEFINITIVEMENT echoue (deux
          // tentatives automatiques deja epuisees cote serveur, voir
          // routes/books.js). Le message rassurant ne doit s'afficher que
          // dans le premier cas — metadata.pdfError (ecrit par le serveur
          // uniquement sur un echec reel) fait la difference de facon fiable.
          const refreshedOrder = await getOrderById(latestOrder.id).catch(() => null);
          if (!active) return;
          if (refreshedOrder) setLatestOrder(refreshedOrder);
          const echecReel = refreshedOrder?.metadata?.pdfError;
          setNotice(echecReel
            ? { type: 'error', message: t('flow.notices.pdfFailedWithReason', { reason: echecReel }) }
            : { type: 'warning', message: t('flow.pdfBuilding') });
          return;
        }
      }

      try {
        setNotice({
          type: 'info',
          message: t('flow.notices.pdfAutoRetrying')
        });
        const restartedJob = await startPdfExportWithRetry(latestOrder.id);
        if (!active) return;

        setPdfJob(restartedJob);
        const updatedOrder = await updateOrderStatus(latestOrder.id, 'pdf_generating', {
          pdfJobId: restartedJob.jobId,
          pdfRequestedAt: restartedJob.createdAt || new Date().toISOString(),
          pdfReady: false
        });
        if (!active) return;

        setLatestOrder(updatedOrder);
        setNotice({
          type: 'warning',
          message: t('flow.pdfBuilding')
        });
      } catch (_restartError) {
        if (!active) return;
        setNotice({
          type: 'warning',
          message: t('flow.notices.pdfPreparing')
        });
      }
    };

    monitorAndRecoverPdfJob();

    return () => {
      active = false;
    };
  }, [latestOrder?.id, latestOrder?.status, latestOrder?.metadata?.pdfJobId, latestOrder?.metadata?.pdfReady, latestOrder?.type]);

  useEffect(() => {
    if (!latestOrder?.id || !includesPdf(latestOrder.type)) {
      return undefined;
    }

    // Meme raison que ci-dessus : c'est l'absence de job ET de PDF pret qui
    // declenche une relance, jamais la valeur d'un statut partage avec
    // l'impression. Payee est la seule condition qui reste sur le statut :
    // on ne fabrique rien avant paiement.
    const status = String(latestOrder.status || '').toLowerCase();
    if (!isOrderPaid(status) || isPdfReady(latestOrder)) {
      return undefined;
    }

    const existingJobId = pdfJobIdOf(latestOrder);
    if (existingJobId) {
      return undefined;
    }

    let active = true;
    let retryTimer = null;
    const resumePendingPdf = async () => {
      if (!active || autoRecoverInFlightRef.current) {
        if (active) {
          retryTimer = setTimeout(resumePendingPdf, 15000);
        }
        return;
      }

      autoRecoverInFlightRef.current = true;
      try {
        setNotice({
          type: 'info',
          message: t('flow.notices.pdfRetryingResume')
        });

        let currentOrder = latestOrder;
        if (status === 'paid') {
          currentOrder = await updateOrderStatus(currentOrder.id, 'pdf_generating');
          if (!active) return;
          setLatestOrder(currentOrder);
        }

        const exportJob = await startPdfExportWithRetry(currentOrder.id, 1);
        if (!active) return;

        setPdfJob(exportJob);
        currentOrder = await updateOrderStatus(currentOrder.id, 'pdf_generating', {
          pdfJobId: exportJob.jobId,
          pdfRequestedAt: exportJob.createdAt || new Date().toISOString()
        });
        if (!active) return;

        setLatestOrder(currentOrder);
        setNotice({
          type: 'warning',
          message: t('flow.pdfBuilding')
        });
      } catch (_error) {
        if (!active) return;
        const errorMessage = String(_error?.message || '').trim();
        setNotice({
          type: 'warning',
          message: errorMessage
            ? t('flow.notices.pdfRetryFailedWithReason', { reason: errorMessage })
            : t('flow.notices.pdfSoon')
        });
      } finally {
        autoRecoverInFlightRef.current = false;
        if (active) {
          retryTimer = setTimeout(resumePendingPdf, 15000);
        }
      }
    };

    resumePendingPdf();

    return () => {
      active = false;
      if (retryTimer) {
        clearTimeout(retryTimer);
      }
    };
  }, [latestOrder?.id, latestOrder?.status, latestOrder?.metadata?.pdfJobId, latestOrder?.metadata?.pdfReady, latestOrder?.type]);

  if (loading) {
    return (
      <div className="orders-page">
        <div className="container-luxe orders-shell">
          <p>{t('flow.loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="orders-page">
      <div className="container-luxe orders-shell">
        {/* En-tete SOBRE (retour utilisateur, 2026-09-30, piste "Commande &
            compte") : plus de bandeau beige repete sur les 4 ecrans du
            parcours — un titre, le livre concerne, deux liens discrets.
            Ni pastille de statut, ni « Prochaine action ». La frise
            d etapes juste en dessous dit deja ou on en est, et mieux :
            « Valide definitivement / Prochaine action: Commander »
            inquietait sans informer (retour utilisateur 2026-09-19). */}
        <header className="orders-hero">
          <div>
            <h1>{t('flow.header.title')}</h1>
            <p>{book?.title || t('flow.bookUntitled')}{book?.page_count ? ` · ${t('flow.pagesCount', { count: book.page_count })}` : ''}</p>
          </div>
          <div className="orders-hero-links">
            <Link to={`/book/${bookId}`} className="orders-hero-link">{t('flow.header.backToBook')}</Link>
            <Link to={`/book/${bookId}/apercu`} className="orders-hero-link">{t('flow.header.preview')}</Link>
            <Link to="/orders" className="orders-hero-link">{t('flow.header.myOrders')}</Link>
          </div>
        </header>

        {/* Frise du parcours : retour en arriere autorise uniquement sur les
            etapes de saisie, et seulement tant qu'aucune commande n'existe. */}
        <OrderSteps
          steps={steps}
          currentStep={derivedStep}
          onGoToStep={latestOrder ? null : setManualStep}
        />

        {notice?.message && (
          <div className={`orders-notice is-${notice.type || 'info'}`}>
            {notice.message}
          </div>
        )}

        {!canOrder && (
          <div className="orders-notice is-warning">
            {t('flow.warnings.bookNotFinalized')}
          </div>
        )}
        {checkoutFormLocked && (
          <div className="orders-notice is-info">
            {t('flow.warnings.orderPendingLocked')}
          </div>
        )}

        {/* Les 4 ecrans du parcours (2026-09-11) : un seul est affiche a la
            fois. La logique reste ici, seuls les blocs d'affichage vivent
            dans checkout/ — voir OrderSteps pour la frise. */}
        <section className="orders-grid">
          {currentStepKey === 'product' && (
            <StepProduct
              orderType={effectiveOrderType}
              onChangeType={(nextType) => {
                // Le jeu de champs de l'etape adresse change avec le type
                // (livraison+facturation pour print/pack, facturation seule
                // pour pdf) : une tentative passee n'a plus de sens.
                setAddressAttempted(false);
                setOrderType(nextType);
              }}
              quantity={effectiveQuantity}
              onChangeQuantity={setQuantity}
              locked={checkoutFormLocked}
              unitCents={effectiveUnit}
              shippingCents={effectiveShipping}
              totalCents={effectiveTotal}
              currency={effectiveCurrency}
              pricesByType={pricesByType}
            />
          )}

          {currentStepKey === 'address' && (
            <StepAddress
              address={address}
              onChangeField={setAddressField}
              locked={checkoutFormLocked}
              incomplete={!addressComplete}
              billingSameAsShipping={billingSameAsShipping}
              onToggleBillingSame={() => setBillingSameAsShipping((previous) => !previous)}
              billingAddress={billingAddress}
              onChangeBillingField={setBillingAddressField}
              billingIncomplete={!billingComplete}
              billingOnly={!includesPrint(effectiveOrderType)}
              showErrors={addressAttempted}
            />
          )}

          {currentStepKey === 'payment' && (
            <StepPayment
              orderType={effectiveOrderType}
              quantity={effectiveQuantity}
              unitCents={effectiveUnit}
              shippingCents={effectiveShipping}
              totalCents={effectiveTotal}
              currency={effectiveCurrency}
              address={address}
              bookTitle={book?.title}
              onPay={hasPendingPaymentOrder ? payPendingOrder : submitOrder}
              submitting={submitting}
              canPay={canOrder}
              stripeEnabled={stripeTestEnabled}
              stripeLive={stripeLive}
              hasPendingPaymentOrder={hasPendingPaymentOrder}
              isAnonymous={anonymousSession}
              onAccountReady={compteVerifie}
              emailPropose={address.email}
              cgvAccepted={cgvAccepted}
              onToggleCgv={() => setCgvAccepted((previous) => !previous)}
            />
          )}

          {currentStepKey === 'tracking' && (
            <StepTracking
              order={latestOrder}
              justPaid={justPaid}
              tracking={tracking}
              loadingTracking={loadingTracking}
              onRefreshTracking={() => refreshTracking(latestOrder?.id)}
              onRegeneratePdf={handleRegeneratePdf}
              regeneratingPdf={regeneratingPdf}
              pdfJob={pdfJob}
              onDownloadPdf={downloadPdfFile}
              downloadingKind={downloadingKind}
            />
          )}

          {/* Navigation entre les ecrans de SAISIE uniquement : une fois la
              commande creee, l'etape est imposee par son etat reel. */}
          {!latestOrder && (
            <div className="orders-step-nav">
              {derivedStep > 0 && (
                <button type="button" className="btn btn-outline" onClick={() => setManualStep(derivedStep - 1)}>
                  {t('flow.nav.back')}
                </button>
              )}
              {currentStepKey !== 'payment' && (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    // Toujours cliquable : un bouton desactive ne disait
                    // jamais quel champ manquait (retour utilisateur,
                    // 2026-10-04). Sur l'etape adresse incomplete, le clic
                    // revele les champs en erreur au lieu d'avancer.
                    if (currentStepKey === 'address') {
                      const complete = includesPrint(effectiveOrderType)
                        ? (addressComplete && billingComplete)
                        : billingComplete;
                      if (!complete) {
                        setAddressAttempted(true);
                        return;
                      }
                    }
                    setManualStep(derivedStep + 1);
                  }}
                >
                  {t('flow.nav.continue')}
                </button>
              )}
            </div>
          )}

          {/* Recommencer : sans ca, une commande existante fige le parcours
              (etape imposee + creation verrouillee) et on ne peut plus
              essayer un autre type, un autre format ni un autre paiement.
              UNIQUEMENT en mode test (retour utilisateur, 2026-10-04) : en
              production, ce raccourci n'a plus de raison d'etre propose
              pour un vrai client — le serveur refuse de toute facon de
              supprimer une commande reellement payee, mais autant ne pas
              montrer un bouton qui n'a plus vocation a servir. */}
          {latestOrder && !gelatoStatus?.liveOrders && (
            <div className="orders-reset-block">
              <button
                type="button"
                className="btn btn-outline is-danger"
                onClick={deleteCurrentOrder}
                disabled={deletingOrder}
              >
                {deletingOrder ? t('flow.reset.submitting') : t('flow.reset.submit')}
              </button>
              <p className="orders-disclaimer">
                {t('flow.reset.note')}
              </p>
              {deleteError && <p className="orders-error">{deleteError}</p>}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default BookCheckoutLuxe;
