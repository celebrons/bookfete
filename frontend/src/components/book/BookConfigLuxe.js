import React, { useEffect, useMemo, useState } from 'react';
import './BookLuxe.css';
import '../../styles/luxe-theme.css';

const FINITIONS = [
  { id: 'livret', label: 'Livret', description: 'Souple et leger', basePrice: 29 },
  { id: 'classique', label: 'Classique', description: 'Rigide et elegant', basePrice: 55 },
  { id: 'luxe', label: 'Luxe', description: 'Toile premium', basePrice: 85 }
];

const PAPIERS = [
  { id: 'satine', label: 'Satine', description: 'Brillant et lisse', multiplier: 1.0 },
  { id: 'mat', label: 'Mat', description: 'Doux et naturel', multiplier: 1.0 },
  { id: 'verge', label: 'Verge ivoire', description: 'Texture noble', multiplier: 1.15 }
];

const STYLES = [
  { id: 'poetique', label: 'Poetique', description: 'Image et emotion', multiplier: 1.0 },
  { id: 'factuel', label: 'Factuel', description: 'Direct et clair', multiplier: 1.0 },
  { id: 'intime', label: 'Intime', description: 'Chaleureux et personnel', multiplier: 1.0 }
];

const MIN_PAGES = 32;
const MAX_PAGES = 96;
const DEFAULT_PAGES_PER_CHAPTER = 8;
const DEFAULT_PRICE_PAGES_BASELINE = 64;
const EXTRA_PAGE_PRICE = 0.25;

const clampPages = (value) => {
  const numericValue = Number(value) || MIN_PAGES;
  const snapped = Math.round(numericValue / DEFAULT_PAGES_PER_CHAPTER) * DEFAULT_PAGES_PER_CHAPTER;
  return Math.max(MIN_PAGES, Math.min(MAX_PAGES, snapped));
};

const buildInitialFormData = (book, chaptersCount) => ({
  title: book?.title || '',
  finition: book?.finition || 'classique',
  papier: book?.papier || 'mat',
  style_narratif: book?.style_narratif || 'factuel',
  pages: clampPages(book?.pages || chaptersCount * DEFAULT_PAGES_PER_CHAPTER || 64)
});

