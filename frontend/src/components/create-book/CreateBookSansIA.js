import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';
import { listEventTypes, createBook } from '../../services/compositionApi';
import './CreateBookSansIA.css';

const RETURN_TO_KEY = 'returnTo';
const DRAFT_KEY = 'createBookDraftSansIA';

export default function CreateBookSansIA() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [mode, setMode] = useState('solo');
  const [eventTypes, setEventTypes] = useState([]);
  const [title, setTitle] = useState('');
  const [eventType, setEventType] = useState(searchParams.get('event') || '');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    listEventTypes()
      .then((data) => setEventTypes(data.types || []))
      .catch(() => setEventTypes([]));
  }, []);

  // Reprend un brouillon laisse avant un passage par la connexion.
  useEffect(() => {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return;
    try {
      const draft = JSON.parse(raw);
      if (draft.title) setTitle(draft.title);
      if (draft.eventType) setEventType(draft.eventType);
    } catch (_err) {
      // ignore
    } finally {
      localStorage.removeItem(DRAFT_KEY);
    }
  }, []);

  async function handleCreate() {
    if (!title.trim()) {
      setError('Donnez un titre a votre livre pour continuer.');
      return;
    }
    setError('');

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ title, eventType }));
      localStorage.setItem(RETURN_TO_KEY, '/create-book');
      navigate('/login');
      return;
    }

    setCreating(true);
    try {
      const book = await createBook({ title: title.trim(), event_type: eventType || null, collection_mode: 'solo' });
      navigate(`/book/${book.id}/composer`);
    } catch (err) {
      setError(err.message || 'Erreur a la creation du livre.');
    } finally {
      setCreating(false);
    }
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
          <div className="ab-step">
            <h2 className="form-title">Créons votre livre</h2>
            <p className="form-intro">Comment souhaitez-vous procéder ?</p>

            <div className="create-mode-grid">
              <button
                type="button"
                className={`ab-select-card${mode === 'solo' ? ' is-selected' : ''}`}
                onClick={() => setMode('solo')}
              >
                <span className="ab-select-title">Solo</span>
                <span className="ab-select-subtitle">Vous ajoutez vous-même vos photos et vos textes.</span>
              </button>
              <button
                type="button"
                className="ab-select-card is-disabled"
                disabled
                title="Bientôt disponible"
              >
                <span className="ab-select-title">Groupe <span className="create-mode-soon">Bientôt disponible</span></span>
                <span className="ab-select-subtitle">Vous invitez vos proches à contribuer via un lien.</span>
              </button>
            </div>

            <p className="form-intro">
              Un titre pour commencer. Vous ajouterez vos photos, vos textes et choisirez le style juste après.
            </p>

            {error ? <div className="wizard-error">{error}</div> : null}

            <div className="form-group">
              <label htmlFor="book-title">Titre du livre</label>
              <input
                id="book-title"
                type="text"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Les 60 ans de Marguerite, Nos vacances en Espagne…"
                autoFocus
              />
            </div>

            {eventTypes.length > 0 && (
              <div className="form-group">
                <label htmlFor="book-occasion">Occasion (facultatif)</label>
                <select
                  id="book-occasion"
                  value={eventType}
                  onChange={(event) => setEventType(event.target.value)}
                >
                  <option value="">— Aucune occasion en particulier —</option>
                  {eventTypes.map((type) => (
                    <option key={type.type_slug} value={type.type_slug}>{type.type_label}</option>
                  ))}
                </select>
              </div>
            )}

            <button type="button" className="btn btn-primary" onClick={handleCreate} disabled={creating}>
              {creating ? 'Création…' : 'Créer mon livre'}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
