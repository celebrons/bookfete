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

// Cadre d'image sursamplee (voir .photo-frame dans BASE_CSS) : a utiliser
// systematiquement a la place d'un <img> brut pour toute photo du livre.
function imgFrame(url) {
  return `<span class="photo-frame"><img src="${escapeHtml(url || '')}" alt="" /></span>`;
}

// Fragment de texte affiche pour cet item : le texte reel de l'item, sauf si
// le moteur a decoupe un texte trop long (textOverrides — voir
// layoutEngine.js/textLength.js), auquel cas c'est le fragment concerne.
function textFor(item, overridesByItemId) {
  const override = overridesByItemId[item.id];
  return override ? override.text : (item.text || '');
}

// Marqueur "(n/total)" affiche des qu'un texte a ete decoupe (y compris sur
// son premier fragment, pour signaler au lecteur que le temoignage continue).
// Sur les pages de suite d'une contribution decoupee (continuation=true), une
// ligne d'attribution est ajoutee au lieu de re-afficher photo+nom (voir
// layoutEngine.js : la contribution reste atomique, seul son texte continue).
function splitMetaFor(item, overridesByItemId) {
  const override = overridesByItemId[item.id];
  if (!override || !override.splitTotal || override.splitTotal <= 1) return '';

  const marker = `<span class="split-marker">(${override.splitIndex + 1}/${override.splitTotal})</span>`;
  if (!override.continuation) return marker;

  const name = item?.metadata?.contributor_name;
  const attribution = name
    ? `<p class="contribution-name contribution-continuation">— ${escapeHtml(name)} (suite)</p>`
    : `<p class="contribution-name contribution-continuation">(suite)</p>`;
  return `${attribution}${marker}`;
}

// `presentationVariant` (0 ou 1, voir layoutEngine.js) alterne une
// sous-presentation purement cosmetique — jamais le contenu place ni son
// ordre de lecture a travers les pages, seulement l'arrangement visuel
// interne d'UNE page. C'est ce qui garantit que "essayer une autre
// presentation" change toujours quelque chose de visible, meme quand le
// scoring ne depart aucune egalite entre deux layouts differents pour un
// contenu donne.
function renderPhotoBlock(items, slug, presentationVariant = 0) {
  const orderedItems = presentationVariant === 1 && items.length > 1 ? [...items].reverse() : items;

  if (orderedItems.length === 1) {
    const inset = slug === 'photo-avec-marge' || (slug === 'FULL_PHOTO' && presentationVariant === 1);
    const cls = inset ? 'block-photo photo-solo photo-inset' : 'block-photo photo-solo';
    return `<figure class="${cls}" data-layout="${escapeHtml(slug || '')}">${imgFrame(orderedItems[0].url)}</figure>`;
  }
  const vertical = slug === 'photo-duo-vertical'
    || (slug === 'TWO_PHOTOS' && orderedItems.length === 2 && presentationVariant === 1);
  if (orderedItems.length === 2 && vertical) {
    const imgs = orderedItems.map((item) => imgFrame(item.url)).join('');
    return `<div class="block-photo photo-grid photo-grid-duo-v" data-layout="${escapeHtml(slug)}">${imgs}</div>`;
  }
  const imgs = orderedItems.map((item) => imgFrame(item.url)).join('');
  return `<div class="block-photo photo-grid photo-grid-${Math.min(orderedItems.length, 6)}" data-layout="${escapeHtml(slug || '')}">${imgs}</div>`;
}

