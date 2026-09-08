import React, { useEffect, useMemo, useRef, useState } from 'react';
import { listContentItems } from '../../../services/compositionApi';
import '../BookLuxe.css';

// Controle manuel LEGER sur la couverture automatique (coverComposer.js),
// integre directement dans l'atelier (panneau de droite quand on feuillette
// jusqu'a la couverture/4e) — variante allegee de l'ancien
// BookCoverDesignerLuxe.js (qui n'est plus reference depuis la navigation
// principale, voir BookPageLuxe.js) : memes controles de formulaire, memes
// classes CSS .coverlite-*/.cvrmini-* (feuille de style globale, rien a
// deplacer), mais SANS apercu propre — l'atelier a deja son propre apercu
// vivant de la couverture/4e (coverHtml/backCoverHtml dans
// BookAtelierLuxe.js). Pas de FaceTabs/activeFace non plus : la face
// (front/back) est deja determinee par ce que l'utilisateur feuillette,
// passee en prop `face` — meme principe que "naviguer vers une page la
// selectionne pour edition" deja etabli pour les pages interieures.

const PHRASE_MODES = [
  { id: 'auto', label: 'Automatique' },
  { id: 'custom', label: 'Personnalisee' },
  { id: 'none', label: 'Aucune' }
];

// Meme 3 modes pour le kicker (petite ligne au-dessus du titre, ex. "Fin de
// projet") — reutilise directement PHRASE_MODES plutot qu'une copie, les
// libelles/logique sont identiques.
const KICKER_MODES = PHRASE_MODES;

// Doivent rester coherents avec FRONT_COVER_VARIANTS/BACK_COVER_VARIANTS
// (backend/services/composition/{front,back}CoverRenderer.js) — meme
// convention/meme avertissement que l'ancien BookCoverDesignerLuxe.js.
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

const buildInitialState = (book) => {
  const overrides = (book?.cover_overrides && typeof book.cover_overrides === 'object') ? book.cover_overrides : {};
  const closingPhraseMode = ['custom', 'none'].includes(overrides.closingPhraseMode) ? overrides.closingPhraseMode : 'auto';
  const kickerMode = ['custom', 'none'].includes(overrides.kickerMode) ? overrides.kickerMode : 'auto';
  const frontVariant = FRONT_FORMATS.some((format) => format.id === overrides.frontVariant) ? overrides.frontVariant : 'AUTO';
  const backVariant = BACK_FORMATS.some((format) => format.id === overrides.backVariant) ? overrides.backVariant : 'AUTO';

  return {
    // book.title n'est PAS dans cover_overrides (c'est deja une colonne a
    // part entiere, voir handleUpdateBook/coverComposer.js) mais suit le
    // meme cycle de vie "brouillon local -> sauvegarde debounce" que le
    // reste de ce formulaire, pour rester modifiable ici sans repasser par
    // l'onglet Configuration (retour utilisateur).
    title: normalizeText(book?.title),
    frontVariant,
    backVariant,
    frontPhotoId: overrides.frontPhotoId || null,
    subtitle: normalizeText(overrides.subtitle),
    dateLabel: normalizeText(overrides.dateLabel),
    closingPhraseMode,
    closingPhraseText: normalizeText(overrides.closingPhraseText),
    kickerMode,
    kickerText: normalizeText(overrides.kickerText)
  };
};

const getStateSignature = (state) => JSON.stringify(state);

