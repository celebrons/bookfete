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
  listOrdersByBook,
  sendOrderToGelatoTest,
  updateOrderStatus
} from '../../services/ordersApi';
import { estimatePrice } from '../../services/compositionApi';
// formatPriceCents/getOrderStatusConfig ne sont plus utilises ICI : ils ont
// suivi les blocs d'affichage dans checkout/ (StepProduct, StepPayment,
// StepTracking), qui sont desormais seuls responsables du rendu.
import { includesPdf, includesPrint } from '../../utils/orderWorkflow';
import {
  getBookLifecycleStatusFromBook,
  isBookLifecycleAtLeast
} from '../../utils/bookLifecycle';
import {
  getJourneyPrimaryAction,
  getJourneyStatusConfig,
  resolveBookJourneyStatus
} from '../../utils/clientJourney';
import OrderSteps from './checkout/OrderSteps';
import StepProduct from './checkout/StepProduct';
import StepAddress from './checkout/StepAddress';
import StepPayment from './checkout/StepPayment';
import StepTracking from './checkout/StepTracking';
import '../../styles/luxe-theme.css';
import './OrdersLuxe.css';

// Fabriquer un PDF demande plusieurs minutes de rendu haute resolution. Le
// travail se poursuit cote serveur meme si l'onglet est ferme, et un email
// annonce la fin (backend : notifierPdfPret) : on peut donc le dire
// franchement, plutot que de retenir l'utilisateur devant un ecran d'attente.
const MESSAGE_PDF_EN_COURS = 'Votre PDF sera disponible dans quelques minutes. '
  + 'Vous serez informé par email dès qu’il sera prêt : vous pouvez fermer cette page.';

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
      throw new Error('Le serveur met trop de temps a repondre. Reessayez dans quelques instants.');
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
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState(null);
  const [latestOrder, setLatestOrder] = useState(null);
  // Envoi de test a l'imprimeur (Gelato), sans paiement — n'apparait que si
  // le serveur dit que c'est reellement possible (cle API configuree ET
  // mode production desactive). Voir backend/routes/orders.js.
  const [gelatoStatus, setGelatoStatus] = useState(null);
  const [gelatoSending, setGelatoSending] = useState(false);
  const [gelatoProgress, setGelatoProgress] = useState(null);
  const [gelatoResult, setGelatoResult] = useState(null);
  const [gelatoError, setGelatoError] = useState('');
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
  const [estimate, setEstimate] = useState({ total: 0 });
  useEffect(() => {
    if (!book?.id) return undefined;
    let cancelled = false;
    estimatePrice(book.id, { printFormat: book.print_format, pageCount: book.page_count, type: orderType, quantity })
      .then((result) => { if (!cancelled) setEstimate({ total: result.totalCents, unit: result.unitCents }); })
      .catch(() => { if (!cancelled) setEstimate({ total: 0 }); });
    return () => { cancelled = true; };
  }, [book?.id, book?.print_format, book?.page_count, orderType, quantity]);

  const canOrder = useMemo(
    () => isBookLifecycleAtLeast(getBookLifecycleStatusFromBook(book), 'finalized'),
    [book]
  );
  const stripeTestEnabled = process.env.REACT_APP_STRIPE_ENABLED === '1';
  const checkoutJourneyStatus = useMemo(
    () => resolveBookJourneyStatus({ book, latestOrder }),
    [book, latestOrder]
  );
  const checkoutJourneyConfig = useMemo(
    () => getJourneyStatusConfig(checkoutJourneyStatus),
    [checkoutJourneyStatus]
  );
  const checkoutJourneyAction = useMemo(
    () => getJourneyPrimaryAction(checkoutJourneyStatus, latestOrder),
    [checkoutJourneyStatus, latestOrder]
  );
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

  // Etapes affichees : l'adresse disparait completement pour une commande
  // PDF (rien a livrer) — jamais une etape grisee qu'on n'atteindra pas.
  const steps = useMemo(() => {
    const list = [{ key: 'product', label: 'Produit' }];
    if (includesPrint(effectiveOrderType)) list.push({ key: 'address', label: 'Livraison' });
    list.push({ key: 'payment', label: 'Paiement' });
    list.push({ key: 'tracking', label: 'Suivi' });
    return list;
  }, [effectiveOrderType]);

  const addressComplete = useMemo(() => (
    ['fullName', 'line1', 'postalCode', 'city', 'country']
      .every((field) => String(address?.[field] || '').trim().length > 0)
  ), [address]);

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
          throw new Error('Livre introuvable');
        }

        setBook(bookData);
        const bookOrders = await listOrdersByBook(bookId).catch(() => []);
        const latestBookOrder = Array.isArray(bookOrders) ? bookOrders[0] : null;
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

  const getAuthHeaders = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) {
      throw new Error('Session invalide. Reconnectez-vous.');
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
      throw new Error(payload?.error || 'Impossible de lancer la generation PDF');
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
      setNotice({ type: 'success', message: MESSAGE_PDF_EN_COURS });
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
    throw lastError || new Error('Impossible de lancer la generation PDF');
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
        const errorMessage = String(payload?.error || 'Erreur pendant le suivi PDF');
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
        throw new Error(payload.error || 'La generation PDF a echoue');
      }

      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    // La fabrication N'EST PAS annulee : seul le suivi dans cet onglet
    // s'arrete. Le dire, sinon l'utilisateur relance un rendu de plusieurs
    // minutes alors que le premier va aboutir.
    throw new Error(
      'La fabrication prend plus de temps que prevu. Elle continue de notre cote : '
      + 'vous recevrez un email des que le PDF sera pret.'
    );
  };

  const fetchPdfDownloadBlob = async ({ jobId, kind, headers }) => {
    const response = await fetch(
      `${getApiBaseUrl()}/books/${bookId}/export-final-pdf/${jobId}/download/${kind}`,
      { method: 'GET', headers }
    );

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload?.error || 'Telechargement impossible');
    }

    const blob = await response.blob();
    const fallbackName = getPdfFallbackName(kind);
    const disposition = response.headers.get('content-disposition') || '';
    const match = disposition.match(/filename="?([^";]+)"?/i);
    const fileName = match?.[1] || fallbackName;

    return { blob, fileName };
  };

  const recoverPdfJobForDownload = async () => {
    const currentOrder = latestOrder;
    if (!currentOrder?.id || !includesPdf(currentOrder.type)) {
      throw new Error('Commande PDF introuvable');
    }

    setNotice({
      type: 'info',
      message: 'Le job PDF a expire. Regeneration en cours...'
    });

    let workingOrder = currentOrder;
    if (String(workingOrder.status || '').toLowerCase() === 'paid') {
      workingOrder = await updateOrderStatus(workingOrder.id, 'pdf_generating');
      setLatestOrder(workingOrder);
    }

    const restartedJob = await startPdfExportWithRetry(workingOrder.id, 2);
    setPdfJob(restartedJob);

    workingOrder = await updateOrderStatus(workingOrder.id, 'pdf_generating', {
      pdfJobId: restartedJob.jobId,
      pdfRequestedAt: restartedJob.createdAt || new Date().toISOString(),
      pdfReady: false
    });
    setLatestOrder(workingOrder);

    const readyJob = await pollPdfJobUntilReady(restartedJob.jobId);
    const nextStatus = includesPrint(workingOrder.type) ? 'print_queued' : 'pdf_ready';
    const completedOrder = await updateOrderStatus(workingOrder.id, nextStatus, {
      pdfReady: true,
      pdfJobId: readyJob.jobId,
      pdfCompletedAt: readyJob.completedAt || new Date().toISOString()
    });

    setLatestOrder(completedOrder);
    setPdfJob(readyJob);
    setNotice({
      type: 'success',
      message: 'PDF regenere. Le telechargement demarre.'
    });

    return readyJob.jobId;
  };

  const downloadPdfFile = async (kind) => {
    const initialJobId = latestOrder?.metadata?.pdfJobId || pdfJob?.jobId;
    if (!initialJobId) {
      setNotice({
        type: 'warning',
        message: 'Aucun job PDF disponible. Regeneration automatique en cours...'
      });
    }

    try {
      setDownloadingKind(kind);
      const headers = await getAuthHeaders();
      let jobIdToUse = initialJobId;
      if (!jobIdToUse) {
        jobIdToUse = await recoverPdfJobForDownload();
      }

      let blobResult;
      try {
        blobResult = await fetchPdfDownloadBlob({ jobId: jobIdToUse, kind, headers });
      } catch (error) {
        if (!isMissingPdfJobError(error)) {
          throw error;
        }
        const recoveredJobId = await recoverPdfJobForDownload();
        blobResult = await fetchPdfDownloadBlob({ jobId: recoveredJobId, kind, headers });
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

  // Statut Gelato (cle API presente ? mode production actif ?) — charge une
  // fois, jamais bloquant : en cas d'echec, le bloc d'envoi de test reste
  // simplement masque.
  useEffect(() => {
    let cancelled = false;
    getGelatoStatus()
      .then((status) => { if (!cancelled) setGelatoStatus(status); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // L'envoi est ASYNCHRONE cote serveur (la generation du fichier prend
  // plusieurs minutes : ~15 s par page en haute resolution). On relit donc
  // la commande jusqu'a voir le resultat arriver dans ses metadonnees —
  // meme principe que le suivi d'export PDF deja en place plus bas.
  const pollGelatoTestResult = async (orderId) => {
    const deadline = Date.now() + 15 * 60 * 1000; // large : un livre epais peut etre long
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 6000));
      try {
        const fresh = await getOrderById(orderId);
        const meta = fresh?.metadata || {};
        // Progression REELLE ecrite par le serveur au fil du rendu (phase +
        // pages rendues / total) — voir backend/routes/orders.js.
        if (meta.gelatoProgress) setGelatoProgress(meta.gelatoProgress);
        if (meta.gelatoOrderId) {
          setGelatoResult({ gelatoOrderId: meta.gelatoOrderId, gelatoOrderType: meta.gelatoOrderType || 'draft' });
          return;
        }
        if (meta.gelatoError) {
          setGelatoError(meta.gelatoError);
          return;
        }
      } catch (_err) {
        // Lecture ratee (reveil d'instance, reseau) : on retente au tour suivant.
      }
    }
    setGelatoError("L'envoi est toujours en cours apres 15 minutes. Rechargez la page pour voir ou il en est.");
  };

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

    const timer = setInterval(() => refreshTracking(latestOrder.id), 60000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTrackingStep, latestOrder?.id]);

  const sendToGelatoTest = async () => {
    // gelatoSending garde le BOUTON, mais setGelatoSending est asynchrone :
    // deux clics rapproches partent avant le re-rendu, et le serveur cree
    // alors deux brouillons chez Gelato (constate le 2026-09-17). Cette garde
    // ferme la fenetre cote client ; le serveur a la sienne, independante.
    if (!latestOrder?.id || gelatoSending) return;
    setGelatoSending(true);
    setGelatoError('');
    setGelatoResult(null);
    setGelatoProgress({ phase: 'starting', done: 0, total: 0 });
    try {
      const started = await sendOrderToGelatoTest(latestOrder.id);
      if (started?.status === 'done' || started?.gelatoOrderId) {
        setGelatoResult(started);
        return;
      }
      await pollGelatoTestResult(latestOrder.id);
    } catch (err) {
      setGelatoError(err?.message || "L'envoi de test a l'imprimeur a echoue.");
    } finally {
      setGelatoSending(false);
    }
  };

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
    if (!window.confirm(`Supprimer definitivement la commande${label} et repartir de zero ?`)) return;

    setDeletingOrder(true);
    setDeleteError('');
    try {
      await deleteOrder(latestOrder.id);
      // Remise a zero complete : sans effacer aussi le suivi et les traces de
      // l'envoi Gelato, l'ecran garderait l'etat de la commande supprimee.
      setLatestOrder(null);
      setTracking(null);
      setGelatoResult(null);
      setGelatoError('');
      setGelatoProgress(null);
      setManualStep(0);
    } catch (err) {
      setDeleteError(err?.message || 'Impossible de supprimer cette commande.');
    } finally {
      setDeletingOrder(false);
    }
  };

  const submitOrder = async () => {
    try {
      setSubmitting(true);
      setNotice(null);

      if (!canOrder) {
        throw new Error('Le livre doit etre finalise avant la commande.');
      }
      if (!stripeTestEnabled) {
        throw new Error('Le paiement Stripe doit etre active pour lancer la commande.');
      }

      const createdOrder = await createOrder({
        bookId,
        type: orderType,
        quantity,
        shippingAddress: includesPrint(orderType) ? address : null
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
        throw new Error('Impossible d ouvrir Stripe Checkout');
      }
      window.location.assign(checkoutSession.checkoutUrl);
      return;
    } catch (error) {
      setNotice({ type: 'error', message: error.message });
    } finally {
      setSubmitting(false);
    }
  };

  const payPendingOrder = async () => {
    try {
      setSubmitting(true);
      setNotice(null);

      if (!stripeTestEnabled) {
        throw new Error('Le paiement Stripe doit etre active pour lancer la commande.');
      }
      if (!latestOrder?.id || String(latestOrder.status || '').toLowerCase() !== 'awaiting_payment') {
        throw new Error('Aucune commande en attente de paiement.');
      }

      const checkoutSession = await createStripeCheckoutSession(latestOrder.id);
      if (!checkoutSession?.checkoutUrl) {
        throw new Error('Impossible d ouvrir Stripe Checkout');
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
      setNotice({ type: 'warning', message: 'Paiement annule. Vous pouvez relancer la commande.' });
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
        setNotice({ type: 'info', message: 'Paiement recu. Finalisation de la commande en cours...' });

        let currentOrder = await confirmStripePayment(orderId, sessionId);
        setLatestOrder(currentOrder);
        let finalNotice = { type: 'success', message: 'Paiement confirme. Commande mise a jour.' };

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
                message: 'Paiement valide. Le PDF final est genere et telechargeable.'
              };
            } catch (_pollError) {
              finalNotice = {
                type: 'warning',
                message: MESSAGE_PDF_EN_COURS
              };
              const refreshedOrder = await getOrderById(currentOrder.id).catch(() => null);
              if (refreshedOrder) {
                setLatestOrder(refreshedOrder);
              }
            }
          } else {
            finalNotice = {
              type: 'warning',
              message: 'Paiement valide. La generation PDF demarre en arriere-plan et sera disponible sous peu.'
            };
          }
        } else if (includesPrint(currentOrder.type) && currentOrder.status === 'paid') {
          currentOrder = await updateOrderStatus(currentOrder.id, 'print_queued');
          setLatestOrder(currentOrder);
          finalNotice = { type: 'success', message: 'Paiement valide. Production lancee.' };
        }

        setNotice(finalNotice);
      } catch (error) {
        setNotice({ type: 'error', message: error.message || 'Erreur apres paiement Stripe.' });
      } finally {
        setSubmitting(false);
        navigate(`/book/${bookId}/checkout`, { replace: true });
      }
    };

    resumeAfterStripe();
  }, [location.search, bookId, navigate, stripeTestEnabled]);

  useEffect(() => {
    if (!latestOrder?.id || latestOrder.status !== 'pdf_generating') {
      return undefined;
    }

    let active = true;
    let timer = null;

    const refreshOrder = async () => {
      try {
        const freshOrder = await getOrderById(latestOrder.id);
        if (!active) return;

        setLatestOrder(freshOrder);
        if (freshOrder.status === 'pdf_ready' || freshOrder?.metadata?.pdfReady) {
          setNotice({
            type: 'success',
            message: 'Paiement valide. Le PDF final est genere et telechargeable.'
          });
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
  }, [latestOrder?.id, latestOrder?.status]);

  useEffect(() => {
    if (!latestOrder?.id || !includesPdf(latestOrder.type)) {
      return undefined;
    }

    const status = String(latestOrder.status || '').toLowerCase();
    const existingJobId = String(latestOrder?.metadata?.pdfJobId || '').trim();
    if (status !== 'pdf_generating' || !existingJobId) {
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
          message: 'Paiement valide. Le PDF final est genere et telechargeable.'
        });
        return;
      } catch (error) {
        if (!active) return;
        if (!isMissingPdfJobError(error)) {
          // Le SUIVI s arrete, pas la fabrication : elle vit dans le serveur,
          // pas dans cet onglet. Sans ce message, la barre restait figee sur
          // sa derniere valeur sans rien dire (2026-09-16 : « bloque sur
          // 15 / 32 pages » alors que le PDF etait deja pret et l email
          // parti). L etat de la commande est relu toutes les 5 s par
          // ailleurs : c est lui qui fera disparaitre la barre.
          setNotice({
            type: 'warning',
            message: MESSAGE_PDF_EN_COURS
          });
          return;
        }
      }

      try {
        setNotice({
          type: 'info',
          message: 'Paiement valide. Relance automatique de la generation PDF...'
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
          message: MESSAGE_PDF_EN_COURS
        });
      } catch (_restartError) {
        if (!active) return;
        setNotice({
          type: 'warning',
          message: 'Paiement valide. Le PDF est en cours de preparation. Revenez dans quelques instants.'
        });
      }
    };

    monitorAndRecoverPdfJob();

    return () => {
      active = false;
    };
  }, [latestOrder?.id, latestOrder?.status, latestOrder?.metadata?.pdfJobId, latestOrder?.type]);

  useEffect(() => {
    if (!latestOrder?.id || !includesPdf(latestOrder.type)) {
      return undefined;
    }

    const status = String(latestOrder.status || '').toLowerCase();
    if (!['paid', 'pdf_generating'].includes(status)) {
      return undefined;
    }

    const existingJobId = String(latestOrder?.metadata?.pdfJobId || '').trim();
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
          message: 'Paiement valide. Relance de la generation PDF en cours...'
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
          message: MESSAGE_PDF_EN_COURS
        });
      } catch (_error) {
        if (!active) return;
        const errorMessage = String(_error?.message || '').trim();
        setNotice({
          type: 'warning',
          message: errorMessage
            ? `Paiement valide, mais la relance automatique a echoue: ${errorMessage}`
            : 'Paiement valide. Le PDF sera disponible sous peu.'
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
  }, [latestOrder?.id, latestOrder?.status, latestOrder?.metadata?.pdfJobId, latestOrder?.type]);

  if (loading) {
    return (
      <div className="orders-page">
        <div className="container-luxe orders-shell">
          <p>Chargement du checkout...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="orders-page">
      <div className="container-luxe orders-shell">
        <header className="orders-hero card-luxe">
          <div className="label-gold">Commande</div>
          <h1>Finaliser votre commande</h1>
          <p>
            Livre: <strong>{book?.title || 'Sans titre'}</strong>
          </p>
          <div className="orders-journey">
            <span className={`orders-status-chip ${checkoutJourneyConfig.tone}`}>
              {checkoutJourneyConfig.label}
            </span>
            <span className="orders-journey-next">
              Prochaine action: {checkoutJourneyAction.label}
            </span>
          </div>
          <div className="orders-hero-links">
            <Link to={`/book/${bookId}`} className="btn btn-outline">Retour au livre</Link>
            <Link to="/orders" className="btn btn-outline">Mes commandes</Link>
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
            Ce livre n est pas encore finalise. Terminez l apercu/PDF final avant la commande.
          </div>
        )}
        {checkoutFormLocked && (
          <div className="orders-notice is-info">
            Une commande est deja en attente de paiement. La creation d une nouvelle commande est temporairement bloquee.
          </div>
        )}

        {/* Les 4 ecrans du parcours (2026-09-11) : un seul est affiche a la
            fois. La logique reste ici, seuls les blocs d'affichage vivent
            dans checkout/ — voir OrderSteps pour la frise. */}
        <section className="orders-grid">
          {currentStepKey === 'product' && (
            <StepProduct
              orderType={effectiveOrderType}
              onChangeType={setOrderType}
              quantity={effectiveQuantity}
              onChangeQuantity={setQuantity}
              locked={checkoutFormLocked}
              unitCents={effectiveUnit}
              totalCents={effectiveTotal}
            />
          )}

          {currentStepKey === 'address' && (
            <StepAddress
              address={address}
              onChangeField={setAddressField}
              locked={checkoutFormLocked}
              incomplete={!addressComplete}
            />
          )}

          {currentStepKey === 'payment' && (
            <StepPayment
              orderType={effectiveOrderType}
              quantity={effectiveQuantity}
              unitCents={effectiveUnit}
              totalCents={effectiveTotal}
              address={address}
              bookTitle={book?.title}
              onPay={hasPendingPaymentOrder ? payPendingOrder : submitOrder}
              submitting={submitting}
              canPay={canOrder}
              stripeEnabled={stripeTestEnabled}
              hasPendingPaymentOrder={hasPendingPaymentOrder}
            />
          )}

          {currentStepKey === 'tracking' && (
            <StepTracking
              order={latestOrder}
              tracking={tracking}
              loadingTracking={loadingTracking}
              onRefreshTracking={() => refreshTracking(latestOrder?.id)}
              onRegeneratePdf={handleRegeneratePdf}
              regeneratingPdf={regeneratingPdf}
              pdfJob={pdfJob}
              onDownloadPdf={downloadPdfFile}
              downloadingKind={downloadingKind}
              gelatoTestAvailable={Boolean(gelatoStatus?.testAvailable)}
              gelatoSending={gelatoSending}
              gelatoProgress={gelatoProgress}
              gelatoResult={gelatoResult}
              gelatoError={gelatoError}
              onSendGelatoTest={sendToGelatoTest}
            />
          )}

          {/* Navigation entre les ecrans de SAISIE uniquement : une fois la
              commande creee, l'etape est imposee par son etat reel. */}
          {!latestOrder && (
            <div className="orders-step-nav">
              {derivedStep > 0 && (
                <button type="button" className="btn btn-outline" onClick={() => setManualStep(derivedStep - 1)}>
                  Retour
                </button>
              )}
              {currentStepKey !== 'payment' && (
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={currentStepKey === 'address' && !addressComplete}
                  onClick={() => setManualStep(derivedStep + 1)}
                >
                  Continuer
                </button>
              )}
            </div>
          )}

          {/* Recommencer : sans ca, une commande existante fige le parcours
              (etape imposee + creation verrouillee) et on ne peut plus
              essayer un autre type, un autre format ni un autre paiement. */}
          {latestOrder && (
            <div className="orders-reset-block">
              <button
                type="button"
                className="btn btn-outline is-danger"
                onClick={deleteCurrentOrder}
                disabled={deletingOrder}
              >
                {deletingOrder ? 'Suppression...' : 'Supprimer cette commande et recommencer'}
              </button>
              <p className="orders-disclaimer">
                Supprime aussi les brouillons deposes chez l'imprimeur. Une commande reellement
                payee ou deja partie en production ne peut pas etre supprimee.
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
