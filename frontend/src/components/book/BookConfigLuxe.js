import React, { useEffect, useMemo, useRef, useState } from 'react';
import BookWorkspaceHeader from './BookWorkspaceHeader';
import TemplateMiniPreview from './TemplateMiniPreview';
import { listTemplates, composeBook, fetchCoverPreviewHtml } from '../../services/compositionApi';
import './BookLuxe.css';
import '../../styles/luxe-theme.css';

// Centre de controle du STYLE du livre uniquement (direction artistique,
// book_templates) + un resume de la couverture (jamais editee ici).
//
// FORMAT (Livret/Standard/Luxe) et PAGINATION ont demenage a l'Apercu final
// (BookPreviewFinalLuxe.js, route /book/:bookId/apercu) : dans le nouveau
// parcours JE CREE -> JE VERIFIE -> J'ACHETE, ce sont des choix de PRODUIT
// (avec prix associe), pas des choix de contenu — les garder ici EN PLUS
// aurait cree deux endroits pour regler les memes champs, source d'erreurs.
// Le prix n'apparait donc plus du tout sur cet ecran (voir cahier des
// charges : "le prix n'apparait qu'a l'etape finale").
//
// Tout changement se sauvegarde automatiquement (debounce court, comme
// BookCoverDesignerLuxe.js) — jamais de bouton "Valider". L'apercu (recto/
// verso, contenu reel) est reconstruit specifiquement pour cet ecran plutot
// que partage avec BookCoverDesignerLuxe.js : ce dernier fonctionne deja et
// n'a aucune couverture de tests frontend, un refactor partage serait un
// risque de regression non detectable pour un gain cosmetique.

const SAVE_DEBOUNCE_MS = 700;

const buildInitialState = (book) => ({
  title: book?.title || '',
  template_id: book?.template_id || null
});

const getStateSignature = (state) => JSON.stringify(state);

// "Automatique"/"Personnalise" : jamais le detail exact du choix (pas de
// duplication de la liste des formats de couverture ici, deja definie et
// entretenue dans BookCoverDesignerLuxe.js) — juste de quoi confirmer que
// rien ici ne l'a jamais touche.
const coverChoiceLabel = (variant) => (variant && variant !== 'AUTO' ? 'Personnalise' : 'Automatique');