function renderTexteBlock(items, slug, overridesByItemId = {}, presentationVariant = 0) {
  const orderedItems = presentationVariant === 1 && items.length > 1 ? [...items].reverse() : items;
  const firstOverride = overridesByItemId[orderedItems[0]?.id];
  const isSplitFragment = Boolean(firstOverride && firstOverride.splitTotal > 1);

  // La sous-presentation "citation" n'est proposee que pour un temoignage
  // complet (jamais un fragment d'un texte decoupe — une immense citation
  // stylisee autour d'un morceau de phrase serait trompeuse).
  const useCitation = slug === 'texte-citation' || (slug === 'ONE_TESTIMONY' && presentationVariant === 1 && !isSplitFragment);
  if (useCitation && orderedItems.length === 1) {
    return `<div class="block-texte texte-citation" data-layout="${escapeHtml(slug)}"><p>${escapeHtml(textFor(orderedItems[0], overridesByItemId))}</p>${splitMetaFor(orderedItems[0], overridesByItemId)}</div>`;
  }

  // TWO_TESTIMONIES / THREE_TESTIMONIES (v2) : plusieurs temoignages
  // independants sur une meme page, presentes en colonnes/cartes distinctes
  // plutot qu'empiles comme de simples paragraphes.
  if ((slug === 'TWO_TESTIMONIES' || slug === 'THREE_TESTIMONIES') && orderedItems.length > 1) {
    const cards = orderedItems
      .map((item) => `<div class="testimony-card"><p>${escapeHtml(textFor(item, overridesByItemId))}</p>${splitMetaFor(item, overridesByItemId)}</div>`)
      .join('');
    return `<div class="block-texte testimony-stack testimony-stack-${orderedItems.length}" data-layout="${escapeHtml(slug)}">${cards}</div>`;
  }

  const cls = slug === 'texte-pleine-page' || slug === 'ONE_TESTIMONY' ? 'block-texte texte-pleine' : 'block-texte';
  const paragraphs = orderedItems
    .map((item) => `<p>${escapeHtml(textFor(item, overridesByItemId))}</p>${splitMetaFor(item, overridesByItemId)}`)
    .join('');
  return `<div class="${cls}" data-layout="${escapeHtml(slug || '')}">${paragraphs}</div>`;
}

function renderContributionBlock(items, slug, overridesByItemId = {}, presentationVariant = 0) {
  const photos = items.filter((item) => item.kind === 'photo');
  const textes = items.filter((item) => item.kind === 'texte');
  const orderedPhotos = presentationVariant === 1 && photos.length > 1 ? [...photos].reverse() : photos;
  const contributorName = items.map((item) => item?.metadata?.contributor_name).find(Boolean);

  const photosHtml = orderedPhotos.length > 0
    ? `<div class="contribution-photos photo-grid photo-grid-${Math.min(orderedPhotos.length, 4)}">${orderedPhotos
        .map((item) => imgFrame(item.url))
        .join('')}</div>`
    : '';
  const textHtml = textes
    .map((item) => `<p class="contribution-message">${escapeHtml(textFor(item, overridesByItemId))}</p>${splitMetaFor(item, overridesByItemId)}`)
    .join('');
  const nameHtml = contributorName ? `<p class="contribution-name">${escapeHtml(contributorName)}</p>` : '';

  return `<div class="block-contribution" data-layout="${escapeHtml(slug || '')}">${photosHtml}${textHtml}${nameHtml}</div>`;
}

// PHOTO_WITH_CAPTION (v2) : une photo pleine page avec une courte legende.
// Sous-presentation : legende centree (defaut) ou alignee/encadree (variant).
function renderPhotoWithCaption(items, slug, overridesByItemId, presentationVariant = 0) {
  const photo = items.find((item) => item.kind === 'photo');
  const caption = items.find((item) => item.kind === 'texte');
  const photoHtml = photo ? imgFrame(photo.url) : '';
  const captionHtml = caption ? `<figcaption>${escapeHtml(textFor(caption, overridesByItemId))}</figcaption>` : '';
  const cls = presentationVariant === 1 ? 'block-photo photo-with-caption is-framed' : 'block-photo photo-with-caption';
  return `<figure class="${cls}" data-layout="${escapeHtml(slug)}">${photoHtml}${captionHtml}</figure>`;
}

// PHOTO_TEXT / TEXT_PHOTO / TWO_PHOTOS_TEXT (v2) : layouts mixtes, ou l'ordre
// visuel de base (photo avant/apres le texte) suit l'ordre reel des items,
// determine par layoutEngine.js au moment de la composition (jamais
// reordonne pour le choix du contenu). Le variant de presentation, lui, peut
// inverser cet ordre VISUELLEMENT (ex. PHOTO_TEXT prend alors l'allure de
// TEXT_PHOTO) — un simple effet de mise en page, le contenu place ne change pas.
function renderMixteOrderedBlock(items, slug, overridesByItemId, presentationVariant = 0) {
  const orderedItems = presentationVariant === 1 ? [...items].reverse() : items;
  const parts = orderedItems.map((item) => {
    if (item.kind === 'photo') {
      return `<div class="mixte-photo">${imgFrame(item.url)}</div>`;
    }
    return `<div class="mixte-texte"><p>${escapeHtml(textFor(item, overridesByItemId))}</p>${splitMetaFor(item, overridesByItemId)}</div>`;
  });
  const photoCount = items.filter((item) => item.kind === 'photo').length;
  const cls = photoCount > 1 ? 'block-mixte mixte-ordered mixte-multi-photo' : 'block-mixte mixte-ordered';
  return `<div class="${cls}" data-layout="${escapeHtml(slug)}">${parts.join('')}</div>`;
}

