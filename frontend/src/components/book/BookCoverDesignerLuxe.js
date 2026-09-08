import React, { useEffect, useMemo, useRef, useState } from 'react';
import { listContentItems, fetchCoverPreviewHtml } from '../../services/compositionApi';
import './BookLuxe.css';
import '../../styles/luxe-theme.css';

// Controle manuel LEGER sur la couverture automatique (coverComposer.js) :
// choisir un FORMAT (parmi une galerie fixe, ou "Automatique"), la photo (ou
// laisser le systeme decider), un sous-titre, une date, et la phrase de 4e
// de couverture. Le theme visuel (palette/typo) reste choisi automatiquement
// (celui du livre) — pas d'editeur complet.
//
// Recto et verso sont deux ecrans distincts (onglets) : chacun n'affiche que
// ce qui le concerne, jamais un formulaire unique melangeant les deux faces.
//
// Apercu : une face a la fois (recto/verso), rendue par le meme moteur que
// le PDF final (renderSinglePageHtml, voir routes/composition.js) dans une
// zone au ratio du format d'impression — la page remplit toujours entierement
// la zone visible, jamais de defilement. Sauvegarde automatique (debounce
// court) a chaque changement : l'apercu suit en direct, sans bouton a
// cliquer. Un bouton "Agrandir" ouvre le meme apercu en grand (lightbox).

const PHRASE_MODES = [
  { id: 'auto', label: 'Automatique' },
  { id: 'custom', label: 'Personnalisee' },
  { id: 'none', label: 'Aucune' }
];

// Galeries de formats : doivent rester coherentes avec FRONT_COVER_VARIANTS
// (backend/services/composition/frontCoverRenderer.js) et
// BACK_COVER_VARIANTS (backend/services/composition/backCoverRenderer.js) —
// toute variante ajoutee/retiree cote backend doit etre repercutee ici. Une
// valeur envoyee ici que le backend ne reconnaitrait plus (desynchronisation
// oubliee) retombe silencieusement sur l'automatique (coverComposer.js),
// jamais une erreur.
const FRONT_FORMATS = [
  { id: 'AUTO', label: 'Automatique' },
  { id: 'COVER_PHOTO', label: 'Photo et bandeau', shape: 'photo-band' },
  { id: 'COVER_PHOTO_TITLE', label: 'Photo pleine page', shape: 'photo-full' },
  { id: 'COVER_MINIMAL', label: 'Texte seul', shape: 'text-only' },
  { id: 'COVER_MULTI_PHOTO', label: 'Trio de photos', shape: 'photo-trio' },
  { id: 'COVER_SPLIT', label: 'Duo cote a cote', shape: 'split' },
  { id: 'COVER_FRAMED', label: 'Photo encadree', shape: 'framed' }
];

const BACK_FORMATS = [
  { id: 'AUTO', label: 'Automatique' },
  { id: 'BACK_MINIMAL', label: 'Phrase seule', shape: 'back-minimal' },
  { id: 'BACK_STATS', label: 'Phrase et chiffres', shape: 'back-stats' },
  { id: 'BACK_PHOTO_STATS', label: 'Photo et chiffres', shape: 'back-photo' }
];

const SAVE_DEBOUNCE_MS = 700;

const normalizeText = (value) => (value === null || value === undefined ? '' : String(value).trim());

