import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';
import { createBook, listTemplates } from '../../services/compositionApi';
import { listPrintFormats } from '../../services/ordersApi';
import { ensureSession } from '../../services/anonymousSession';
import './CreateBookSansIA.css';

const RETURN_TO_KEY = 'returnTo';
const DRAFT_KEY = 'createBookDraftSansIA';

// Parcours d'entree, en 2 ou 3 ecrans sur la meme route : type de livre ->
// (collaboratif seulement) pour qui -> FORMAT. Jamais tout sur un seul ecran.
//
// DEUX DECISIONS PRODUIT DU 2026-09-15 :
//
// 1. PLUS DE TITRE ICI. Il etait demande, et obligatoire. C'est l'etape la
//    plus couteuse du parcours pour la moins utile : au moment de creer, on
//    ne sait souvent pas encore comment on va appeler son livre. Le titre se
//    saisit desormais dans l'atelier, au moment de la couverture — la ou on
//    le voit, ou il prend son sens. Le livre se cree sans titre (la colonne
//    l'accepte, et la couverture affiche un libelle de repli).
//
// 2. LE FORMAT SE CHOISIT AVANT L'ATELIER. Il n'est pas cosmetique : il
//    decide de la densite de composition, de la taille reelle des cadres
//    photo — donc de la resolution necessaire — et du prix. Le choisir apres
//    coup revenait a recomposer un livre deja fait. Prix affiche des cet
//    ecran : on doit savoir ce qu'on fabrique.
export default function CreateBookSansIA() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [step, setStep] = useState('type'); // 'type' | 'details' | 'format'
  const [mode, setMode] = useState(null); // 'solo' | 'open'
  const [printFormat, setPrintFormat] = useState(null);
  const [formats, setFormats] = useState([]);
  const [recipientName, setRecipientName] = useState('');
  const [eventDate, setEventDate] = useState('');
  // Occasion : jamais redemandee explicitement (cahier des charges §9) —
  // seulement portee silencieusement si on arrive depuis la grille
  // d'occasions de l'accueil (`?event=mariage`), sinon absente.
  const [eventType] = useState(searchParams.get('event') || '');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  // Premier template actif du catalogue, pose par defaut a la creation : sans
  // template_id, "Passer en mode automatique" (POST /compose, voir
  // routes/composition.js) refuse de composer (422) — un livre doit pouvoir
  // generer automatiquement des sa creation. Modifiable ensuite (Configuration,
  // section Style) — jamais impose de facon definitive. Promesse conservee
  // (pas juste un state) pour que handleCreate() puisse toujours l'attendre,
  // meme si le clic arrive avant que la requete initiale n'ait fini (ex. le
  // chemin d'auto-soumission au retour d'authentification, ci-dessous).
  const defaultTemplatePromiseRef = useRef(null);
  if (!defaultTemplatePromiseRef.current) {
    defaultTemplatePromiseRef.current = listTemplates()
      .then((templates) => templates?.[0]?.id || null)
      .catch(() => null);
  }

  // Catalogue des formats : dimensions reelles et prix de depart, calcules
  // par le serveur avec la MEME formule que le prix facture (voir
  // routes/orders.js GET /formats). Jamais une table recopiee ici, qui
  // finirait par annoncer un prix different de celui paye.
  useEffect(() => {
    let annule = false;
    listPrintFormats()
      .then((data) => {
        if (annule) return;
        setFormats(data?.formats || []);
        setPrintFormat((actuel) => actuel || data?.defaultFormatId || null);
      })
      .catch(() => { /* non bloquant : l'ecran de format affiche alors un repli */ });
    return () => { annule = true; };
  }, []);

  const buildPayload = async (values) => ({
    // Le titre n'est plus demande ici (2026-09-15) : il se saisit dans
    // l'atelier, au moment de la couverture. On envoie une CHAINE VIDE et non
    // null — la colonne books.title est NOT NULL en base, et une migration
    // pour un champ qu'on ne demande justement plus serait disproportionnee.
    // Tous les affichages ont un repli ("Mon livre", "Livre souvenir").
    title: '',
    print_format: values.printFormat,
    event_type: eventType || null,
    collection_mode: values.mode,
    template_id: await defaultTemplatePromiseRef.current,
    // Palier minimum deja etabli ailleurs (generation automatique, voir
    // BookAtelierLuxe.js: MIN_AUTO_PAGES), pose ici pour que l'atelier soit
    // utilisable immediatement (il refuse de s'ouvrir sans page_count) —
    // jamais impose au client : page_count_mode absent = 'auto' par defaut
    // (BookConfigLuxe.js), qui recalculera ce nombre depuis le contenu reel
    // des que l'utilisateur passe par Configuration. 2026-09-09 : 28 (pas
    // 16) — minimum reellement imprimable chez Gelato ; 2026-09-11 : porte a
    // 30, voir backend/services/composition/layoutEngine.js PAGE_COUNT_TIERS.
    page_count: 30,
    ...(values.mode === 'open'
      ? { recipient_name: values.recipientName.trim(), event_date: values.eventDate || null }
      : {})
  });

  async function createAndRedirect(values) {
    setCreating(true);
    setError('');
    try {
      // Droit dans l'atelier : c'est la suite naturelle du parcours
      // (JE CHOISIS -> JE CREE). Passer par le tableau de bord ajoutait un
      // ecran ou l'utilisateur devait re-trouver le livre qu'il venait de
      // creer.
      const livre = await createBook(await buildPayload(values));
      localStorage.removeItem(DRAFT_KEY);
      navigate(livre?.id ? `/book/${livre.id}/atelier` : '/dashboard');
    } catch (err) {
      setError(err.message || 'Erreur a la creation du livre.');
      setCreating(false);
    }
  }

  // Reprend un brouillon laisse avant un passage par la creation de compte —
  // et, nouveau, le soumet automatiquement si une session existe maintenant
  // (retour d'authentification) : c'est ce qui realise "creer automatiquement
  // le livre apres connexion", sans dupliquer la logique de creation.
  useEffect(() => {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return;
    let draft;
    try {
      draft = JSON.parse(raw);
    } catch (_err) {
      localStorage.removeItem(DRAFT_KEY);
      return;
    }

    if (draft.mode) setMode(draft.mode);
    if (draft.printFormat) setPrintFormat(draft.printFormat);
    if (draft.recipientName) setRecipientName(draft.recipientName);
    if (draft.eventDate) setEventDate(draft.eventDate);
    if (draft.mode) setStep(draft.printFormat ? 'format' : 'details');

    // Le format remplace le titre comme condition de reprise : c'est
    // desormais le dernier choix du parcours, donc le signe qu'il etait
    // complet au moment ou l'authentification l'a interrompu.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session && draft.printFormat && draft.mode) {
        createAndRedirect(draft);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function chooseMode(nextMode) {
    setMode(nextMode);
    // En solo, il ne reste PLUS RIEN a demander depuis la suppression du
    // titre : on saute directement au format.
    setStep(nextMode === 'solo' ? 'format' : 'details');
  }

  // Passe a l'ecran du format. Le seul champ encore exige est « pour qui »
  // en mode collaboratif : les proches qui recevront le lien doivent savoir
  // pour qui ils contribuent.
  function goToFormat() {
    if (mode === 'open' && !recipientName.trim()) {
      setError('Dites-nous pour qui est ce livre pour continuer.');
      return;
    }
    setError('');
    setStep('format');
  }

  async function handleCreate() {
    if (!printFormat) {
      setError('Choisissez un format pour continuer.');
      return;
    }
    setError('');

    const values = { mode, printFormat, recipientName, eventDate };

    // Demarrage SANS COMPTE (2026-09-12) : plus aucun mur d'inscription ici.
    // Sans session, on en ouvre une anonyme et on cree le livre tout de
    // suite — le compte sera demande au moment de commander, quand la valeur
    // a deja ete vue. C'est ce qui permet de deposer ses photos et de
    // composer avant de s'engager.
    const { unavailable } = await ensureSession();
    if (unavailable) {
      // Repli sur l'ancien parcours : si la connexion anonyme est
      // indisponible (option desactivee cote Supabase, reseau), on ne bloque
      // pas la creation — on repasse par l'inscription, rien n'est perdu.
      localStorage.setItem(DRAFT_KEY, JSON.stringify(values));
      localStorage.setItem(RETURN_TO_KEY, '/create-book');
      navigate('/register');
      return;
    }

    createAndRedirect(values);
  }

  return (
    <div className="wizard-container create-book-sans-ia">
      <div className="wizard-card">
        <header className="wizard-header">
          <div className="ab-header-top">
            <span className="event-badge">Nouveau livre</span>
          </div>
        </header>

        <section className="wizard-content">
          {step === 'type' && (
            <div className="ab-step">
              <h2 className="form-title">Comment souhaitez-vous créer votre livre ?</h2>

              <div className="create-mode-grid">
                <button type="button" className="ab-select-card" onClick={() => chooseMode('solo')}>
                  <span className="ab-select-title">👤 Mon album</span>
                  <span className="ab-select-subtitle">Je crée mon livre avec mes propres photos et souvenirs.</span>
                </button>
                <button type="button" className="ab-select-card" onClick={() => chooseMode('open')}>
                  <span className="ab-select-title">👥 Album collaboratif</span>
                  <span className="ab-select-subtitle">
                    Je partage un lien et mes proches ajoutent leurs photos et souvenirs.
                  </span>
                </button>
              </div>
            </div>
          )}

          {/* Le mode SOLO n'a plus d'etape "details" : le titre etait son seul
              champ obligatoire, et il a ete retire du parcours (2026-09-15).
              Seul le mode collaboratif garde une question, parce que les
              proches qui recevront le lien doivent savoir pour qui ils
              contribuent. */}
          {step === 'details' && mode === 'open' && (
            <div className="ab-step">
              <button type="button" className="ab-back-link" onClick={() => setStep('type')}>← Changer</button>
              <h2 className="form-title">Pour qui est ce livre ?</h2>

              {error ? <div className="wizard-error">{error}</div> : null}

              <div className="form-group">
                <label htmlFor="book-recipient">Son prénom</label>
                <input
                  id="book-recipient"
                  type="text"
                  value={recipientName}
                  onChange={(event) => setRecipientName(event.target.value)}
                  placeholder="Jean"
                  autoFocus
                />
              </div>

              <div className="form-group">
                <label htmlFor="book-event-date">Date de l'événement (facultatif)</label>
                <input
                  id="book-event-date"
                  type="date"
                  value={eventDate}
                  onChange={(event) => setEventDate(event.target.value)}
                />
              </div>

              <button type="button" className="btn btn-primary" onClick={goToFormat}>
                Continuer
              </button>
            </div>
          )}

          {/* CHOIX DU FORMAT, avant l'atelier.
              Il n'est pas cosmetique : il decide de la densite de composition,
              de la taille reelle des cadres photo — donc de la resolution
              necessaire — et du prix. Le prix vient du serveur, calcule avec
              la meme formule que celui facture a la commande. */}
          {step === 'format' && (
            <div className="ab-step">
              <button
                type="button"
                className="ab-back-link"
                onClick={() => setStep(mode === 'open' ? 'details' : 'type')}
              >
                ← Retour
              </button>
              <h2 className="form-title">Quel format pour votre livre ?</h2>
              <p className="ab-step-hint">
                Le format décide de la taille de votre livre et de la place de vos photos. Vous pourrez en changer
                plus tard.
              </p>

              {error ? <div className="wizard-error">{error}</div> : null}

              <div className="format-choice-grid">
                {formats.map((format) => (
                  <button
                    key={format.formatId}
                    type="button"
                    className={`format-choice-card ${printFormat === format.formatId ? 'is-selected' : ''} ${format.recommande ? 'is-recommended' : ''}`}
                    onClick={() => { setPrintFormat(format.formatId); setError(''); }}
                    aria-pressed={printFormat === format.formatId}
                  >
                    {format.recommande && <span className="format-choice-badge">★ Recommandé</span>}
                    <span className="format-choice-name">{format.nom}</span>
                    <span className="format-choice-size">
                      {Math.round(format.widthMm / 10)} × {Math.round(format.heightMm / 10)} cm
                    </span>
                    <span className="format-choice-pitch">{format.accroche}</span>
                    <span className="format-choice-price">
                      À partir de {(format.startingPriceCents / 100).toFixed(2).replace('.', ',')} €
                      <small>pour {format.minPages} pages</small>
                    </span>
                  </button>
                ))}
              </div>

              {formats.length === 0 && (
                <p className="ab-step-hint">Chargement des formats…</p>
              )}

              <button
                type="button"
                className="btn btn-primary"
                onClick={handleCreate}
                disabled={creating || !printFormat}
              >
                {creating ? 'Création…' : 'Commencer mon livre →'}
              </button>
            </div>
          )}

        </section>
      </div>
    </div>
  );
}