const BookConfigLuxe = ({ book, onUpdateBook, bookTitle = '', onOpenTab }) => {
  const [formData, setFormData] = useState(() => buildInitialState(book));
  const [savedSignature, setSavedSignature] = useState(() => getStateSignature(buildInitialState(book)));
  const [saveStatus, setSaveStatus] = useState('idle'); // idle | pending | saving | saved | error

  const [templates, setTemplates] = useState([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);

  const [activeFace, setActiveFace] = useState('front');
  const [previewHtmlByFace, setPreviewHtmlByFace] = useState({ front: null, back: null });
  const [previewError, setPreviewError] = useState('');
  const [loadingPreview, setLoadingPreview] = useState(true);

  const [recomposing, setRecomposing] = useState(false);
  const [recomposeMessage, setRecomposeMessage] = useState('');

  const saveTimeoutRef = useRef(null);

  useEffect(() => {
    const nextState = buildInitialState(book);
    setFormData(nextState);
    setSavedSignature(getStateSignature(nextState));
    setSaveStatus('idle');
  }, [book?.id, book?.title, book?.template_id]);

  useEffect(() => {
    listTemplates()
      .then((list) => setTemplates(list || []))
      .catch(() => setTemplates([]))
      .finally(() => setLoadingTemplates(false));
  }, []);

  const loadPreview = async () => {
    if (!book?.id) return;
    setLoadingPreview(true);
    setPreviewError('');
    try {
      const [frontHtml, backHtml] = await Promise.all([
        fetchCoverPreviewHtml(book.id, 'front'),
        fetchCoverPreviewHtml(book.id, 'back')
      ]);
      setPreviewHtmlByFace({ front: frontHtml, back: backHtml });
    } catch (error) {
      setPreviewError(error.message || "Apercu indisponible pour le moment.");
    } finally {
      setLoadingPreview(false);
    }
  };

  useEffect(() => {
    loadPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book?.id]);

  const stateSignature = useMemo(() => getStateSignature(formData), [formData]);

  const updateField = (field, value) => {
    setFormData((previous) => ({ ...previous, [field]: value }));
  };

  const buildSavePayload = (state) => ({
    title: state.title.trim() || book?.title || 'Livre souvenir',
    template_id: state.template_id
  });

  // Sauvegarde automatique en direct — meme principe que
  // BookCoverDesignerLuxe.js : un court debounce apres chaque changement,
  // puis rafraichit l'apercu (le Style influence le rendu de la couverture).
  useEffect(() => {
    if (stateSignature === savedSignature) return undefined;

    setSaveStatus('pending');
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

    saveTimeoutRef.current = setTimeout(async () => {
      setSaveStatus('saving');
      try {
        await onUpdateBook(buildSavePayload(formData));
        setSavedSignature(stateSignature);
        setSaveStatus('saved');
        await loadPreview();
      } catch (error) {
        setSaveStatus('error');
      }
    }, SAVE_DEBOUNCE_MS);

    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stateSignature]);

  const saveStatusLabel = {
    idle: '',
    pending: 'Modification en cours...',
    saving: 'Enregistrement...',
    saved: 'Enregistre',
    error: "Erreur d'enregistrement"
  }[saveStatus];

  // Les pages interieures deja composees ne suivent jamais automatiquement
  // un changement de Style (acte explicite, comme dans le composeur) — ce
  // bouton sauvegarde d'abord tout changement en attente (pour ne jamais
  // recomposer avec des valeurs perimees), puis recompose. La pagination
  // recomposee reste celle deja fixee sur le livre (book.page_count) —
  // modifiable depuis l'Apercu final, pas ici.
  const handleRecompose = async () => {
    if (!book?.id || recomposing) return;
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    setRecomposing(true);
    setRecomposeMessage('');
    try {
      if (stateSignature !== savedSignature) {
        setSaveStatus('saving');
        await onUpdateBook(buildSavePayload(formData));
        setSavedSignature(stateSignature);
        setSaveStatus('saved');
      }
      const result = await composeBook(book.id, 0);
      const pageCount = Array.isArray(result.pages) ? result.pages.length : book?.page_count;
      setRecomposeMessage(`Pages interieures recomposees (${pageCount} pages).`);
    } catch (error) {
      setRecomposeMessage(error?.message || 'La recomposition a echoue. Merci de reessayer.');
    } finally {
      setRecomposing(false);
    }
  };

  const selectedTemplate = templates.find((template) => template.id === formData.template_id) || null;
  const activePreviewHtml = previewHtmlByFace[activeFace];

  return (
    <div className="book-config-live">
      <BookWorkspaceHeader
        sectionLabel="Configuration"
        bookTitle={bookTitle || book?.title || 'Livre'}
        activeTab="config"
        onOpenTab={onOpenTab}
        book={book}
        subactions={saveStatusLabel && (
          <span className={`coverlite-save-status is-${saveStatus}`}>{saveStatusLabel}</span>
        )}
      />

      <div className="book-config-live-helper">
        Le style se modifie ici directement — l'apercu reagit instantanement. Le format d'impression,
        la pagination et le prix se choisissent depuis l'Apercu final, une fois votre livre construit
        dans l'atelier. La couverture reste inchangee quel que soit votre choix ; modifiez-la depuis
        son propre onglet.
      </div>

      <div className="book-config-live-grid">
        <section className="book-config-panel">
          <div className="book-config-group">
            <span className="book-config-group-label">Titre du livre</span>
            <input
              type="text"
              className="input-luxe"
              value={formData.title}
              onChange={(event) => updateField('title', event.target.value)}
              placeholder="Titre du livre"
            />
          </div>

          <div className="book-config-group">
            <span className="book-config-group-label">Style (direction artistique)</span>
            {loadingTemplates ? (
              <p className="coverlite-hint">Chargement des styles...</p>
            ) : (
              <div className="book-config-choice-grid">
                {templates.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => updateField('template_id', template.id)}
                    className={`book-config-choice ${formData.template_id === template.id ? 'is-selected' : ''}`}
                  >
                    <TemplateMiniPreview template={template} />
                    <span className="book-config-choice-title">{template.label}</span>
                    <span className="book-config-choice-text">{template.description}</span>
                  </button>
                ))}
              </div>
            )}

            <div className="book-config-recompose-hint">
              <p>
                Un changement de style ne modifie les pages interieures deja composees qu'apres
                recomposition.
              </p>
              <button
                type="button"
                className="btn btn-outline"
                onClick={handleRecompose}
                disabled={recomposing || !formData.template_id || !book?.page_count}
              >
                {recomposing ? 'Recomposition...' : 'Recomposer les pages interieures'}
              </button>
            </div>
            {recomposeMessage && <p className="book-config-recompose-status">{recomposeMessage}</p>}
          </div>

          <div className="book-config-group">
            <span className="book-config-group-label">Couverture</span>
            <div className="book-config-cover-summary">
              <div className="book-config-cover-summary-line">
                <span>Couverture</span>
                <span className="book-config-cover-summary-tag">{coverChoiceLabel(book?.cover_overrides?.frontVariant)}</span>
              </div>
              <div className="book-config-cover-summary-line">
                <span>4e de couverture</span>
                <span className="book-config-cover-summary-tag">{coverChoiceLabel(book?.cover_overrides?.backVariant)}</span>
              </div>
              <button type="button" className="btn btn-outline book-config-cover-btn" onClick={() => onOpenTab?.('chapitres')}>
                Modifier la couverture
              </button>
            </div>
          </div>
        </section>

        <aside className="book-config-preview">
          <div className="coverlite-preview-head">
            <span className="coverlite-group-label">Apercu</span>
            <div className="coverlite-face-tabs">
              <button
                type="button"
                className={`coverlite-face-tab ${activeFace === 'front' ? 'is-active' : ''}`}
                onClick={() => setActiveFace('front')}
              >
                Couverture
              </button>
              <button
                type="button"
                className={`coverlite-face-tab ${activeFace === 'back' ? 'is-active' : ''}`}
                onClick={() => setActiveFace('back')}
              >
                4e de couverture
              </button>
            </div>
          </div>

          {previewError && <div className="wizard-error">{previewError}</div>}

          <div className="coverlite-preview-stage">
            {loadingPreview && !activePreviewHtml && (
              <p className="coverlite-hint coverlite-preview-loading">Chargement de l'apercu...</p>
            )}
            {activePreviewHtml && (
              <iframe
                title={activeFace === 'front' ? 'Apercu de la couverture' : 'Apercu de la 4e de couverture'}
                srcDoc={activePreviewHtml}
                className="coverlite-preview-frame"
              />
            )}
          </div>

          <div className="book-config-preview-price-note">
            {selectedTemplate ? `Style : ${selectedTemplate.label}` : 'Aucun style choisi'}
          </div>
        </aside>
      </div>
    </div>
  );
};

export default BookConfigLuxe;