// Mini-mockup CSS pour une vignette de la galerie de formats — jamais de
// rendu live couteux ni de vraie photo ici, juste des blocs qui suggerent la
// disposition. Meme esprit que TemplateMiniPreview (BookComposeLuxe.js).
function CoverFormatMiniPreview({ shape }) {
  switch (shape) {
    case 'photo-band':
      return (
        <div className="cvrmini-page">
          <span className="cvrmini-photo" style={{ height: '78%' }} />
          <span className="cvrmini-band" style={{ height: '22%' }}>
            <span className="cvrmini-line" style={{ width: '60%' }} />
          </span>
        </div>
      );
    case 'photo-full':
      return (
        <div className="cvrmini-page">
          <span className="cvrmini-photo cvrmini-photo-bg" />
          <span className="cvrmini-scrim" />
          <span className="cvrmini-line cvrmini-line-on-photo" style={{ width: '55%' }} />
        </div>
      );
    case 'text-only':
      return (
        <div className="cvrmini-page cvrmini-center">
          <span className="cvrmini-line" style={{ width: '70%' }} />
          <span className="cvrmini-rule" />
          <span className="cvrmini-line cvrmini-line-sm" style={{ width: '45%' }} />
        </div>
      );
    case 'photo-trio':
      return (
        <div className="cvrmini-page">
          <span className="cvrmini-photo" style={{ height: '46%' }} />
          <span className="cvrmini-row" style={{ height: '24%' }}>
            <span className="cvrmini-photo" />
            <span className="cvrmini-photo" />
          </span>
          <span className="cvrmini-band" style={{ height: '30%' }}>
            <span className="cvrmini-line" style={{ width: '55%' }} />
          </span>
        </div>
      );
    case 'split':
      return (
        <div className="cvrmini-page cvrmini-row-full">
          <span className="cvrmini-photo" style={{ width: '55%', height: '100%' }} />
          <span className="cvrmini-col">
            <span className="cvrmini-line" style={{ width: '75%' }} />
            <span className="cvrmini-line cvrmini-line-sm" style={{ width: '50%' }} />
          </span>
        </div>
      );
    case 'framed':
      return (
        <div className="cvrmini-page cvrmini-center">
          <span className="cvrmini-photo cvrmini-photo-framed" />
          <span className="cvrmini-line" style={{ width: '55%' }} />
        </div>
      );
    case 'back-minimal':
      return (
        <div className="cvrmini-page cvrmini-center">
          <span className="cvrmini-line cvrmini-line-italic" style={{ width: '65%' }} />
          <span className="cvrmini-dot" />
        </div>
      );
    case 'back-stats':
      return (
        <div className="cvrmini-page cvrmini-center">
          <span className="cvrmini-line cvrmini-line-italic" style={{ width: '65%' }} />
          <span className="cvrmini-stats"><i /><i /><i /></span>
          <span className="cvrmini-dot" />
        </div>
      );
    case 'back-photo':
      return (
        <div className="cvrmini-page cvrmini-center">
          <span className="cvrmini-photo cvrmini-photo-small" />
          <span className="cvrmini-line cvrmini-line-italic" style={{ width: '55%' }} />
          <span className="cvrmini-stats"><i /><i /><i /></span>
        </div>
      );
    default:
      // "Automatique" : deliberement sans forme fixe (le systeme decide).
      return (
        <div className="cvrmini-page cvrmini-auto">
          <span>Auto</span>
        </div>
      );
  }
}

function FormatGallery({ formats, selectedId, onSelect }) {
  return (
    <div className="coverlite-format-grid">
      {formats.map((format) => (
        <button
          key={format.id}
          type="button"
          className={`coverlite-format-option ${selectedId === format.id ? 'is-selected' : ''}`}
          onClick={() => onSelect(format.id)}
        >
          <CoverFormatMiniPreview shape={format.shape} />
          <span className="coverlite-format-label">{format.label}</span>
        </button>
      ))}
    </div>
  );
}

// Onglets recto/verso : partages entre le panneau principal et l'apercu
// plein ecran (meme activeFace, une seule source de verite) pour que les
// deux restent toujours synchronises.
function FaceTabs({ activeFace, onChange }) {
  return (
    <div className="coverlite-face-tabs">
      <button
        type="button"
        className={`coverlite-face-tab ${activeFace === 'front' ? 'is-active' : ''}`}
        onClick={() => onChange('front')}
      >
        Couverture
      </button>
      <button
        type="button"
        className={`coverlite-face-tab ${activeFace === 'back' ? 'is-active' : ''}`}
        onClick={() => onChange('back')}
      >
        4e de couverture
      </button>
    </div>
  );
}

function ExpandIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 9V4h5" />
      <path d="M20 9V4h-5" />
      <path d="M4 15v5h5" />
      <path d="M20 15v5h-5" />
    </svg>
  );
}

const buildInitialState = (book) => {
  const overrides = (book?.cover_overrides && typeof book.cover_overrides === 'object') ? book.cover_overrides : {};
  const closingPhraseMode = ['custom', 'none'].includes(overrides.closingPhraseMode) ? overrides.closingPhraseMode : 'auto';
  const frontVariant = FRONT_FORMATS.some((format) => format.id === overrides.frontVariant) ? overrides.frontVariant : 'AUTO';
  const backVariant = BACK_FORMATS.some((format) => format.id === overrides.backVariant) ? overrides.backVariant : 'AUTO';

  return {
    frontVariant,
    backVariant,
    frontPhotoId: overrides.frontPhotoId || null,
    subtitle: normalizeText(overrides.subtitle),
    dateLabel: normalizeText(overrides.dateLabel),
    closingPhraseMode,
    closingPhraseText: normalizeText(overrides.closingPhraseText)
  };
};

const getStateSignature = (state) => JSON.stringify(state);