const formatEuro = (value) => Number(value || 0).toLocaleString('fr-FR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

const BookConfigLuxe = ({
  book,
  onUpdateBook,
  chaptersCount = 6,
  onPagesChange,
  onOpenBookPreview,
  canOpenBookPreview = false,
  previewUnavailableReason = '',
  isGeneratingPreview = false,
  onOpenCoverConfig
}) => {
  const [formData, setFormData] = useState(() => buildInitialFormData(book, chaptersCount));
  const [isSaving, setIsSaving] = useState(false);
  const [isPreparingPreview, setIsPreparingPreview] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState(null);

  useEffect(() => {
    setFormData(buildInitialFormData(book, chaptersCount));
  }, [book?.id, book?.title, book?.finition, book?.papier, book?.style_narratif, book?.pages, chaptersCount]);

  const selectedFinition = useMemo(
    () => FINITIONS.find((option) => option.id === formData.finition) || FINITIONS[1],
    [formData.finition]
  );
  const selectedPapier = useMemo(
    () => PAPIERS.find((option) => option.id === formData.papier) || PAPIERS[1],
    [formData.papier]
  );
  const selectedStyle = useMemo(
    () => STYLES.find((option) => option.id === formData.style_narratif) || STYLES[1],
    [formData.style_narratif]
  );

  const currentBookSnapshot = useMemo(
    () => ({
      title: book?.title || '',
      finition: book?.finition || 'classique',
      papier: book?.papier || 'mat',
      style_narratif: book?.style_narratif || 'factuel',
      pages: clampPages(book?.pages || chaptersCount * DEFAULT_PAGES_PER_CHAPTER || 64)
    }),
    [book?.title, book?.finition, book?.papier, book?.style_narratif, book?.pages, chaptersCount]
  );

  const livePrice = useMemo(() => {
    const extraPages = Math.max(0, formData.pages - DEFAULT_PRICE_PAGES_BASELINE);
    const baseWithPages = selectedFinition.basePrice + (extraPages * EXTRA_PAGE_PRICE);
    const withPaper = baseWithPages * selectedPapier.multiplier;
    const withStyle = withPaper * selectedStyle.multiplier;
    return Math.round(withStyle * 100) / 100;
  }, [formData.pages, selectedFinition.basePrice, selectedPapier.multiplier, selectedStyle.multiplier]);

  const calculatedChapters = useMemo(
    () => Math.max(4, Math.floor(formData.pages / DEFAULT_PAGES_PER_CHAPTER)),
    [formData.pages]
  );

  const chapterDelta = calculatedChapters - chaptersCount;
  const willChaptersChange = chapterDelta !== 0;
  const isChapterReduction = chapterDelta < 0;
  const requiresChapterReductionConfirmation = willChaptersChange
    && isChapterReduction
    && formData.pages !== currentBookSnapshot.pages;

  const priceBreakdown = useMemo(() => {
    const extraPages = Math.max(0, formData.pages - DEFAULT_PRICE_PAGES_BASELINE);
    const extraPagesAmount = extraPages * EXTRA_PAGE_PRICE;
    const subtotal = selectedFinition.basePrice + extraPagesAmount;
    const withPaper = subtotal * selectedPapier.multiplier;
    const withStyle = withPaper * selectedStyle.multiplier;
    return {
      extraPages,
      extraPagesAmount,
      subtotal,
      withPaper,
      withStyle
    };
  }, [formData.pages, selectedFinition.basePrice, selectedPapier.multiplier, selectedStyle.multiplier]);

  const hasPendingChanges = useMemo(() => (
    formData.title !== currentBookSnapshot.title
    || formData.finition !== currentBookSnapshot.finition
    || formData.papier !== currentBookSnapshot.papier
    || formData.style_narratif !== currentBookSnapshot.style_narratif
    || formData.pages !== currentBookSnapshot.pages
  ), [formData, currentBookSnapshot]);

  const updateField = (field, value) => {
    setFormData((previous) => ({ ...previous, [field]: value }));
    if (saveFeedback) {
      setSaveFeedback(null);
    }
  };

  const handlePagesChange = (newPages) => {
    updateField('pages', clampPages(newPages));
  };

  const persistConfiguration = async ({ showSuccessBanner = true } = {}) => {
    if (!hasPendingChanges) {
      return false;
    }
    if (requiresChapterReductionConfirmation && typeof window !== 'undefined') {
      const confirmed = window.confirm(
        `Vous allez retirer ${Math.abs(chapterDelta)} chapitre(s).\n\nLes chapitres supprimes et leur contenu ne pourront pas etre recuperes.\nContinuer ?`
      );
      if (!confirmed) {
        setSaveFeedback({
          type: 'info',
          message: 'Modification annulee. Le nombre de chapitres n a pas ete reduit.'
        });
        return false;
      }
    }
    setIsSaving(true);
    setSaveFeedback(null);

    const payload = {
      title: formData.title.trim() || currentBookSnapshot.title || 'Livre souvenir',
      finition: formData.finition,
      papier: formData.papier,
      style_narratif: formData.style_narratif,
      pages: formData.pages
    };

    try {
      await onUpdateBook(payload);

      if (formData.pages !== currentBookSnapshot.pages && typeof onPagesChange === 'function') {
        await onPagesChange(formData.pages);
      }

      if (showSuccessBanner) {
        setSaveFeedback({
          type: 'success',
          message: 'Configuration enregistree. Les donnees du livre sont a jour.'
        });
      }
      return true;
    } catch (error) {
      setSaveFeedback({
        type: 'error',
        message: 'La validation a echoue. Merci de reessayer.'
      });
      throw error;
    } finally {
      setIsSaving(false);
    }
  };

  const handleValidate = async () => {
    if (isSaving || isPreparingPreview || !hasPendingChanges) {
      return;
    }
    try {
      await persistConfiguration({ showSuccessBanner: true });
    } catch (_error) {
      // Feedback already handled.
    }
  };

  const handleOpenLivePreview = async () => {
    if (
      isSaving
      || isPreparingPreview
      || typeof onOpenBookPreview !== 'function'
      || !canOpenBookPreview
    ) {
      return;
    }

    setIsPreparingPreview(true);
    setSaveFeedback(null);
    try {
      if (hasPendingChanges) {
        const persisted = await persistConfiguration({ showSuccessBanner: false });
        if (!persisted) {
          return;
        }
      }
      await onOpenBookPreview();
    } catch (_error) {
      // Parent displays detailed notice when preview generation fails.
    } finally {
      setIsPreparingPreview(false);
    }
  };

  const pageProgress = ((formData.pages - MIN_PAGES) / (MAX_PAGES - MIN_PAGES)) * 100;
  const previewActionDisabled = (
    isSaving
    || isPreparingPreview
    || isGeneratingPreview
    || !canOpenBookPreview
  );

  return (
    <div className="book-config-live">
      <div className="book-config-live-head">
        <div>
          <span className="label-gold">Configuration dynamique</span>
          <h2 className="book-config-live-title">Reglez votre edition en direct</h2>
          <p className="book-config-live-subtitle">
            Toutes les selections mettent a jour le prix et l apercu immediatement.
          </p>
        </div>

        <div className="book-config-live-price">
          <span className="book-config-live-price-label">Prix estime</span>
          <span className="book-config-live-price-value">{formatEuro(livePrice)} EUR</span>
          <span className="book-config-live-price-note">TTC</span>
        </div>
      </div>

      {saveFeedback?.message && (
        <div className={`luxe-feedback-banner is-${saveFeedback.type}`}>
          <span>{saveFeedback.message}</span>
        </div>
      )}

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
            <span className="book-config-group-label">Finition</span>
            <div className="book-config-choice-grid">
              {FINITIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => updateField('finition', option.id)}
                  className={`book-config-choice ${formData.finition === option.id ? 'is-selected' : ''}`}
                >
                  <span className="book-config-choice-title">{option.label}</span>
                  <span className="book-config-choice-text">{option.description}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="book-config-group">
            <span className="book-config-group-label">Papier</span>
            <div className="book-config-choice-grid">
              {PAPIERS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => updateField('papier', option.id)}
                  className={`book-config-choice ${formData.papier === option.id ? 'is-selected' : ''}`}
                >
                  <span className="book-config-choice-title">{option.label}</span>
                  <span className="book-config-choice-text">{option.description}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="book-config-group">
            <span className="book-config-group-label">Voix narrative</span>
            <div className="book-config-choice-grid">
              {STYLES.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => updateField('style_narratif', option.id)}
                  className={`book-config-choice ${formData.style_narratif === option.id ? 'is-selected' : ''}`}
                >
                  <span className="book-config-choice-title">{option.label}</span>
                  <span className="book-config-choice-text">{option.description}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="book-config-group">
            <div className="book-config-pages-head">
              <span className="book-config-group-label">Pagination</span>
              <span className="book-config-pages-value">{formData.pages} pages</span>
            </div>

            <div className="book-config-pages-meta">
              <span>{calculatedChapters} chapitres</span>
              <span>{DEFAULT_PAGES_PER_CHAPTER} pages / chapitre</span>
            </div>

            <input
              type="range"
              min={MIN_PAGES}
              max={MAX_PAGES}
              step={DEFAULT_PAGES_PER_CHAPTER}
              value={formData.pages}
              onChange={(event) => handlePagesChange(event.target.value)}
              className="book-config-slider"
            />

            <div className="book-config-pages-minmax">
              <span>{MIN_PAGES} pages</span>
              <span>{MAX_PAGES} pages</span>
            </div>

            <div className="book-config-progress-track">
              <span className="book-config-progress-bar" style={{ width: `${pageProgress}%` }} />
            </div>

            {willChaptersChange && (
              <div className={`book-config-delta ${chapterDelta > 0 ? 'is-positive' : 'is-warning'}`}>
                {chapterDelta > 0
                  ? `${chapterDelta} chapitre(s) seront ajoutes apres validation.`
                  : `${Math.abs(chapterDelta)} chapitre(s) seront retires apres validation.`}
              </div>
            )}
          </div>
        </section>

        <aside className="book-config-preview">
          <div className={`book-config-preview-cover is-${formData.finition}`}>
            <div className="book-config-preview-spine" />
            <div className="book-config-preview-content">
              <span className="book-config-preview-chip">{selectedStyle.label}</span>
              <h3>{formData.title || 'Titre du livre'}</h3>
              <p>{calculatedChapters} chapitres - {formData.pages} pages</p>
            </div>
          </div>

          <div className="book-config-preview-grid">
            <div className="book-config-preview-item">
              <span>Finition</span>
              <strong>{selectedFinition.label}</strong>
            </div>
            <div className="book-config-preview-item">
              <span>Papier</span>
              <strong>{selectedPapier.label}</strong>
            </div>
            <div className="book-config-preview-item">
              <span>Voix</span>
              <strong>{selectedStyle.label}</strong>
            </div>
            <div className="book-config-preview-item">
              <span>Structure</span>
              <strong>{calculatedChapters} chapitres</strong>
            </div>
          </div>

          <div className="book-config-preview-price-card">
            <div className="book-config-preview-price-label">Total estime</div>
            <div className="book-config-preview-price-value">{formatEuro(livePrice)} EUR</div>
            <div className="book-config-preview-price-note">Mise a jour en direct</div>
          </div>

          <div className="book-config-price-breakdown">
            <div className="book-config-price-row">
              <span>Base {selectedFinition.label}</span>
              <strong>{formatEuro(selectedFinition.basePrice)} EUR</strong>
            </div>
            <div className="book-config-price-row">
              <span>Pages supplementaires ({priceBreakdown.extraPages})</span>
              <strong>+{formatEuro(priceBreakdown.extraPagesAmount)} EUR</strong>
            </div>
            <div className="book-config-price-row">
              <span>Coef. papier ({selectedPapier.label})</span>
              <strong>x{selectedPapier.multiplier.toFixed(2)}</strong>
            </div>
            <div className="book-config-price-row">
              <span>Coef. voix ({selectedStyle.label})</span>
              <strong>x{selectedStyle.multiplier.toFixed(2)}</strong>
            </div>
          </div>

          <div className="book-config-preview-actions">
            <button
              type="button"
              className="btn btn-primary book-config-preview-btn"
              onClick={handleOpenLivePreview}
              disabled={previewActionDisabled}
              title={canOpenBookPreview ? 'Ouvrir un apercu feuillete du livre' : previewUnavailableReason}
            >
              {isSaving || isPreparingPreview || isGeneratingPreview
                ? 'Preparation...'
                : (hasPendingChanges ? 'Enregistrer + ouvrir l apercu' : 'Ouvrir l apercu livre')}
            </button>
            <div className="book-config-preview-helper">
              Apercu feuillete non contractuel. Vous pouvez encore modifier avant validation definitive.
            </div>

            <button
              type="button"
              className="btn btn-outline book-config-cover-btn"
              onClick={onOpenCoverConfig}
              disabled={typeof onOpenCoverConfig !== 'function'}
            >
              Configurer couverture et 4e
            </button>
            {!canOpenBookPreview && previewUnavailableReason && (
              <div className="book-config-preview-warning">{previewUnavailableReason}</div>
            )}
            {requiresChapterReductionConfirmation && (
              <div className="book-config-preview-warning">
                Attention: la nouvelle pagination supprimera {Math.abs(chapterDelta)} chapitre(s) a la validation.
              </div>
            )}
          </div>
        </aside>
      </div>

      <div className="book-config-live-footer">
        <span className="book-config-live-footer-text">
          {hasPendingChanges
            ? 'Des changements sont en attente de validation.'
            : 'Configuration deja synchronisee.'}
        </span>
        <button
          type="button"
          className="btn btn-primary book-config-validate-btn"
          onClick={handleValidate}
          disabled={!hasPendingChanges || isSaving || isPreparingPreview}
        >
          {isSaving ? 'Validation...' : 'Valider la configuration'}
        </button>
      </div>
    </div>
  );
};

export default BookConfigLuxe;
