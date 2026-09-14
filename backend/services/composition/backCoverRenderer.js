// backend/services/composition/backCoverRenderer.js
//
// Rendu pur de la 4eme de couverture : meme principe que
// frontCoverRenderer.js (une page-entree deja decidee par coverComposer.js
// devient un fragment HTML). Partage les primitives CSS/typographiques de
// frontCoverRenderer.js (COVER_BASE_CSS) pour que recto et verso restent le
// meme systeme graphique (§15 du cahier des charges) sans etre identiques.

const { escapeHtml } = require('./pageRenderer');
const { scaleFor, pt, safeText, themeStyle, themeOrnamentClasses, backgroundStyleFor, coverImgFrame } = require('./frontCoverRenderer');

const TYPE_SCALE = {
  phrase: 16,
  phrasePhoto: 14,
  stats: 13,
  brand: 8
};

function phraseHtml(phrase, sizePt, extraClass = '') {
  if (!phrase) return '';
  return `<p class="cvr-back-phrase ${extraClass}" style="font-size:${sizePt}">${safeText(phrase, 300)}</p>`;
}

function statsHtml(statsLine, sizePt) {
  if (!statsLine) return '';
  // Les separateurs "." (deja au milieu de statsLine, voir coverCopy.js)
  // sont mis en couleur d'accent independamment du reste de la ligne.
  const withAccentDots = escapeHtml(statsLine).replace(/ · /g, ' <span class="cvr-dot">·</span> ');
  return `<p class="cvr-back-stats" style="font-size:${sizePt}">${withAccentDots}</p>`;
}

function brandHtml() {
  return '<div class="cvr-brand cvr-back-brand">Celebrons</div>';
}

function renderBackMinimal(content, theme, scale) {
  return `
    <div class="cvr-safe cvr-back-stack" style="${backgroundStyleFor(theme, theme.bg)};">
      <div class="cvr-back-spacer"></div>
      ${phraseHtml(content.phrase, pt(TYPE_SCALE.phrase, scale), 'cvr-back-phrase-solo')}
      <div class="cvr-back-spacer"></div>
      ${brandHtml()}
    </div>
  `;
}

function renderBackStats(content, theme, scale) {
  return `
    <div class="cvr-safe cvr-back-stack" style="${backgroundStyleFor(theme, theme.bg)};">
      <div class="cvr-back-spacer"></div>
      ${phraseHtml(content.phrase, pt(TYPE_SCALE.phrase, scale))}
      ${statsHtml(content.statsLine, pt(TYPE_SCALE.stats, scale))}
      <div class="cvr-back-spacer"></div>
      ${brandHtml()}
    </div>
  `;
}

function renderBackPhotoStats(content, theme, scale) {
  const photoItem = content.photos?.[0];
  return `
    <div class="cvr-safe cvr-back-stack" style="${backgroundStyleFor(theme, theme.bg)};">
      <div class="cvr-back-spacer"></div>
      ${photoItem ? `<figure class="cvr-back-photo">${coverImgFrame(photoItem, { biasPortrait: false, adjustment: content.photoAdjust })}</figure>` : ''}
      ${phraseHtml(content.phrase, pt(TYPE_SCALE.phrasePhoto, scale))}
      ${statsHtml(content.statsLine, pt(TYPE_SCALE.stats, scale))}
      <div class="cvr-back-spacer"></div>
      ${brandHtml()}
    </div>
  `;
}

const VARIANT_RENDERERS = {
  BACK_MINIMAL: renderBackMinimal,
  BACK_STATS: renderBackStats,
  BACK_PHOTO_STATS: renderBackPhotoStats
};

// Ordre stable des 3 formats + AUTO : meme role que FRONT_COVER_VARIANTS
// (frontCoverRenderer.js) — source unique reutilisee par coverComposer.js
// (validation d'une surcharge backVariant) et par la galerie de choix du
// frontend (BookCoverDesignerLuxe.js).
const BACK_COVER_VARIANTS = ['BACK_MINIMAL', 'BACK_STATS', 'BACK_PHOTO_STATS'];

/**
 * @param {object} page - page-entry produite par coverComposer.composeBackCover
 *   (content: { variant, itemIds, statsLine, phrase, theme })
 * @param {object} context - { format, isLast, itemsById }
 * @returns {string} un <section class="page ..."> autonome
 */
function renderBackCoverPage(page, context = {}) {
  const content = page?.content || {};
  const theme = content.theme || {};
  const format = context.format || { trimWidthMm: 210, trimHeightMm: 297 };
  const itemsById = context.itemsById || {};
  const scale = scaleFor(format);
  const safeMarginMm = format.safeMarginMm ?? 15;

  const photos = (content.itemIds || []).map((id) => itemsById[id]).filter(Boolean);
  const renderVariant = VARIANT_RENDERERS[content.variant] || renderBackMinimal;
  const inner = renderVariant({ ...content, photos }, theme, scale);

  const pageClass = context.isLast ? 'page cvr-page cvr-back' : 'page page-break cvr-page cvr-back';
  const variantClass = `cvr-variant-${content.variant || 'BACK_MINIMAL'}`;
  // Meme cadre/texture/embossage que le recto (coverTheme.applyFormatAccent)
  // — la 4e de couverture doit rester coherente avec la 1ere pour le meme format.
  const ornamentClass = themeOrnamentClasses(theme);

  return `<section class="${pageClass} ${variantClass} ${ornamentClass}" data-page-index="${page.page_index}" data-cvr-role="back-cover" style="${backgroundStyleFor(theme, theme.bg || theme.paper)};${themeStyle(theme)};--cvr-safe-margin:${safeMarginMm}mm;">${inner}</section>`;
}

const BACK_COVER_CSS = `
  .cvr-back-stack { flex: 1; display: flex; flex-direction: column; align-items: center; text-align: center; }
  .cvr-back-spacer { flex: 1; }
  .cvr-back-phrase { margin: 0; max-width: 65%; font-family: var(--cvr-title-font); font-style: italic; color: var(--cvr-ink); line-height: 1.5; }
  .cvr-back-phrase-solo { font-size: 16pt; }
  .cvr-back-stats { margin: 4mm 0 0; font-family: var(--cvr-secondary-font); color: var(--cvr-ink); letter-spacing: 0.02em; }
  .cvr-back-stats .cvr-dot { color: var(--cvr-accent); padding: 0 1mm; }
  .cvr-back-photo { margin: 0 0 6mm; width: 55%; height: 28%; padding: 8mm; background: rgba(0,0,0,0.03); border: 1px solid rgba(0,0,0,0.12); box-shadow: 0 2px 10px rgba(0,0,0,0.08); box-sizing: border-box; }
  .cvr-back-photo .photo-frame { width: 100%; height: 100%; }
  .cvr-back-brand { margin-top: 4mm; }
`;

module.exports = {
  renderBackCoverPage,
  BACK_COVER_CSS,
  BACK_COVER_VARIANTS,
  TYPE_SCALE
};