function AtelierCoverPanel({ book, face, onUpdateBook, onSaved }) {
  const [photos, setPhotos] = useState([]);
  const [loadingPhotos, setLoadingPhotos] = useState(true);
  const [formState, setFormState] = useState(() => buildInitialState(book));
  const [savedSignature, setSavedSignature] = useState(() => getStateSignature(buildInitialState(book)));
  const [saveStatus, setSaveStatus] = useState('idle');
  const saveTimeoutRef = useRef(null);

  useEffect(() => {
    const nextState = buildInitialState(book);
    setFormState(nextState);
    setSavedSignature(getStateSignature(nextState));
    setSaveStatus('idle');
  }, [book?.id, book?.cover_overrides, book?.title]);

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

    return () => { cancelled = true; };
  }, [book?.id]);

  const stateSignature = useMemo(() => getStateSignature(formState), [formState]);

  const updateField = (field, value) => {
    setFormState((previous) => ({ ...previous, [field]: value }));
  };

  useEffect(() => {
    if (stateSignature === savedSignature) return undefined;

    setSaveStatus('pending');
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

    saveTimeoutRef.current = setTimeout(async () => {
      setSaveStatus('saving');
      try {
        await onUpdateBook({
          // book.title est une colonne a part (pas cover_overrides) — voir
          // buildInitialState. coverComposer.js retombe deja sur "Livre
          // souvenir" si vide, meme repli que l'onglet Configuration : pas
          // besoin de le reappliquer ici.
          title: formState.title,
          cover_overrides: {
            frontVariant: formState.frontVariant,
            backVariant: formState.backVariant,
            frontPhotoId: formState.frontPhotoId || null,
            subtitle: formState.subtitle,
            dateLabel: formState.dateLabel,
            closingPhraseMode: formState.closingPhraseMode,
            closingPhraseText: formState.closingPhraseText,
            kickerMode: formState.kickerMode,
            kickerText: formState.kickerText
          }
        });
        setSavedSignature(stateSignature);
        setSaveStatus('saved');
        if (onSaved) onSaved();
      } catch (_error) {
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
    saved: '✓ Enregistre',
    error: "Erreur d'enregistrement"
  }[saveStatus];

  const showPhotoPicker = formState.frontVariant !== 'COVER_MINIMAL';

  return (
    <aside className="atelier-layout-panel atelier-cover-panel">
      <div className="atelier-layout-panel-head">
        <span className="atelier-layout-panel-title">{face === 'front' ? 'Couverture' : '4e de couverture'}</span>
        {saveStatusLabel && (
          <span className={`atelier-save-status is-${saveStatus === 'error' ? 'error' : saveStatus === 'saved' ? 'saved' : 'saving'}`}>
            {saveStatusLabel}
          </span>
        )}
      </div>

      {face === 'front' ? (
        <>
          {/* Titre du livre : deja modifiable dans Configuration, mais pas
              depuis l'atelier (retour utilisateur) — ajoute ici pour ne
              plus avoir a changer d'onglet en cours de mise en page de la
              couverture. Ecrit directement sur book.title (pas
              cover_overrides, voir buildInitialState), meme colonne que
              Configuration : peu importe l'ecran utilise en dernier. */}
          <div className="coverlite-group">
            <span className="coverlite-group-label">Titre du livre</span>
            <input
              type="text"
              className="input-luxe"
              value={formState.title}
              onChange={(event) => updateField('title', event.target.value)}
              placeholder="Ex : Notre ete 2019"
              maxLength={180}
            />
          </div>

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
                      <img src={photo.metadata?.thumbnailUrl || photo.url} alt="" />
                    </button>
                  ))}
                </div>
              )}
              {!loadingPhotos && photos.length === 0 && (
                <p className="coverlite-hint">Ajoutez des photos pour pouvoir en choisir une ici.</p>
              )}
            </div>
          )}

          {/* "Kicker" : petite ligne au-dessus du titre, ex. "Fin de projet"
              — automatiquement tiree de l'occasion choisie a la creation du
              livre, mais restee non modifiable jusqu'ici (retour
              utilisateur : "pareil pour le titre 'fin de projet'"). Meme
              3 etats que la phrase de 4e de couverture (auto/personnalise/
              aucun), mais un simple <select> plutot que 3 boutons cote a
              cote — retour utilisateur : "ca ne sert a rien d'avoir 3
              boutons pour ca" (un reglage secondaire, une ligne au-dessus
              du titre, ne justifiait pas le meme poids visuel que le
              format de couverture ou la phrase de 4e). */}
          <div className="coverlite-group">
            <span className="coverlite-group-label">Libelle au-dessus du titre</span>
            <select
              className="input-luxe"
              value={formState.kickerMode}
              onChange={(event) => updateField('kickerMode', event.target.value)}
            >
              {KICKER_MODES.map((mode) => (
                <option key={mode.id} value={mode.id}>{mode.label}</option>
              ))}
            </select>
            {formState.kickerMode === 'custom' && (
              <input
                type="text"
                className="input-luxe"
                value={formState.kickerText}
                onChange={(event) => updateField('kickerText', event.target.value)}
                placeholder="Ex : Anniversaire de mariage"
                maxLength={60}
              />
            )}
          </div>

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
            {/* <select> plutot que 3 boutons — meme simplification et meme
                raison que le libelle au-dessus du titre plus haut (retour
                utilisateur : "pas besoin de 3 boutons"). */}
            <select
              className="input-luxe"
              value={formState.closingPhraseMode}
              onChange={(event) => updateField('closingPhraseMode', event.target.value)}
            >
              {PHRASE_MODES.map((mode) => (
                <option key={mode.id} value={mode.id}>{mode.label}</option>
              ))}
            </select>
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
    </aside>
  );
}

export default AtelierCoverPanel;
