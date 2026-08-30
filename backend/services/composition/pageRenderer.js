// backend/services/composition/pageRenderer.js
//
// Rendu HTML du resultat du moteur de mise en page (book_pages -> document
// HTML autonome). Fonction pure : ne touche ni la base ni le disque. Le CSS
// est volontairement auto-suffisant (pas de dependance a book-variables.css
// / BookLuxe.css du frontend, qui sont concues pour le rendu chapitre/prose
// existant, pas pour des pages a base de slots photo/texte/contribution).
//
// Chaque bloc connait le slug du layout choisi par layoutEngine (pas
// seulement son "kind") : c'est ce qui rend visible, a l'ecran, le fait de
// "regenerer avec une autre presentation" (variant) — sans ca, deux layouts
// candidats du meme kind/nombre d'items (ex. photo-pleine-page vs
// photo-avec-marge) rendraient un HTML identique.
//
// Consomme par pdfService.js (Chrome headless -> PDF) et par la route
// GET /api/books/:bookId/preview.html (ouvrable directement au navigateur,
// sans dependance a un binaire Chrome).

const DEFAULT_FORMAT = { trimWidthMm: 210, trimHeightMm: 297 }; // A4 / "standard"

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderPhotoBlock(items, slug) {
  if (items.length === 1) {
    const inset = slug === 'photo-avec-marge';
    const cls = inset ? 'block-photo photo-solo photo-inset' : 'block-photo photo-solo';
    return `<figure class="${cls}" data-layout="${escapeHtml(slug || '')}"><img src="${escapeHtml(items[0].url || '')}" alt="" /></figure>`;
  }
  if (items.length === 2 && slug === 'photo-duo-vertical') {
    const imgs = items.map((item) => `<img src="${escapeHtml(item.url || '')}" alt="" />`).join('');
    return `<div class="block-photo photo-grid photo-grid-duo-v" data-layout="${escapeHtml(slug)}">${imgs}</div>`;
  }
  const imgs = items.map((item) => `<img src="${escapeHtml(item.url || '')}" alt="" />`).join('');
  return `<div class="block-photo photo-grid photo-grid-${Math.min(items.length, 6)}" data-layout="${escapeHtml(slug || '')}">${imgs}</div>`;
}

function renderTexteBlock(items, slug) {
  if (slug === 'texte-citation' && items.length === 1) {
    return `<div class="block-texte texte-citation" data-layout="${escapeHtml(slug)}"><p>${escapeHtml(items[0].text || '')}</p></div>`;
  }
  const cls = slug === 'texte-pleine-page' ? 'block-texte texte-pleine' : 'block-texte';
  const paragraphs = items.map((item) => `<p>${escapeHtml(item.text || '')}</p>`).join('');
  return `<div class="${cls}" data-layout="${escapeHtml(slug || '')}">${paragraphs}</div>`;
}

function renderContributionBlock(items, slug) {
  const photos = items.filter((item) => item.kind === 'photo');
  const textes = items.filter((item) => item.kind === 'texte');
  const contributorName = items.map((item) => item?.metadata?.contributor_name).find(Boolean);

  const photosHtml = photos.length > 0
    ? `<div class="contribution-photos photo-grid photo-grid-${Math.min(photos.length, 4)}">${photos
        .map((item) => `<img src="${escapeHtml(item.url || '')}" alt="" />`)
        .join('')}</div>`
    : '';
  const textHtml = textes
    .map((item) => `<p class="contribution-message">${escapeHtml(item.text || '')}</p>`)
    .join('');
  const nameHtml = contributorName ? `<p class="contribution-name">${escapeHtml(contributorName)}</p>` : '';

  return `<div class="block-contribution" data-layout="${escapeHtml(slug || '')}">${photosHtml}${textHtml}${nameHtml}</div>`;
}

function renderBlock(block, itemsById, layoutsById) {
  const items = block.itemIds.map((id) => itemsById[id]).filter(Boolean);
  if (items.length === 0) return '';

  const slug = layoutsById[block.layoutId]?.slug;

  if (block.kind === 'photo') return renderPhotoBlock(items, slug);
  if (block.kind === 'texte') return renderTexteBlock(items, slug);
  if (block.kind === 'contribution') return renderContributionBlock(items, slug);
  // 'mixte' ou inconnu : on retombe sur un rendu generique photo+texte.
  const photos = items.filter((item) => item.kind === 'photo');
  const textes = items.filter((item) => item.kind === 'texte');
  return `<div class="block-mixte">${photos.length ? renderPhotoBlock(photos) : ''}${
    textes.length ? renderTexteBlock(textes) : ''
  }</div>`;
}

