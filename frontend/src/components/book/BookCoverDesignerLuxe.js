import React, { useEffect, useMemo, useState } from 'react';
import './BookLuxe.css';
import '../../styles/luxe-theme.css';

const COVER_STYLES = [
  {
    id: 'elegance_intemporelle',
    label: 'Elegance intemporelle',
    description: 'Fond lin creme, dorure discrte, sobriete premium.',
    tag: 'Elegance intemporelle',
    titleFont: "'Cormorant Garamond', 'Baskerville', serif",
    bodyFont: "'Inter', sans-serif",
    palette: {
      front: '#f7f1e8',
      back: '#eee4d6',
      text: '#1f2228',
      accent: '#b8924a',
      subtle: '#d8c7a4'
    },
    defaults: {
      frontMotif: 'line',
      frontShowMonogram: true,
      frontShowPhotoFrame: false,
      frontPhotoLabel: 'Motif signature',
      backShowContributors: false,
      backShowQrHint: true,
      backContributorsLine: '',
      backDateLocation: '',
      backOrganizerLine: '',
      backIsbn: 'ISBN 978-2-00000-000-0'
    }
  },
  {
    id: 'modernite_minimaliste',
    label: 'Modernite minimaliste',
    description: 'Noir mat, contraste fort et cadre photo epure.',
    tag: 'Collection moderne',
    titleFont: "'Avenir Next', 'Inter', sans-serif",
    bodyFont: "'Inter', sans-serif",
    palette: {
      front: '#14161a',
      back: '#111318',
      text: '#f4f6fa',
      accent: '#c8d0dc',
      subtle: '#424a56'
    },
    defaults: {
      frontMotif: 'none',
      frontShowMonogram: false,
      frontShowPhotoFrame: true,
      frontPhotoLabel: 'Portrait noir et blanc',
      backShowContributors: true,
      backShowQrHint: true,
      backContributorsLine: 'Contributeurs : famille et amis',
      backDateLocation: '',
      backOrganizerLine: '',
      backIsbn: ''
    }
  },
  {
    id: 'retro_chic',
    label: 'Retro chic',
    description: 'Papier vieilli, grain subtil et tonalite narrative.',
    tag: 'Collection heritage',
    titleFont: "'Garamond', 'Times New Roman', serif",
    bodyFont: "'Inter', sans-serif",
    palette: {
      front: '#f2e6d8',
      back: '#eadac8',
      text: '#3a2e27',
      accent: '#a26d55',
      subtle: '#cda98d'
    },
    defaults: {
      frontMotif: 'corner',
      frontShowMonogram: false,
      frontShowPhotoFrame: true,
      frontPhotoLabel: 'Photo archive',
      backShowContributors: false,
      backShowQrHint: false,
      backContributorsLine: 'Souvenirs choisis par ses proches',
      backDateLocation: '',
      backOrganizerLine: '',
      backIsbn: ''
    }
  },
  {
    id: 'prestige_contemporain',
    label: 'Prestige contemporain',
    description: 'Effet cuir, medaillon central et finitions nobles.',
    tag: 'Edition maison prestige',
    titleFont: "'Cinzel', 'Baskerville', serif",
    bodyFont: "'Inter', sans-serif",
    palette: {
      front: '#2f2432',
      back: '#2a1f2d',
      text: '#f2eadf',
      accent: '#c8a25f',
      subtle: '#6f5a73'
    },
    defaults: {
      frontMotif: 'none',
      frontShowMonogram: true,
      frontShowPhotoFrame: false,
      frontPhotoLabel: '',
      backShowContributors: false,
      backShowQrHint: true,
      backContributorsLine: '',
      backDateLocation: '',
      backOrganizerLine: 'Un livre unique pour une personne unique',
      backIsbn: ''
    }
  },
  {
    id: 'artistique_poetique',
    label: 'Artistique poetique',
    description: 'Aquarelle, composition sensible et ambiance lumineuse.',
    tag: 'Edition atelier',
    titleFont: "'Playfair Display', 'Baskerville', serif",
    bodyFont: "'Inter', sans-serif",
    palette: {
      front: '#edf1f7',
      back: '#e9eef7',
      text: '#243246',
      accent: '#7890b0',
      subtle: '#c6d3e5'
    },
    defaults: {
      frontMotif: 'none',
      frontShowMonogram: false,
      frontShowPhotoFrame: false,
      frontPhotoLabel: '',
      backShowContributors: true,
      backShowQrHint: false,
      backContributorsLine: '',
      backDateLocation: '',
      backOrganizerLine: 'Contributions reunies par l organisateur',
      backIsbn: 'ISBN 978-2-99999-999-9'
    }
  }
];