const PHOTO_SLUGS = new Set(['FULL_PHOTO', 'TWO_PHOTOS', 'FOUR_PHOTOS']);
const TEXTE_SLUGS = new Set(['ONE_TESTIMONY', 'TWO_TESTIMONIES', 'THREE_TESTIMONIES']);
const MIXTE_ORDERED_SLUGS = new Set(['PHOTO_TEXT', 'TEXT_PHOTO', 'TWO_PHOTOS_TEXT']);

function renderBlock(block, itemsById, layoutsById) {
  const items = block.itemIds.map((id) => itemsById[id]).filter(Boolean);
  if (items.length === 0) return '';

  const slug = layoutsById[block.layoutId]?.slug;
  const overridesByItemId = Object.fromEntries((block.textOverrides || []).map((override) => [override.itemId, override]));
  const presentationVariant = block.presentationVariant === 1 ? 1 : 0;

  if (slug === 'PHOTO_WITH_CAPTION') return renderPhotoWithCaption(items, slug, overridesByItemId, presentationVariant);
  if (MIXTE_ORDERED_SLUGS.has(slug)) return renderMixteOrderedBlock(items, slug, overridesByItemId, presentationVariant);
  if (PHOTO_SLUGS.has(slug)) return renderPhotoBlock(items, slug, presentationVariant);
  if (TEXTE_SLUGS.has(slug)) return renderTexteBlock(items, slug, overridesByItemId, presentationVariant);

  if (block.kind === 'photo') return renderPhotoBlock(items, slug, presentationVariant);
  if (block.kind === 'texte') return renderTexteBlock(items, slug, overridesByItemId, presentationVariant);
  if (block.kind === 'contribution') return renderContributionBlock(items, slug, overridesByItemId, presentationVariant);
  // 'mixte' ou inconnu, sans slug reconnu ci-dessus : repli generique
  // photo(s) puis texte(s), pour tout layout heritage non catalogue.
  const photos = items.filter((item) => item.kind === 'photo');
  const textes = items.filter((item) => item.kind === 'texte');
  return `<div class="block-mixte">${photos.length ? renderPhotoBlock(photos, slug, presentationVariant) : ''}${
    textes.length ? renderTexteBlock(textes, slug, overridesByItemId, presentationVariant) : ''
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
  /* Sursampling des photos : Chrome rasterise --print-to-pdf a 96dpi fixe,
     sans reglage en ligne de commande pour monter la resolution
     (--force-device-scale-factor est sans effet sur ce pipeline, verifie).
     Astuce : chaque image est mise en page 3x plus grande que son cadre
     puis retassee via transform:scale() — le navigateur echantillonne
     alors la source a une densite ~3x superieure avant la reduction. */
  .photo-frame { position: relative; overflow: hidden; display: block; width: 100%; height: 100%; }
  .photo-frame img { position: absolute; top: 0; left: 0; width: 300%; height: 300%; transform: scale(0.33333); transform-origin: top left; object-fit: cover; }
  .block-photo, .block-texte, .block-contribution, .block-mixte { flex: 1; min-height: 0; display: flex; flex-direction: column; }
  .photo-solo { margin: 0; height: 100%; }
  .photo-inset { padding: 8mm; background: #efe8d8; }
  .photo-inset .photo-frame { border: 1px solid #cbbd9c; box-shadow: 0 2px 10px rgba(0,0,0,0.08); }
  .photo-grid { display: grid; gap: 3mm; height: 100%; }
  .photo-grid-1 { grid-template-columns: 1fr; }
  .photo-grid-2 { grid-template-columns: 1fr 1fr; }
  .photo-grid-duo-v { grid-template-columns: 1fr; grid-template-rows: 1fr 1fr; }
  .photo-grid-3, .photo-grid-4 { grid-template-columns: 1fr 1fr; }
  .photo-grid-5, .photo-grid-6 { grid-template-columns: 1fr 1fr 1fr; }
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
  .contribution-continuation { text-transform: none; letter-spacing: 0; font-style: italic; }
  .split-marker { display: block; text-align: center; font-size: 9pt; color: #9a8f78; margin-top: 2mm; }
  /* PHOTO_WITH_CAPTION (v2) : photo pleine page + courte legende dessous. */
  .photo-with-caption { display: flex; flex-direction: column; height: 100%; gap: 3mm; }
  .photo-with-caption .photo-frame { flex: 1; min-height: 0; }
  .photo-with-caption figcaption { text-align: center; font-size: 11pt; font-style: italic; color: #4a4335; }
  .photo-with-caption.is-framed { padding: 6mm; background: #efe8d8; }
  .photo-with-caption.is-framed .photo-frame { border: 1px solid #cbbd9c; box-shadow: 0 2px 10px rgba(0,0,0,0.08); }
  .photo-with-caption.is-framed figcaption { text-align: left; }
  /* TWO_TESTIMONIES / THREE_TESTIMONIES (v2) : temoignages en cartes distinctes. */
  .testimony-stack { display: grid; gap: 5mm; height: 100%; align-content: center; }
  .testimony-stack-2 { grid-template-columns: 1fr 1fr; }
  .testimony-stack-3 { grid-template-columns: 1fr 1fr 1fr; }
  .testimony-card { padding: 4mm; background: #efe8d8; border-radius: 2mm; }
  .testimony-card p { font-size: 11pt; line-height: 1.6; }
  /* PHOTO_TEXT / TEXT_PHOTO / TWO_PHOTOS_TEXT (v2) : ordre visuel = ordre reel des items. */
  .mixte-ordered { display: flex; flex-direction: column; gap: 5mm; height: 100%; }
  .mixte-ordered .mixte-photo { flex: 1.4; min-height: 0; }
  .mixte-ordered .mixte-photo .photo-frame { height: 100%; }
  .mixte-ordered .mixte-texte { flex: 1; display: flex; align-items: center; }
  .mixte-ordered .mixte-texte p { font-size: 12pt; line-height: 1.6; }
  .mixte-multi-photo { flex-direction: row; flex-wrap: wrap; }
  .mixte-multi-photo .mixte-photo { flex: 1 1 45%; }
  .mixte-multi-photo .mixte-texte { flex-basis: 100%; }
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

/**
 * Rend une seule page en document HTML autonome, dimensionnee pour occuper
 * exactement le viewport (pas de centrage/empilement multi-page). Utilise
 * par pdfService.js pour la capture haute resolution page par page (voir
 * commentaire en tete de pdfService.js sur les limites de --print-to-pdf).
 *
 * @param {object} input
 * @param {object} input.book
 * @param {object} input.page - une entree de compose().pages
 * @param {Array} input.items
 * @param {Array} [input.layouts]
 * @param {object} [input.format]
 * @returns {string}
 */
function renderSinglePageHtml(input) {
  const book = input.book || {};
  const page = input.page;
  const items = Array.isArray(input.items) ? input.items : [];
  const layouts = Array.isArray(input.layouts) ? input.layouts : [];
  const format = input.format || DEFAULT_FORMAT;

  const itemsById = Object.fromEntries(items.map((item) => [item.id, item]));
  const layoutsById = Object.fromEntries(layouts.map((layout) => [layout.id, layout]));
  const blocks = Array.isArray(page.content?.blocks) ? page.content.blocks : [];
  const blocksHtml = blocks.map((block) => renderBlock(block, itemsById, layoutsById)).join('');

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(book.title || 'Page')}</title>
<style>
  :root { --page-width-mm: ${format.trimWidthMm}mm; --page-height-mm: ${format.trimHeightMm}mm; }
  ${BASE_CSS}
  .page { margin: 0; width: 100vw; height: 100vh; }
</style>
</head>
<body>
<section class="page" data-page-index="${page.page_index}"><div class="page-blocks">${blocksHtml}</div></section>
</body>
</html>`;
}

module.exports = {
  renderBookHtml,
  renderSinglePageHtml,
  escapeHtml
};
