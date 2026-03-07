import React, { useEffect, useMemo, useState } from 'react';
import './BookLuxe.css';
import '../../styles/luxe-theme.css';

const COVER_STYLES = [
  {
    id: 'editorial_classic',
    label: 'Editorial classique',
    description: 'Serif raffinee, details dores et composition ceremonielle.',
    tag: 'Edition prestige',
    titleFont: "'Baskerville', 'Palatino Linotype', serif",
    bodyFont: "'Inter', sans-serif"
  },
  {
    id: 'minimal_contemporary',
    label: 'Minimal contemporain',
    description: 'Lignes franches, respiration maximale et impact visuel net.',
    tag: 'Collection moderne',
    titleFont: "'Avenir Next', 'Inter', sans-serif",
    bodyFont: "'Inter', sans-serif"
  },
  {
    id: 'heritage_emotion',
    label: 'Heritage emotionnel',
    description: 'Ton narratif, monogramme et presence humaine plus forte.',
    tag: 'Memoire intime',
    titleFont: "'Garamond', 'Times New Roman', serif",
    bodyFont: "'Inter', sans-serif"
  }
];

const COLOR_PALETTES = [
  {
    id: 'ivoire_dore',
    label: 'Ivoire dore',
    front: '#f6f1e7',
    back: '#efe7da',
    text: '#1f2228',
    accent: '#b8924a',
    subtle: '#d7c39a'
  },
  {
    id: 'sauge_precieuse',
    label: 'Sauge precieuse',
    front: '#eaf0ea',
    back: '#e2ebe2',
    text: '#1f2a28',
    accent: '#8f9f8f',
    subtle: '#b9c7ba'
  },
  {
    id: 'bleu_poudre',
    label: 'Bleu poudre',
    front: '#e9edf4',
    back: '#e1e7f0',
    text: '#1f2530',
    accent: '#7f90a8',
    subtle: '#b9c3d2'
  }
];