function renderPage(page, itemsById, layoutsById, isLast) {
  const blocks = Array.isArray(page.content?.blocks) ? page.content.blocks : [];
  const blocksHtml = blocks.map((block) => renderBlock(block, itemsById, layoutsById)).join('');
  const pageClass = isLast ? 'page' : 'page page-break';
  return `<section class="${pageClass}" data-page-index="${page.page_index}"><div class="page-blocks">${blocksHtml}</div></section>`;
}

const BASE_CSS = `
  * { box-sizing: border-box; }
  body { margin: 0; font-family: 'Georgia', 'Cormorant Garamond', serif; color: #241f18; background: #f4f0e6; }
  .page {
    width: var(--page-width-mm);
    height: var(--page-height-mm);
    padding: 14mm;
    background: #fffdf8;
    position: relative;
    overflow: hidden;
    margin: 0 auto 8mm;
  }
  .page-break { page-break-after: always; }
  .page-blocks { display: flex; flex-direction: column; gap: 6mm; height: 100%; }
  .block-photo, .block-texte, .block-contribution, .block-mixte { flex: 1; min-height: 0; display: flex; flex-direction: column; }
  .photo-solo { margin: 0; height: 100%; }
  .photo-solo img { width: 100%; height: 100%; object-fit: cover; }
  .photo-inset { padding: 8mm; background: #efe8d8; }
  .photo-inset img { border: 1px solid #cbbd9c; box-shadow: 0 2px 10px rgba(0,0,0,0.08); }
  .photo-grid { display: grid; gap: 3mm; height: 100%; }
  .photo-grid-1 { grid-template-columns: 1fr; }
  .photo-grid-2 { grid-template-columns: 1fr 1fr; }
  .photo-grid-duo-v { grid-template-columns: 1fr; grid-template-rows: 1fr 1fr; }
  .photo-grid-3, .photo-grid-4 { grid-template-columns: 1fr 1fr; }
  .photo-grid-5, .photo-grid-6 { grid-template-columns: 1fr 1fr 1fr; }
  .photo-grid img { width: 100%; height: 100%; object-fit: cover; }
  .block-texte { justify-content: center; }
  .block-texte p { font-size: 13pt; line-height: 1.7; text-align: justify; }
  .texte-pleine { justify-content: flex-start; }
  .texte-pleine p { font-size: 15pt; line-height: 1.9; }
  .texte-citation { justify-content: center; align-items: center; text-align: center; }
  .texte-citation p { font-style: italic; font-size: 22pt; line-height: 1.5; max-width: 80%; }
  .texte-citation p::before, .texte-citation p::after { content: '"'; opacity: 0.35; }
  .block-contribution { justify-content: center; gap: 4mm; }
  .contribution-photos { max-height: 60%; }
  .contribution-message { font-style: italic; font-size: 12pt; text-align: center; }
  .contribution-name { text-align: center; font-size: 10pt; letter-spacing: 0.05em; text-transform: uppercase; color: #6d6252; }
  @media print {
    body { background: #fff; }
    .page { margin: 0; }
  }
`;

/**
 * @param {object} input
 * @param {object} input.book - { id, title }
 * @param {Array} input.pages - resultat de layoutEngine.compose() ou lecture de book_pages
 * @param {Array} input.items - book_content_items du livre (pour resoudre les itemIds des pages)
 * @param {Array} [input.layouts] - layout_definitions (pour resoudre le slug de chaque bloc et varier le rendu)
 * @param {object} [input.format] - { trimWidthMm, trimHeightMm }
 * @returns {string} document HTML complet, autonome
 */
function renderBookHtml(input) {
  const book = input.book || {};
  const pages = Array.isArray(input.pages) ? input.pages : [];
  const items = Array.isArray(input.items) ? input.items : [];
  const layouts = Array.isArray(input.layouts) ? input.layouts : [];
  const format = input.format || DEFAULT_FORMAT;

  const itemsById = Object.fromEntries(items.map((item) => [item.id, item]));
  const layoutsById = Object.fromEntries(layouts.map((layout) => [layout.id, layout]));
  const sortedPages = [...pages].sort((a, b) => a.page_index - b.page_index);
  const pagesHtml = sortedPages
    .map((page, index) => renderPage(page, itemsById, layoutsById, index === sortedPages.length - 1))
    .join('\n');

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(book.title || 'Aperçu du livre')}</title>
<style>
  @page { size: ${format.trimWidthMm}mm ${format.trimHeightMm}mm; margin: 0; }
  :root { --page-width-mm: ${format.trimWidthMm}mm; --page-height-mm: ${format.trimHeightMm}mm; }
  ${BASE_CSS}
</style>
</head>
<body>
${pagesHtml || '<p style="padding:24px;font-family:sans-serif;">Ce livre n\'a pas encore de pages composées — lancez POST /compose.</p>'}
</body>
</html>`;
}

module.exports = {
  renderBookHtml,
  escapeHtml
};