const STYLE_ID_ALIASES = {
  editorial_classic: 'elegance_intemporelle',
  minimal_contemporary: 'modernite_minimaliste',
  heritage_emotion: 'retro_chic'
};

const DEFAULT_STYLE_ID = 'elegance_intemporelle';

const VISIBLE_COVER_STYLES = COVER_STYLES.filter(
  (style) => !style.legacy
);

const MOTIF_OPTIONS = [
  { id: 'line', label: 'Filet' },
  { id: 'corner', label: 'Coin grave' },
  { id: 'olive_leaf', label: "Feuille d'olivier" },
  { id: 'none', label: 'Sans motif' }
];

const SERIALIZABLE_KEYS = [
  'styleId',
  'frontTitle',
  'frontSubtitle',
  'frontRecipient',
  'frontEventLine',
  'frontMotif',
  'frontShowMonogram',
  'frontShowPhotoFrame',
  'frontPhotoLabel',
  'backBlurb',
  'backQuote',
  'backSignature',
  'backShowContributors',
  'backShowQrHint',
  'backContributorsLine',
  'backDateLocation',
  'backOrganizerLine',
  'backIsbn'
];

const normalizeText = (value) => {
  if (value === null || value === undefined) return '';
  return String(value).trim();
};

const toTitleCase = (value) => {
  const safeValue = normalizeText(value);
  if (!safeValue) return '';
  return safeValue.charAt(0).toUpperCase() + safeValue.slice(1);
};

const getStyleById = (styleId) => {
  const canonicalId = STYLE_ID_ALIASES[normalizeText(styleId)] || normalizeText(styleId);
  return COVER_STYLES.find((style) => style.id === canonicalId)
    || COVER_STYLES.find((style) => style.id === DEFAULT_STYLE_ID)
    || COVER_STYLES[0];
};

const getMonogram = (input) => {
  const words = normalizeText(input)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  if (words.length === 0) {
    return 'LB';
  }

  return words.map((word) => word.charAt(0).toUpperCase()).join('');
};

const normalizeFace = (face) => (face === 'back' ? 'back' : 'front');

const deriveDefaultEventLine = (book) => {
  const eventType = toTitleCase(book?.event_type || '');
  const recipientAge = normalizeText(book?.recipient_age || '');
  if (eventType && recipientAge) {
    return `${eventType} | ${recipientAge} ans`;
  }
  if (eventType) {
    return eventType;
  }
  return '';
};