const BookCoverDesignerLuxe = ({ book, onUpdateBook }) => {
  const [photos, setPhotos] = useState([]);
  const [loadingPhotos, setLoadingPhotos] = useState(true);
  const [formState, setFormState] = useState(() => buildInitialState(book));
  const [savedSignature, setSavedSignature] = useState(() => getStateSignature(buildInitialState(book)));
  const [saveStatus, setSaveStatus] = useState('idle'); // idle | pending | saving | saved | error
  const [activeFace, setActiveFace] = useState('front');
  const [previewHtmlByFace, setPreviewHtmlByFace] = useState({ front: null, back: null });
  const [previewError, setPreviewError] = useState('');
  const [loadingPreview, setLoadingPreview] = useState(true);
  const [isFullscreenOpen, setIsFullscreenOpen] = useState(false);
  const saveTimeoutRef = useRef(null);

  useEffect(() => {
    const nextState = buildInitialState(book);
    setFormState(nextState);
    setSavedSignature(getStateSignature(nextState));
    setSaveStatus('idle');
  }, [book?.id, book?.cover_overrides]);

  // Apercu plein ecran (bouton "Agrandir") : Echap ou clic hors du panneau
  // pour fermer ; bloque le defilement de la page derriere pendant l'ouverture.
  useEffect(() => {
    if (!isFullscreenOpen) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setIsFullscreenOpen(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isFullscreenOpen]);

  useEffect(() => {
    if (!book?.id) return undefined;
    let cancelled = false;
    setLoadingPhotos(true);

    listContentItems(book.id)
      .then((items) => {
        if (cancelled) return;
        setPhotos((items || []).filter((item) => item.kind === 'photo'));
      })
      .catch(() => {
        if (!cancelled) setPhotos([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingPhotos(false);
      });

    return () => {
      cancelled = true;
    };
  }, [book?.id]);

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

  const stateSignature = useMemo(() => getStateSignature(formState), [formState]);

  const updateField = (field, value) => {
    setFormState((previous) => ({ ...previous, [field]: value }));
  };

  // Sauvegarde automatique en direct : un court debounce apres chaque
  // changement (les champs texte n'enregistrent pas a chaque frappe), puis
  // rafraichit l'apercu — meme moteur de rendu que le PDF final, jamais deux
  // implementations qui pourraient diverger.
  useEffect(() => {
    if (stateSignature === savedSignature) return undefined;

    setSaveStatus('pending');
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

    saveTimeoutRef.current = setTimeout(async () => {
      setSaveStatus('saving');
      try {
        await onUpdateBook({
          cover_overrides: {
            frontVariant: formState.frontVariant,
            backVariant: formState.backVariant,
            frontPhotoId: formState.frontPhotoId || null,
            subtitle: formState.subtitle,
            dateLabel: formState.dateLabel,
            closingPhraseMode: formState.closingPhraseMode,
            closingPhraseText: formState.closingPhraseText
          }
        });
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

  // COVER_MINIMAL est la seule variante qui n'affiche structurellement
  // jamais de photo (frontCoverRenderer.js) : le selecteur de photo n'a de
  // sens que pour les 5 autres formats + Automatique (qui peut choisir un
  // format photo). Sous-titre et date, eux, sont rendus par les 6 variantes
  // sans exception — toujours affiches, quel que soit le format choisi.
  const showPhotoPicker = formState.frontVariant !== 'COVER_MINIMAL';
  const activePreviewHtml = previewHtmlByFace[activeFace];

  return (
    <>
      <div className="coverlite-panel">
        <div className="coverlite-head">
          <div>
            <span className="label-gold">Couverture</span>
            <h3 className="coverlite-title">Personnalisez votre couverture</h3>
            <p className="coverlite-subtitle">
              Choisissez un format parmi la galerie, puis ajustez la photo, le sous-titre, la
              date et la phrase de 4e de couverture — l'apercu se met a jour automatiquement.
            </p>
          </div>
          {saveStatusLabel && (
            <span className={`coverlite-save-status is-${saveStatus}`}>{saveStatusLabel}</span>
          )}
        </div>

        <div className="coverlite-shell">
          <section className="coverlite-form">
            {activeFace === 'front' ? (
              <>
                <div className="coverlite-group">
                  <span className="coverlite-group-label">Format de couverture</span>
                  <FormatGallery
                    formats={FRONT_FORMATS}
                    selectedId={formState.frontVariant}
                    onSelect={(id) => updateField('frontVariant', id)}
                  />
                </div>

                {showPhotoPicker && (
                  <div className="coverlite-group">
                    <span className="coverlite-group-label">Photo de couverture</span>
                    {loadingPhotos ? (
                      <p className="coverlite-hint">Chargement des photos...</p>
                    ) : (
                      <div className="coverlite-photo-grid">
                        <button
                          type="button"
                          className={`coverlite-photo-option is-auto ${!formState.frontPhotoId ? 'is-selected' : ''}`}
                          onClick={() => updateField('frontPhotoId', null)}
                          title="Laisser le systeme choisir la meilleure photo"
                        >
                          <span>Automatique</span>
                        </button>
                        {photos.map((photo) => (
                          <button
                            key={photo.id}
                            type="button"
                            className={`coverlite-photo-option ${formState.frontPhotoId === photo.id ? 'is-selected' : ''}`}
                            onClick={() => updateField('frontPhotoId', photo.id)}
                          >
                            <img src={photo.url} alt="" />
                          </button>
                        ))}
                      </div>
                    )}
                    {!loadingPhotos && photos.length === 0 && (
                      <p className="coverlite-hint">Ajoutez des photos dans le composeur pour pouvoir en choisir une ici.</p>
                    )}
                  </div>
                )}

                <div className="coverlite-group">
                  <span className="coverlite-group-label">Sous-titre (optionnel)</span>
                  <input
                    type="text"
                    className="input-luxe"
                    value={formState.subtitle}
                    onChange={(event) => updateField('subtitle', event.target.value)}
                    placeholder="Ex : Les souvenirs de ceux qui l'aiment"
                    maxLength={220}
                  />
                </div>

                <div className="coverlite-group">
                  <span className="coverlite-group-label">Date (optionnel)</span>
                  <input
                    type="text"
                    className="input-luxe"
                    value={formState.dateLabel}
                    onChange={(event) => updateField('dateLabel', event.target.value)}
                    placeholder="Ex : 2026 ou Ete 2019"
                    maxLength={20}
                  />
                </div>
              </>
            ) : (
              <>
                <div className="coverlite-group">
                  <span className="coverlite-group-label">Format de 4e de couverture</span>
                  <FormatGallery
                    formats={BACK_FORMATS}
                    selectedId={formState.backVariant}
                    onSelect={(id) => updateField('backVariant', id)}
                  />
                </div>

                <div className="coverlite-group">
                  <span className="coverlite-group-label">Phrase de 4e de couverture</span>
                  <div className="coverlite-mode-toggle">
                    {PHRASE_MODES.map((mode) => (
                      <button
                        key={mode.id}
                        type="button"
                        className={`btn btn-outline coverlite-mode-btn ${formState.closingPhraseMode === mode.id ? 'is-selected' : ''}`}
                        onClick={() => updateField('closingPhraseMode', mode.id)}
                      >
                        {mode.label}
                      </button>
                    ))}
                  </div>
                  {formState.closingPhraseMode === 'custom' && (
                    <textarea
                      className="input-luxe coverlite-textarea"
                      value={formState.closingPhraseText}
                      onChange={(event) => updateField('closingPhraseText', event.target.value)}
                      placeholder="Ecrivez votre phrase de cloture..."
                      maxLength={300}
                      rows={3}
                    />
                  )}
                </div>
              </>
            )}
          </section>

          <aside className="coverlite-preview">
            <div className="coverlite-preview-head">
              <span className="coverlite-group-label">Apercu</span>
              <div className="coverlite-preview-controls">
                <FaceTabs activeFace={activeFace} onChange={setActiveFace} />
                <button
                  type="button"
                  className="coverlite-expand-btn"
                  onClick={() => setIsFullscreenOpen(true)}
                  disabled={!activePreviewHtml}
                  title="Voir en plein ecran, taille reelle d'impression"
                >
                  <ExpandIcon />
                  <span>Agrandir</span>
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
          </aside>
        </div>
      </div>

      {isFullscreenOpen && activePreviewHtml && (
        <div className="coverlite-lightbox" onClick={() => setIsFullscreenOpen(false)}>
          <div className="coverlite-lightbox-panel" onClick={(event) => event.stopPropagation()}>
            <div className="coverlite-lightbox-head">
              <FaceTabs activeFace={activeFace} onChange={setActiveFace} />
              <button
                type="button"
                className="coverlite-lightbox-close"
                onClick={() => setIsFullscreenOpen(false)}
                aria-label="Fermer l'apercu plein ecran"
              >
                &times;
              </button>
            </div>
            <div className="coverlite-lightbox-stage">
              <iframe
                title={activeFace === 'front' ? 'Apercu plein ecran de la couverture' : 'Apercu plein ecran de la 4e de couverture'}
                srcDoc={activePreviewHtml}
                className="coverlite-preview-frame"
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default BookCoverDesignerLuxe;
