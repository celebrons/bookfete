import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';
import { createBook, listTemplates } from '../../services/compositionApi';
import './CreateBookSansIA.css';

const RETURN_TO_KEY = 'returnTo';
const DRAFT_KEY = 'createBookDraftSansIA';

// Parcours d'entree (accueil -> choix du type -> infos minimales -> compte)
// en 2 ecrans distincts sur la meme route/le meme composant : d'abord
// UNIQUEMENT le choix Solo/Collaboratif (etape "type"), puis seulement les
// quelques champs necessaires pour ce type (etape "details") — jamais tout
// sur un seul ecran comme avant. Aucun format/prix/pagination ici : ces
// choix arrivent plus tard (Configuration), une fois le livre cree.
export default function CreateBookSansIA() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [step, setStep] = useState('type'); // 'type' | 'details'
  const [mode, setMode] = useState(null); // 'solo' | 'open'
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
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

  const buildPayload = async (values) => ({
    title: values.title.trim(),
    event_type: eventType || null,
    collection_mode: values.mode,
    template_id: await defaultTemplatePromiseRef.current,
    // Palier minimum deja etabli ailleurs (generation automatique, voir
    // BookAtelierLuxe.js: MIN_AUTO_PAGES), pose ici pour que l'atelier soit
    // utilisable immediatement (il refuse de s'ouvrir sans page_count) —
    // jamais impose au client : page_count_mode absent = 'auto' par defaut
    // (BookConfigLuxe.js), qui recalculera ce nombre depuis le contenu reel
    // des que l'utilisateur passe par Configuration.
    page_count: 16,
    ...(values.mode === 'solo' && values.subtitle.trim()
      ? { cover_overrides: { subtitle: values.subtitle.trim() } }
      : {}),
    ...(values.mode === 'open'
      ? { recipient_name: values.recipientName.trim(), event_date: values.eventDate || null }
      : {})
  });

  async function createAndRedirect(values) {
    setCreating(true);
    setError('');
    try {
      await createBook(await buildPayload(values));
      localStorage.removeItem(DRAFT_KEY);
      navigate('/dashboard');
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

    if (draft.title) setTitle(draft.title);
    if (draft.mode) setMode(draft.mode);
    if (draft.subtitle) setSubtitle(draft.subtitle);
    if (draft.recipientName) setRecipientName(draft.recipientName);
    if (draft.eventDate) setEventDate(draft.eventDate);
    if (draft.mode) setStep('details');

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session && draft.title && draft.mode) {
        createAndRedirect(draft);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function chooseMode(nextMode) {
    setMode(nextMode);
    setStep('details');
  }

  async function handleCreate() {
    if (!title.trim()) {
      setError('Donnez un titre a votre livre pour continuer.');
      return;
    }
    if (mode === 'open' && !recipientName.trim()) {
      setError('Dites-nous pour qui est ce livre pour continuer.');
      return;
    }
    setError('');

    const values = { title, mode, subtitle, recipientName, eventDate };

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
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

          {step === 'details' && mode === 'solo' && (
            <div className="ab-step">
              <button type="button" className="ab-back-link" onClick={() => setStep('type')}>← Changer</button>
              <h2 className="form-title">Quel est le titre de votre livre ?</h2>

              {error ? <div className="wizard-error">{error}</div> : null}

              <div className="form-group">
                <label htmlFor="book-title">Titre</label>
                <input
                  id="book-title"
                  type="text"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Les vacances en famille"
                  autoFocus
                />
              </div>

              <div className="form-group">
                <label htmlFor="book-subtitle">Sous-titre (facultatif)</label>
                <input
                  id="book-subtitle"
                  type="text"
                  value={subtitle}
                  onChange={(event) => setSubtitle(event.target.value)}
                  placeholder="facultatif"
                />
              </div>

              <button type="button" className="btn btn-primary" onClick={handleCreate} disabled={creating}>
                {creating ? 'Création…' : 'Commencer mon livre'}
              </button>
            </div>
          )}

          {step === 'details' && mode === 'open' && (
            <div className="ab-step">
              <button type="button" className="ab-back-link" onClick={() => setStep('type')}>← Changer</button>
              <h2 className="form-title">Quel est le titre de votre livre ?</h2>

              {error ? <div className="wizard-error">{error}</div> : null}

              <div className="form-group">
                <label htmlFor="book-title">Titre</label>
                <input
                  id="book-title"
                  type="text"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Les 60 ans de Jean"
                  autoFocus
                />
              </div>

              <div className="form-group">
                <label htmlFor="book-recipient">Pour qui est ce livre ?</label>
                <input
                  id="book-recipient"
                  type="text"
                  value={recipientName}
                  onChange={(event) => setRecipientName(event.target.value)}
                  placeholder="Jean"
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

              <button type="button" className="btn btn-primary" onClick={handleCreate} disabled={creating}>
                {creating ? 'Création…' : 'Créer mon livre'}
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