const SERIALIZABLE_KEYS = [
  'styleId',
  'paletteId',
  'frontTitle',
  'frontSubtitle',
  'frontRecipient',
  'frontEventLine',
  'frontMotif',
  'frontShowMonogram',
  'backBlurb',
  'backQuote',
  'backSignature',
  'backShowContributors',
  'backShowQrHint'
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

const getStyleById = (styleId) => (
  COVER_STYLES.find((style) => style.id === styleId) || COVER_STYLES[0]
);

const getPaletteById = (paletteId) => (
  COLOR_PALETTES.find((palette) => palette.id === paletteId) || COLOR_PALETTES[0]
);

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

  const preferredStyle = normalizeText(coverConfig.template || backCoverConfig.template || '');
  const preferredPalette = normalizeText(coverConfig.palette || backCoverConfig.palette || '');
  const style = getStyleById(preferredStyle);
  const palette = getPaletteById(preferredPalette);

  return {
    styleId: style.id,
    paletteId: palette.id,
    frontTitle: normalizeText(coverConfig.title || book?.title || ''),
    frontSubtitle: normalizeText(coverConfig.subtitle || ''),
    frontRecipient: normalizeText(coverConfig.recipientLine || book?.recipient_name || ''),
    frontEventLine: normalizeText(coverConfig.eventLine || deriveDefaultEventLine(book)),
    frontMotif: normalizeText(coverConfig.motif || 'line'),
    frontShowMonogram: coverConfig.showMonogram !== false,
    backBlurb: normalizeText(backCoverConfig.blurb || ''),
    backQuote: normalizeText(backCoverConfig.quote || ''),
    backSignature: normalizeText(
      backCoverConfig.signature
        || (book?.recipient_name ? `Les proches de ${book.recipient_name}` : 'Les proches')
    ),
    backShowContributors: Boolean(
      backCoverConfig.show_contributors ?? backCoverConfig.showContributors ?? true
    ),
    backShowQrHint: Boolean(backCoverConfig.showQrHint)
  };
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

  const selectedPalette = useMemo(
    () => getPaletteById(formState.paletteId),
    [formState.paletteId]
  );

  const stateSignature = useMemo(
    () => getStateSignature(formState),
    [formState]
  );

  const hasPendingChanges = stateSignature !== baselineSignature;

  const frontTitlePreview = normalizeText(formState.frontTitle) || normalizeText(book?.title) || 'Titre du livre';
  const frontSubtitlePreview = normalizeText(formState.frontSubtitle) || 'Sous-titre optionnel';
  const frontRecipientPreview = normalizeText(formState.frontRecipient) || normalizeText(book?.recipient_name) || 'Destinataire';
  const frontEventLinePreview = normalizeText(formState.frontEventLine) || 'Edition personnalisable';
  const backBlurbPreview = normalizeText(formState.backBlurb)
    || 'Texte de quatrieme de couverture a definir. Cette zone mettra en valeur la promesse editoriale du livre.';
  const backQuotePreview = normalizeText(formState.backQuote);
  const backSignaturePreview = normalizeText(formState.backSignature) || 'Signature';
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

  const buildPayload = () => {
    const nextCoverConfig = {
      ...(book?.cover_config || {}),
      template: formState.styleId,
      palette: formState.paletteId,
      title: frontTitlePreview,
      subtitle: normalizeText(formState.frontSubtitle),
      recipientLine: normalizeText(formState.frontRecipient),
      eventLine: normalizeText(formState.frontEventLine),
      motif: normalizeText(formState.frontMotif || 'line'),
      showMonogram: Boolean(formState.frontShowMonogram),
      color: selectedPalette.front,
      accentColor: selectedPalette.accent,
      textColor: selectedPalette.text,
      font: selectedStyle.titleFont
    };

    const nextBackCoverConfig = {
      ...(book?.back_cover_config || {}),
      template: formState.styleId,
      palette: formState.paletteId,
      blurb: normalizeText(formState.backBlurb),
      quote: normalizeText(formState.backQuote),
      signature: normalizeText(formState.backSignature),
      show_contributors: Boolean(formState.backShowContributors),
      showQrHint: Boolean(formState.backShowQrHint),
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

  const renderPreviewSpread = (expanded = false) => (
    <div className={`cover-preview-spread ${expanded ? 'is-expanded' : ''}`}>
      <article
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
        <div className="cover-preview-front-copy">
          <div className="cover-preview-front-event">{frontEventLinePreview}</div>
          <h3>{frontTitlePreview}</h3>
          <p>{frontSubtitlePreview}</p>
          <div className="cover-preview-front-recipient">{frontRecipientPreview}</div>
        </div>
        {formState.frontMotif === 'line' && <div className="cover-preview-motif-line" aria-hidden="true" />}
        {formState.frontMotif === 'corner' && <div className="cover-preview-motif-corner" aria-hidden="true" />}
      </article>

      <article
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
        <div className="cover-preview-back-footer">
          {formState.backShowContributors && (
            <div className="cover-preview-chip">Contributions collectives</div>
          )}
          {formState.backShowQrHint && (
            <div className="cover-preview-qr">QR</div>
          )}
        </div>
        <div className="cover-preview-back-signature">{backSignaturePreview}</div>
      </article>
    </div>
  );

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
            <span className="cover-designer-group-label">Direction artistique</span>
            <div className="cover-style-grid">
              {COVER_STYLES.map((style) => (
                <button
                  key={style.id}
                  type="button"
                  className={`cover-style-option ${formState.styleId === style.id ? 'is-selected' : ''}`}
                  onClick={() => updateField('styleId', style.id)}
                >
                  <span className="cover-style-label">{style.label}</span>
                  <span className="cover-style-text">{style.description}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="cover-designer-group">
            <span className="cover-designer-group-label">Palette</span>
            <div className="cover-palette-grid">
              {COLOR_PALETTES.map((palette) => (
                <button
                  key={palette.id}
                  type="button"
                  className={`cover-palette-option ${formState.paletteId === palette.id ? 'is-selected' : ''}`}
                  onClick={() => updateField('paletteId', palette.id)}
                >
                  <span className="cover-palette-swatch" style={{ background: palette.front }} />
                  <span className="cover-palette-label">{palette.label}</span>
                </button>
              ))}
            </div>
          </div>

          {activeFace === 'front' ? (
            <div className="cover-designer-fields">
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
                    <option value="line">Filet central</option>
                    <option value="corner">Coin grave</option>
                    <option value="none">Sans motif</option>
                  </select>
                  <label className="cover-toggle-line">
                    <input
                      type="checkbox"
                      checked={Boolean(formState.frontShowMonogram)}
                      onChange={(event) => updateField('frontShowMonogram', event.target.checked)}
                    />
                    <span>Afficher le monogramme</span>
                  </label>
                </div>
              </div>
            </div>
          ) : (
            <div className="cover-designer-fields">
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
          )}
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

          {renderPreviewSpread(false)}

          <div className="cover-preview-guides">
            <div>Repere imprimeur: zone sure representee par le cadre interieur.</div>
            <div>Les textes longs de 4e doivent rester lisibles en 8 a 11 lignes max.</div>
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

            {renderPreviewSpread(true)}
          </div>
        </div>
      )}
    </div>
  );
};

export default BookCoverDesignerLuxe;