const buildInitialState = (book) => {
  const coverConfig = book?.cover_config && typeof book.cover_config === 'object'
    ? book.cover_config
    : {};
  const backCoverConfig = book?.back_cover_config && typeof book.back_cover_config === 'object'
    ? book.back_cover_config
    : {};

  const preferredStyle = normalizeText(coverConfig.template || backCoverConfig.template || DEFAULT_STYLE_ID);
  const style = getStyleById(preferredStyle);
  const styleDefaults = style.defaults || {};

  return {
    styleId: style.id,
    frontTitle: normalizeText(coverConfig.title || book?.title || ''),
    frontSubtitle: normalizeText(coverConfig.subtitle || ''),
    frontRecipient: normalizeText(coverConfig.recipientLine || book?.recipient_name || ''),
    frontEventLine: normalizeText(coverConfig.eventLine || deriveDefaultEventLine(book)),
    frontMotif: normalizeText(coverConfig.motif || styleDefaults.frontMotif || 'line'),
    frontShowMonogram: Boolean(
      coverConfig.showMonogram ?? styleDefaults.frontShowMonogram ?? true
    ),
    frontShowPhotoFrame: Boolean(
      coverConfig.showPhotoFrame ?? styleDefaults.frontShowPhotoFrame
    ),
    frontPhotoLabel: normalizeText(
      coverConfig.photoLabel || styleDefaults.frontPhotoLabel || 'Photo'
    ),
    backBlurb: normalizeText(backCoverConfig.blurb || ''),
    backQuote: normalizeText(backCoverConfig.quote || ''),
    backSignature: normalizeText(
      backCoverConfig.signature
      || (book?.recipient_name ? `Les proches de ${book.recipient_name}` : 'Les proches')
    ),
    backShowContributors: Boolean(
      backCoverConfig.show_contributors
      ?? backCoverConfig.showContributors
      ?? styleDefaults.backShowContributors
    ),
    backShowQrHint: Boolean(
      backCoverConfig.showQrHint ?? styleDefaults.backShowQrHint
    ),
    backContributorsLine: normalizeText(
      backCoverConfig.contributorsLine || styleDefaults.backContributorsLine || ''
    ),
    backDateLocation: normalizeText(
      backCoverConfig.dateLocation || styleDefaults.backDateLocation || ''
    ),
    backOrganizerLine: normalizeText(
      backCoverConfig.organizerLine || styleDefaults.backOrganizerLine || ''
    ),
    backIsbn: normalizeText(
      backCoverConfig.isbnCode || styleDefaults.backIsbn || ''
    )
  }
};

const getStateSignature = (state) => JSON.stringify(
  SERIALIZABLE_KEYS.reduce((acc, key) => {
    acc[key] = state?.[key];
    return acc;
  }, {})
);

const BookCoverDesignerLuxe = ({ book, onUpdateBook, initialFace = 'front' }) => {
  const [activeFace, setActiveFace] = useState(() => normalizeFace(initialFace));
  const [formState, setFormState] = useState(() => buildInitialState(book));
  const [baselineSignature, setBaselineSignature] = useState(() => (
    getStateSignature(buildInitialState(book))
  ));
  const [isSaving, setIsSaving] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState(null);
  const [isPreviewExpanded, setIsPreviewExpanded] = useState(false);

  useEffect(() => {
    const nextState = buildInitialState(book);
    setFormState(nextState);
    setBaselineSignature(getStateSignature(nextState));
    setSaveFeedback(null);
  }, [book]);

  useEffect(() => {
    setActiveFace(normalizeFace(initialFace));
  }, [initialFace]);

  useEffect(() => {
    if (!isPreviewExpanded) {
      return undefined;
    }

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setIsPreviewExpanded(false);
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isPreviewExpanded]);

  const selectedStyle = useMemo(
    () => getStyleById(formState.styleId),
    [formState.styleId]
  );

  const stateSignature = useMemo(
    () => getStateSignature(formState),
    [formState]
  );

  const hasPendingChanges = stateSignature !== baselineSignature;
  const selectedPalette = selectedStyle.palette;

  const frontTitlePreview = normalizeText(formState.frontTitle) || normalizeText(book?.title) || 'Titre du livre';
  const frontSubtitlePreview = normalizeText(formState.frontSubtitle) || 'Sous-titre optionnel';
  const frontRecipientPreview = normalizeText(formState.frontRecipient) || normalizeText(book?.recipient_name) || 'Destinataire';
  const frontEventLinePreview = normalizeText(formState.frontEventLine) || 'Edition personnalisable';
  const frontPhotoLabelPreview = normalizeText(formState.frontPhotoLabel) || 'Photo';
  const backBlurbPreview = normalizeText(formState.backBlurb)
    || 'Texte de quatrieme de couverture a definir. Cette zone mettra en valeur la promesse editoriale du livre.';
  const backQuotePreview = normalizeText(formState.backQuote);
  const backSignaturePreview = normalizeText(formState.backSignature) || 'Signature';
  const backContributorsLinePreview = normalizeText(formState.backContributorsLine);
  const backDateLocationPreview = normalizeText(formState.backDateLocation);
  const backOrganizerLinePreview = normalizeText(formState.backOrganizerLine);
  const backIsbnPreview = normalizeText(formState.backIsbn);
  const monogramValue = getMonogram(frontRecipientPreview || frontTitlePreview);

  const updateField = (field, value) => {
    setFormState((previous) => ({
      ...previous,
      [field]: value
    }));

    if (saveFeedback) {
      setSaveFeedback(null);
    }
  };

  const applyStylePreset = (styleId) => {
    const nextStyle = getStyleById(styleId);
    const styleDefaults = nextStyle.defaults || {};
    setFormState((previous) => ({
      ...previous,
      styleId: nextStyle.id,
      frontMotif: styleDefaults.frontMotif || previous.frontMotif || 'line',
      frontShowMonogram: Boolean(styleDefaults.frontShowMonogram),
      frontShowPhotoFrame: Boolean(styleDefaults.frontShowPhotoFrame),
      frontPhotoLabel: normalizeText(previous.frontPhotoLabel || styleDefaults.frontPhotoLabel || 'Photo'),
      backShowContributors: Boolean(styleDefaults.backShowContributors),
      backShowQrHint: Boolean(styleDefaults.backShowQrHint),
      backContributorsLine: normalizeText(previous.backContributorsLine || styleDefaults.backContributorsLine || ''),
      backDateLocation: normalizeText(previous.backDateLocation || styleDefaults.backDateLocation || ''),
      backOrganizerLine: normalizeText(previous.backOrganizerLine || styleDefaults.backOrganizerLine || ''),
      backIsbn: normalizeText(previous.backIsbn || styleDefaults.backIsbn || '')
    }));

    if (saveFeedback) {
      setSaveFeedback(null);
    }
  };

  const buildPayload = () => {
    const nextCoverConfig = {
      ...(book?.cover_config || {}),
      template: formState.styleId,
      title: frontTitlePreview,
      subtitle: normalizeText(formState.frontSubtitle),
      recipientLine: normalizeText(formState.frontRecipient),
      eventLine: normalizeText(formState.frontEventLine),
      motif: normalizeText(formState.frontMotif || 'line'),
      showMonogram: Boolean(formState.frontShowMonogram),
      showPhotoFrame: Boolean(formState.frontShowPhotoFrame),
      photoLabel: normalizeText(formState.frontPhotoLabel),
      color: selectedPalette.front,
      accentColor: selectedPalette.accent,
      textColor: selectedPalette.text,
      font: selectedStyle.titleFont
    };

    const nextBackCoverConfig = {
      ...(book?.back_cover_config || {}),
      template: formState.styleId,
      blurb: normalizeText(formState.backBlurb),
      quote: normalizeText(formState.backQuote),
      signature: normalizeText(formState.backSignature),
      show_contributors: Boolean(formState.backShowContributors),
      showQrHint: Boolean(formState.backShowQrHint),
      contributorsLine: normalizeText(formState.backContributorsLine),
      dateLocation: normalizeText(formState.backDateLocation),
      organizerLine: normalizeText(formState.backOrganizerLine),
      isbnCode: normalizeText(formState.backIsbn),
      color: selectedPalette.back,
      textColor: selectedPalette.text,
      accentColor: selectedPalette.accent,
      font: selectedStyle.bodyFont
    };

    return {
      cover_config: nextCoverConfig,
      back_cover_config: nextBackCoverConfig
    };
  };

  const handleSave = async () => {
    if (!hasPendingChanges || isSaving) {
      return;
    }

    setIsSaving(true);
    setSaveFeedback(null);

    try {
      await onUpdateBook(buildPayload());
      setBaselineSignature(stateSignature);
      setSaveFeedback({
        type: 'success',
        message: 'Couverture et 4e de couverture mises a jour.'
      });
    } catch (error) {
      setSaveFeedback({
        type: 'error',
        message: 'La validation a echoue. Merci de reessayer.'
      });
    } finally {
      setIsSaving(false);
    }
  };

  const renderFrontEditorFields = ({ compact = false } = {}) => (
    <div className={`cover-designer-fields ${compact ? 'is-compact' : ''}`}>
      <div className="cover-designer-group">
        <span className="cover-designer-group-label">Titre et hierarchie</span>
        <div className="cover-field-stack">
          <input
            type="text"
            className="input-luxe"
            value={formState.frontTitle}
            onChange={(event) => updateField('frontTitle', event.target.value)}
            placeholder="Titre principal de la couverture"
          />
          <input
            type="text"
            className="input-luxe"
            value={formState.frontSubtitle}
            onChange={(event) => updateField('frontSubtitle', event.target.value)}
            placeholder="Sous-titre optionnel"
          />
          <input
            type="text"
            className="input-luxe"
            value={formState.frontRecipient}
            onChange={(event) => updateField('frontRecipient', event.target.value)}
            placeholder="Nom ou surnom mis en avant"
          />
          <input
            type="text"
            className="input-luxe"
            value={formState.frontEventLine}
            onChange={(event) => updateField('frontEventLine', event.target.value)}
            placeholder="Contexte (ex: Anniversaire | 40 ans)"
          />
        </div>
      </div>

      <div className="cover-designer-group">
        <span className="cover-designer-group-label">Motif</span>
        <div className="cover-field-stack">
          <select
            className="input-luxe"
            value={formState.frontMotif}
            onChange={(event) => updateField('frontMotif', event.target.value)}
          >
            {MOTIF_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
          <label className="cover-toggle-line">
            <input
              type="checkbox"
              checked={Boolean(formState.frontShowMonogram)}
              onChange={(event) => updateField('frontShowMonogram', event.target.checked)}
            />
            <span>Afficher le monogramme</span>
          </label>
          <label className="cover-toggle-line">
            <input
              type="checkbox"
              checked={Boolean(formState.frontShowPhotoFrame)}
              onChange={(event) => updateField('frontShowPhotoFrame', event.target.checked)}
            />
            <span>Afficher un cadre photo / illustration</span>
          </label>
          {formState.frontShowPhotoFrame && (
            <input
              type="text"
              className="input-luxe"
              value={formState.frontPhotoLabel}
              onChange={(event) => updateField('frontPhotoLabel', event.target.value)}
              placeholder="Legende du cadre (ex: Portrait noir et blanc)"
            />
          )}
        </div>
      </div>
    </div>
  );

  const renderBackEditorFields = ({ compact = false } = {}) => (
    <div className={`cover-designer-fields ${compact ? 'is-compact' : ''}`}>
      <div className="cover-designer-group">
        <span className="cover-designer-group-label">Texte editorial</span>
        <div className="cover-field-stack">
          <textarea
            className="input-luxe cover-textarea"
            value={formState.backBlurb}
            onChange={(event) => updateField('backBlurb', event.target.value)}
            placeholder="Resume premium (500-700 caracteres recommandes)"
          />
          <input
            type="text"
            className="input-luxe"
            value={formState.backQuote}
            onChange={(event) => updateField('backQuote', event.target.value)}
            placeholder="Citation courte optionnelle"
          />
          <input
            type="text"
            className="input-luxe"
            value={formState.backSignature}
            onChange={(event) => updateField('backSignature', event.target.value)}
            placeholder="Signature (ex: Les proches de ...)"
          />
          <input
            type="text"
            className="input-luxe"
            value={formState.backOrganizerLine}
            onChange={(event) => updateField('backOrganizerLine', event.target.value)}
            placeholder="Ligne organisateur ou promesse editoriale"
          />
          <input
            type="text"
            className="input-luxe"
            value={formState.backContributorsLine}
            onChange={(event) => updateField('backContributorsLine', event.target.value)}
            placeholder="Ligne contributeurs (micro-typographie)"
          />
          <input
            type="text"
            className="input-luxe"
            value={formState.backDateLocation}
            onChange={(event) => updateField('backDateLocation', event.target.value)}
            placeholder="Date et lieu (optionnel)"
          />
          <input
            type="text"
            className="input-luxe"
            value={formState.backIsbn}
            onChange={(event) => updateField('backIsbn', event.target.value)}
            placeholder="ISBN factice (optionnel)"
          />
        </div>
      </div>

      <div className="cover-designer-group">
        <span className="cover-designer-group-label">Elements optionnels</span>
        <div className="cover-field-stack">
          <label className="cover-toggle-line">
            <input
              type="checkbox"
              checked={Boolean(formState.backShowContributors)}
              onChange={(event) => updateField('backShowContributors', event.target.checked)}
            />
            <span>Mentionner la participation des contributeurs</span>
          </label>
          <label className="cover-toggle-line">
            <input
              type="checkbox"
              checked={Boolean(formState.backShowQrHint)}
              onChange={(event) => updateField('backShowQrHint', event.target.checked)}
            />
            <span>Afficher un emplacement QR discret</span>
          </label>
        </div>
      </div>
    </div>
  );

  const renderFrontPreviewCard = () => (
    <article
      key="front"
      className={`cover-preview-card is-front cover-style-${formState.styleId} ${activeFace === 'front' ? 'is-active' : ''}`}
      style={{
        '--cover-bg': selectedPalette.front,
        '--cover-text': selectedPalette.text,
        '--cover-accent': selectedPalette.accent,
        '--cover-subtle': selectedPalette.subtle,
        '--cover-title-font': selectedStyle.titleFont,
        '--cover-body-font': selectedStyle.bodyFont
      }}
    >
      <div className="cover-preview-safe-zone" />
      <div className="cover-preview-tag">{selectedStyle.tag}</div>
      {formState.frontShowMonogram && (
        <div className="cover-preview-monogram">{monogramValue}</div>
      )}
      {formState.frontShowPhotoFrame && (
        <div className="cover-preview-front-photo">
          <div className="cover-preview-front-photo-inner">{frontPhotoLabelPreview}</div>
        </div>
      )}
      <div className="cover-preview-front-copy">
        <div className="cover-preview-front-event">{frontEventLinePreview}</div>
        <h3>{frontTitlePreview}</h3>
        <p>{frontSubtitlePreview}</p>
        <div className="cover-preview-front-recipient">{frontRecipientPreview}</div>
      </div>
      {formState.frontMotif === 'line' && <div className="cover-preview-motif-line" aria-hidden="true" />}
      {formState.frontMotif === 'corner' && <div className="cover-preview-motif-corner" aria-hidden="true" />}
      {formState.frontMotif === 'olive_leaf' && (
        <div className="cover-preview-motif-olive" aria-hidden="true">
          <svg viewBox="0 0 140 120" role="presentation" focusable="false">
            <path d="M24 92 C40 48, 74 20, 122 16 C104 64, 72 96, 30 104 Z" />
            <path d="M31 100 C55 80, 76 58, 95 30" className="olive-vein" />
            <ellipse cx="60" cy="76" rx="8" ry="4" className="olive-fruit" />
            <ellipse cx="74" cy="62" rx="7" ry="3.5" className="olive-fruit" />
          </svg>
        </div>
      )}
    </article>
  );

  const renderBackPreviewCard = () => (
    <article
      key="back"
      className={`cover-preview-card is-back cover-style-${formState.styleId} ${activeFace === 'back' ? 'is-active' : ''}`}
      style={{
        '--cover-bg': selectedPalette.back,
        '--cover-text': selectedPalette.text,
        '--cover-accent': selectedPalette.accent,
        '--cover-subtle': selectedPalette.subtle,
        '--cover-title-font': selectedStyle.titleFont,
        '--cover-body-font': selectedStyle.bodyFont
      }}
    >
      <div className="cover-preview-safe-zone" />
      <div className="cover-preview-back-copy">{backBlurbPreview}</div>
      {backQuotePreview && (
        <blockquote className="cover-preview-back-quote">"{backQuotePreview}"</blockquote>
      )}
      {backOrganizerLinePreview && (
        <div className="cover-preview-back-organizer">{backOrganizerLinePreview}</div>
      )}
      <div className="cover-preview-back-footer">
        {formState.backShowContributors && (
          <div className="cover-preview-chip">
            {backContributorsLinePreview || 'Contributions collectives'}
          </div>
        )}
        {formState.backShowQrHint && (
          <div className="cover-preview-qr">QR</div>
        )}
      </div>
      {backDateLocationPreview && (
        <div className="cover-preview-back-date">{backDateLocationPreview}</div>
      )}
      {selectedStyle.id === 'artistique_poetique' && (
        <div className="cover-preview-note-zone">Mot manuscrit personnel</div>
      )}
      {backIsbnPreview && (
        <div className="cover-preview-back-isbn">{backIsbnPreview}</div>
      )}
      <div className="cover-preview-back-signature">{backSignaturePreview}</div>
    </article>
  );

  const renderPreviewSpread = ({ expanded = false, activeOnly = false } = {}) => {
    const cards = [];

    if (!activeOnly || activeFace === 'front') {
      cards.push(renderFrontPreviewCard());
    }
    if (!activeOnly || activeFace === 'back') {
      cards.push(renderBackPreviewCard());
    }

    return (
      <div className={`cover-preview-spread ${expanded ? 'is-expanded' : ''} ${activeOnly ? 'is-single-face' : ''}`}>
        {cards}
      </div>
    );
  };

  return (
    <div className="cover-designer-live">
      <div className="cover-designer-head">
        <div>
          <span className="label-gold">Design couverture</span>
          <h2 className="cover-designer-title">Construisez la couverture et la 4e en direct</h2>
          <p className="cover-designer-subtitle">
            Choisissez une direction visuelle, ajustez les textes, et validez quand l ensemble vous semble premium.
          </p>
        </div>

        <button
          type="button"
          className="btn btn-primary cover-designer-save-btn"
          onClick={handleSave}
          disabled={!hasPendingChanges || isSaving}
        >
          {isSaving ? 'Validation...' : 'Valider la couverture'}
        </button>
      </div>

      {saveFeedback?.message && (
        <div className={`luxe-feedback-banner is-${saveFeedback.type}`}>
          <span>{saveFeedback.message}</span>
        </div>
      )}

      <div className="cover-designer-shell">
        <section className="cover-designer-form">
          <div className="cover-face-tabs">
            <button
              type="button"
              className={`cover-face-tab ${activeFace === 'front' ? 'is-active' : ''}`}
              onClick={() => setActiveFace('front')}
            >
              Couverture
            </button>
            <button
              type="button"
              className={`cover-face-tab ${activeFace === 'back' ? 'is-active' : ''}`}
              onClick={() => setActiveFace('back')}
            >
              4e de couverture
            </button>
          </div>

          <div className="cover-designer-group">
            <span className="cover-designer-group-label">Exemples luxe (couverture + 4e)</span>
            <div className="cover-style-grid">
              {VISIBLE_COVER_STYLES.map((style) => (
                <button
                  key={style.id}
                  type="button"
                  className={`cover-style-option ${formState.styleId === style.id ? 'is-selected' : ''}`}
                  onClick={() => applyStylePreset(style.id)}
                >
                  <span className="cover-style-label">{style.label}</span>
                  <span className="cover-style-text">{style.description}</span>
                </button>
              ))}
            </div>
          </div>

          {activeFace === 'front'
            ? renderFrontEditorFields()
            : renderBackEditorFields()}
        </section>

        <aside className="cover-designer-preview">
          <div className="cover-designer-preview-head">
            <span className="cover-designer-group-label">Apercu en direct</span>
            <button
              type="button"
              className="cover-preview-expand-btn"
              onClick={() => setIsPreviewExpanded(true)}
            >
              Agrandir
            </button>
          </div>

          {renderPreviewSpread({ expanded: false, activeOnly: true })}

          <div className="cover-preview-guides">
            <div>Repere imprimeur: zone sure representee par le cadre interieur.</div>
            <div>Choisissez un des 5 exemples puis ajustez le texte sans casser la respiration visuelle.</div>
            <div>Le rendu imprimeur reprend cette mise en page avec les memes blocs.</div>
          </div>
        </aside>
      </div>

      {isPreviewExpanded && (
        <div
          className="modal-overlay"
          onClick={() => setIsPreviewExpanded(false)}
        >
          <div
            className="modal-content cover-preview-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="cover-preview-modal-head">
              <div>
                <span className="label-gold">Apercu agrandi</span>
                <h3 className="cover-preview-modal-title">Couverture et 4e de couverture</h3>
              </div>
              <button
                type="button"
                className="modal-close"
                onClick={() => setIsPreviewExpanded(false)}
                aria-label="Fermer l apercu agrandi"
              >
                x
              </button>
            </div>

            <div className="cover-preview-modal-body">
              <div className="cover-preview-modal-canvas">
                {renderPreviewSpread({ expanded: true, activeOnly: false })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BookCoverDesignerLuxe;
