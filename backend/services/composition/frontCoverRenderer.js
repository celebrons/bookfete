// backend/services/composition/frontCoverRenderer.js
//
// Rendu pur de la 1ere de couverture : une entree de page deja decidee par
// coverComposer.js (variante, photo(s), titre, theme deja resolus) devient
// un fragment HTML <section class="page">. Ne prend aucune decision —
// meme principe que pageRenderer.js pour les pages interieures.
//
// Reutilise verbatim escapeHtml()/imgFrame() de pageRenderer.js : meme
// technique de sur-echantillonnage (jamais de deformation, object-fit:cover)
// que le reste du livre.

const { escapeHtml, imgFrame } = require('./pageRenderer');

// --- Echelle typographique -------------------------------------------------
// Valeurs de reference pour le format standard (210x297mm), mises a
// l'echelle proportionnellement a la hauteur de trim des autres formats.
// Toutes ajustables ici, un seul endroit.

const TYPE_SCALE = {
  titleMinimal: 46,
  titlePhotoTitle: 34,
  titlePhotoBand: 22,
  titleMulti: 24,
  titleSplit: 32,
  titleFramed: 28,
  subtitle: 15,
  subtitlePhoto: 14,
  subtitleBand: 11.5,
  subtitleSplit: 13,
  subtitleFramed: 13,
  date: 10.5,
  datePhoto: 10,
  kicker: 9.5
};

function scaleFor(format) {
  return (format?.trimHeightMm || 297) / 297;
}

function pt(value, scale) {
  return `${(value * scale).toFixed(2)}pt`;
}

// Cadre photo avec biais de recadrage deterministe (pas d'IA) : une photo
// source portrait est ancree legerement au-dessus du centre (une tete est
// plus souvent dans la moitie haute d'un portrait qu'au centre exact) ;
// toute autre orientation reste centree. Jamais applique aux vignettes de
// COVER_MULTI_PHOTO (trop petites pour qu'un biais serve a quelque chose).
// `adjustment` : { focalX, focalY, zoom, fitMode } choisi a la main sur la
// couverture (cover_overrides.frontPhotoAdjust / backPhotoAdjust, voir
// coverComposer). Absent = cadrage automatique centre, exactement le rendu
// d'avant — aucun appelant existant n'a besoin de changer.
//
// Sans lui, la photo de couverture etait TOUJOURS recadree au centre et rien
// ne permettait de la corriger : un visage decentre se retrouvait coupe, sans
// recours (retour utilisateur 2026-09-15 : « il faut pouvoir ajuster la photo
// de la 4e de couverture, la photo est tronquee »).
function coverImgFrame(item, { biasPortrait = true, adjustment = null } = {}) {
  const frame = imgFrame(item?.url, adjustment);
  if (biasPortrait && item?.metadata?.orientation === 'portrait') {
    // Remplacement sur le DEBUT de l'attribut seulement : imgFrame peut avoir
    // ajoute "is-contain" (mode photo entiere), et un remplacement exact
    // n'aurait alors rien trouve.
    return frame.replace('class="photo-frame', 'class="photo-frame cvr-bias-portrait');
  }
  return frame;
}

function safeText(value, maxLength) {
  return escapeHtml(String(value || '').trim()).slice(0, maxLength);
}

function kickerHtml(kicker) {
  return kicker ? `<div class="cvr-kicker">${safeText(kicker, 60)}</div>` : '';
}

function subtitleHtml(subtitle, sizePt) {
  return subtitle ? `<p class="cvr-subtitle" style="font-size:${sizePt}">${safeText(subtitle, 220)}</p>` : '';
}

function dateHtml(dateLabel, sizePt) {
  return dateLabel ? `<div class="cvr-date" style="font-size:${sizePt}">${safeText(dateLabel, 20)}</div>` : '';
}

// Classes conditionnelles derivees du theme (voir coverTheme.applyFormatAccent)
// — regroupees ici plutot que dupliquees dans chaque renderer (front/back
// partagent exactement les memes regles CSS, COVER_BASE_CSS). Une classe
// vide (theme sans cette propriete) ne pose jamais rien : repli silencieux.
function themeOrnamentClasses(theme) {
  return [
    theme.ornament === 'gold-frame' ? 'has-gold-frame' : '',
    theme.titleEffect === 'emboss' ? 'is-embossed' : ''
  ].filter(Boolean).join(' ');
}

// Matiere lin/toile (Luxe uniquement) : motif tisse suggere par deux trames
// diagonales croisees a tres faible opacite, jamais une image (le rendu
// reste autonome/sans asset). Genere ICI (pas en classe CSS statique) : le
// style inline `background:${theme.paper}` deja pose sur <section> est un
// raccourci CSS qui reinitialise silencieusement background-image a `none`
// — une regle de classe .has-linen-texture serait donc toujours ecrasee par
// cet inline. La texture doit faire partie du MEME style inline pour
// s'appliquer reellement.
function backgroundStyleFor(theme, color) {
  const resolved = color || '#fff';
  if (theme.texture !== 'linen') return `background:${resolved}`;
  const weave = 'repeating-linear-gradient(45deg, rgba(60,48,30,0.05) 0px, rgba(60,48,30,0.05) 1px, transparent 1px, transparent 3px),'
    + 'repeating-linear-gradient(-45deg, rgba(60,48,30,0.05) 0px, rgba(60,48,30,0.05) 1px, transparent 1px, transparent 3px)';
  return `background-color:${resolved};background-image:${weave}`;
}

function themeStyle(theme) {
  return [
    `--cvr-ink:${theme.ink}`,
    `--cvr-accent:${theme.accent}`,
    // accentDeep (voir coverTheme.applyFormatAccent, Luxe uniquement) : replie
    // sur accent si absent, jamais une valeur manquante en CSS.
    `--cvr-accent-deep:${theme.accentDeep || theme.accent}`,
    `--cvr-title-font:${theme.titleFont}`,
    `--cvr-secondary-font:${theme.secondaryFont}`,
    `--cvr-title-weight:${theme.titleFontWeight}`,
    `--cvr-title-style:${theme.titleFontStyle}`
  ].join(';');
}

function renderCoverPhoto(content, theme, scale) {
  const photoItem = content.photos?.[0];
  const titleSize = pt(TYPE_SCALE.titlePhotoBand, scale);
  const subtitleSize = pt(TYPE_SCALE.subtitleBand, scale);
  const dateSize = pt(TYPE_SCALE.datePhoto, scale);

  return `
    <figure class="cvr-photo-zone" style="height:80%;margin:0;">
      ${photoItem ? coverImgFrame(photoItem, { adjustment: content.photoAdjust }) : ''}
    </figure>
    <div class="cvr-safe cvr-band" style="height:20%;${backgroundStyleFor(theme, theme.paper)};">
      ${kickerHtml(content.kicker)}
      <h1 class="cvr-title cvr-title-clamp-1" style="font-size:${titleSize}">${safeText(content.title, 180)}</h1>
      ${subtitleHtml(content.subtitle, subtitleSize)}
      ${dateHtml(content.dateLabel, dateSize)}
    </div>
  `;
}

function renderCoverPhotoTitle(content, theme, scale) {
  const photoItem = content.photos?.[0];
  const titleSize = pt(TYPE_SCALE.titlePhotoTitle, scale);
  const subtitleSize = pt(TYPE_SCALE.subtitlePhoto, scale);
  const dateSize = pt(TYPE_SCALE.datePhoto, scale);

  return `
    <figure class="cvr-photo-full" style="height:100%;margin:0;">
      ${photoItem ? coverImgFrame(photoItem, { adjustment: content.photoAdjust }) : ''}
    </figure>
    <div class="cvr-scrim" aria-hidden="true"></div>
    <div class="cvr-safe cvr-on-photo">
      ${kickerHtml(content.kicker)}
      <h1 class="cvr-title cvr-title-clamp-2 cvr-title-on-photo" style="font-size:${titleSize}">${safeText(content.title, 180)}</h1>
      ${subtitleHtml(content.subtitle, subtitleSize)}
      ${dateHtml(content.dateLabel, dateSize)}
    </div>
  `;
}

function renderCoverMinimal(content, theme, scale) {
  const titleSize = pt(TYPE_SCALE.titleMinimal, scale);
  const subtitleSize = pt(TYPE_SCALE.subtitle, scale);
  const dateSize = pt(TYPE_SCALE.date, scale);

  return `
    <div class="cvr-safe cvr-minimal-stack" style="${backgroundStyleFor(theme, theme.bg)};">
      ${kickerHtml(content.kicker)}
      <h1 class="cvr-title cvr-title-clamp-3" style="font-size:${titleSize}">${safeText(content.title, 180)}</h1>
      <hr class="cvr-rule" />
      ${subtitleHtml(content.subtitle, subtitleSize)}
      ${dateHtml(content.dateLabel, dateSize)}
    </div>
  `;
}

function renderCoverMultiPhoto(content, theme, scale) {
  const photos = content.photos || [];
  const hero = photos[0];
  const side = photos.slice(1, 3);
  const titleSize = pt(TYPE_SCALE.titleMulti, scale);
  const subtitleSize = pt(TYPE_SCALE.subtitleBand, scale);

  return `
    <figure class="cvr-photo-zone" style="height:52%;margin:0;">
      ${hero ? coverImgFrame(hero, { biasPortrait: false }) : ''}
    </figure>
    <div class="cvr-multi-pair" style="height:26%;">
      ${side.map((item) => `<figure style="margin:0;flex:1;">${coverImgFrame(item, { biasPortrait: false })}</figure>`).join('')}
    </div>
    <div class="cvr-safe cvr-band" style="height:22%;${backgroundStyleFor(theme, theme.paper)};">
      ${kickerHtml(content.kicker)}
      <h1 class="cvr-title cvr-title-clamp-1" style="font-size:${titleSize}">${safeText(content.title, 180)}</h1>
      ${subtitleHtml(content.subtitle, subtitleSize)}
    </div>
  `;
}

// COVER_SPLIT (v3) : photo pleine hauteur sur ~55% de largeur (gauche),
// panneau de texte sur le reste — split editorial, different des bandeaux/
// pleine-page deja existants.
function renderCoverSplit(content, theme, scale) {
  const photoItem = content.photos?.[0];
  const titleSize = pt(TYPE_SCALE.titleSplit, scale);
  const subtitleSize = pt(TYPE_SCALE.subtitleSplit, scale);
  const dateSize = pt(TYPE_SCALE.date, scale);

  return `
    <div class="cvr-split">
      <figure class="cvr-split-photo" style="margin:0;">
        ${photoItem ? coverImgFrame(photoItem, { adjustment: content.photoAdjust }) : ''}
      </figure>
      <div class="cvr-safe cvr-split-text" style="${backgroundStyleFor(theme, theme.paper)};">
        ${kickerHtml(content.kicker)}
        <h1 class="cvr-title cvr-title-clamp-3" style="font-size:${titleSize}">${safeText(content.title, 180)}</h1>
        ${subtitleHtml(content.subtitle, subtitleSize)}
        ${dateHtml(content.dateLabel, dateSize)}
      </div>
    </div>
  `;
}

// COVER_FRAMED (v3) : photo inseree dans un cadre avec marge genereuse,
// titre/sous-titre/date centres en dessous — esprit "etiquette de galerie",
// beaucoup de blanc.
function renderCoverFramed(content, theme, scale) {
  const photoItem = content.photos?.[0];
  const titleSize = pt(TYPE_SCALE.titleFramed, scale);
  const subtitleSize = pt(TYPE_SCALE.subtitleFramed, scale);
  const dateSize = pt(TYPE_SCALE.date, scale);

  return `
    <div class="cvr-safe cvr-framed-stack" style="${backgroundStyleFor(theme, theme.bg)};">
      <figure class="cvr-framed-photo">
        ${photoItem ? coverImgFrame(photoItem, { adjustment: content.photoAdjust }) : ''}
      </figure>
      <div class="cvr-framed-text">
        ${kickerHtml(content.kicker)}
        <h1 class="cvr-title cvr-title-clamp-2" style="font-size:${titleSize}">${safeText(content.title, 180)}</h1>
        ${subtitleHtml(content.subtitle, subtitleSize)}
        ${dateHtml(content.dateLabel, dateSize)}
      </div>
    </div>
  `;
}

const VARIANT_RENDERERS = {
  COVER_PHOTO: renderCoverPhoto,
  COVER_PHOTO_TITLE: renderCoverPhotoTitle,
  COVER_MINIMAL: renderCoverMinimal,
  COVER_MULTI_PHOTO: renderCoverMultiPhoto,
  COVER_SPLIT: renderCoverSplit,
  COVER_FRAMED: renderCoverFramed
};

// Ordre stable des 6 formats + AUTO : reutilise par le frontend pour la
// galerie de choix (BookCoverDesignerLuxe.js) afin que les deux cotes ne
// puissent jamais diverger sur la liste des formats disponibles.
const FRONT_COVER_VARIANTS = ['COVER_PHOTO', 'COVER_PHOTO_TITLE', 'COVER_MINIMAL', 'COVER_MULTI_PHOTO', 'COVER_SPLIT', 'COVER_FRAMED'];

/**
 * @param {object} page - page-entry produite par coverComposer.composeFrontCover
 *   (content: { variant, itemIds, title, kicker, subtitle, dateLabel, theme })
 * @param {object} context - { format, isLast, itemsById }
 * @returns {string} un <section class="page ..."> autonome
 */
function renderFrontCoverPage(page, context = {}) {
  const content = page?.content || {};
  const theme = content.theme || {};
  const format = context.format || { trimWidthMm: 210, trimHeightMm: 297 };
  const itemsById = context.itemsById || {};
  const scale = scaleFor(format);
  const safeMarginMm = format.safeMarginMm ?? 15;

  const photos = (content.itemIds || []).map((id) => itemsById[id]).filter(Boolean);
  const renderVariant = VARIANT_RENDERERS[content.variant] || renderCoverMinimal;
  const inner = renderVariant({ ...content, photos }, theme, scale);

  const pageClass = context.isLast ? 'page cvr-page cvr-front' : 'page page-break cvr-page cvr-front';
  const variantClass = `cvr-variant-${content.variant || 'COVER_MINIMAL'}`;
  // Cadre dore / texture lin / embossage (Luxe uniquement, voir
  // coverTheme.applyFormatAccent) : classes conditionnelles plutot que du
  // style inline, pour rester dans COVER_BASE_CSS (partage front/back) avec
  // les regles deja postees une seule fois.
  const ornamentClass = themeOrnamentClasses(theme);

  return `<section class="${pageClass} ${variantClass} ${ornamentClass}" data-page-index="${page.page_index}" data-cvr-role="front-cover" style="${backgroundStyleFor(theme, theme.paper)};${themeStyle(theme)};--cvr-safe-margin:${safeMarginMm}mm;">${inner}</section>`;
}

// --- CSS partage entre 1ere et 4eme de couverture (primitives) ------------
// Prefixe cvr- deliberement distinct de .cover-* (deja utilise par l'ancien
// systeme de couverture, backend/routes/books.js et BookCoverDesignerLuxe.js)
// — aucune collision d'execution possible (documents HTML separes), juste
// une hygiene de lecture.
const COVER_BASE_CSS = `
  .page.cvr-page { padding: 0; overflow: hidden; display: flex; flex-direction: column; position: relative; }
  .cvr-safe { box-sizing: border-box; position: relative; z-index: 2; padding: var(--cvr-safe-margin, 15mm); }
  .cvr-band { display: flex; flex-direction: column; justify-content: center; }
  .cvr-photo-zone, .cvr-photo-full { position: relative; overflow: hidden; }
  .cvr-photo-zone .photo-frame, .cvr-photo-full .photo-frame { width: 100%; height: 100%; }
  .cvr-photo-full { position: absolute; inset: 0; height: 100% !important; }
  .photo-frame.cvr-bias-portrait img { object-position: center 30%; }
  .cvr-multi-pair { display: flex; gap: 2mm; }
  .cvr-multi-pair .photo-frame { width: 100%; height: 100%; }
  .cvr-title { margin: 0; font-family: var(--cvr-title-font); font-weight: var(--cvr-title-weight, 500); font-style: var(--cvr-title-style, normal); color: var(--cvr-ink); line-height: 1.1; text-wrap: balance; }
  .cvr-title-clamp-1 { display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; overflow: hidden; text-overflow: ellipsis; }
  .cvr-title-clamp-2 { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; text-overflow: ellipsis; }
  .cvr-title-clamp-3 { display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; text-overflow: ellipsis; }
  .cvr-kicker { margin: 0 0 3mm; font-family: var(--cvr-secondary-font); font-size: 9.5pt; letter-spacing: 0.16em; text-transform: uppercase; color: var(--cvr-accent); }
  .cvr-subtitle { margin: 4mm 0 0; font-family: var(--cvr-secondary-font); font-style: italic; color: var(--cvr-ink); opacity: 0.85; }
  .cvr-date { margin: 4mm 0 0; font-family: var(--cvr-secondary-font); letter-spacing: 0.12em; text-transform: uppercase; color: var(--cvr-ink); opacity: 0.7; }
  .cvr-rule { width: calc(16mm * var(--fmt-space-scale, 1)); height: 1px; background: var(--cvr-accent); margin: 5mm 0; border: none; }
  .cvr-brand { font-family: var(--cvr-secondary-font); font-size: 8pt; letter-spacing: 0.22em; text-transform: uppercase; color: var(--cvr-accent); opacity: 0.75; text-align: center; }
  /* Cadre dore (Luxe uniquement — coverTheme.applyFormatAccent) : double
     filet en surimpression, inset depuis le bord reel de la page (pas
     depuis --cvr-safe-margin, pour rester visible meme sur une variante
     "photo pleine page" ou --cvr-safe n'entoure pas tout le contenu).
     z-index au-dessus du scrim (COVER_SCRIM=1) et de la photo, sous rien —
     c'est la derniere couche. */
  .cvr-page.has-gold-frame::before,
  .cvr-page.has-gold-frame::after {
    content: '';
    position: absolute;
    pointer-events: none;
    z-index: 3;
    border-style: solid;
  }
  .cvr-page.has-gold-frame::before {
    inset: calc(5mm * var(--fmt-space-scale, 1));
    border-width: 1.4px;
    border-color: var(--cvr-accent-deep, var(--cvr-accent));
  }
  .cvr-page.has-gold-frame::after {
    inset: calc(6.6mm * var(--fmt-space-scale, 1));
    border-width: 0.6px;
    border-color: var(--cvr-accent);
    opacity: 0.65;
  }
  /* Embossage discret du titre (Luxe uniquement) : ombre claire en haut a
     gauche + ombre sombre en bas a droite, illusion d'un titre presse dans
     la matiere plutot qu'imprime dessus. N'a de sens que sur un fond clair
     (l'ivoire du Luxe) — jamais applique ailleurs. Selecteur descendant
     (pas .cvr-title.is-embossed) : la classe is-embossed est posee sur la
     <section> (voir themeOrnamentClasses), le titre est rendu plus loin a
     l'interieur par les fonctions par variante (renderCoverMinimal etc.) —
     jamais les deux classes sur le meme element. */
  .cvr-page.is-embossed .cvr-title {
    text-shadow: -0.3px -0.3px 0.4px rgba(255, 255, 255, 0.65), 0.4px 0.4px 0.6px rgba(60, 48, 30, 0.35);
  }
`;

const FRONT_COVER_CSS = `
  .cvr-minimal-stack { flex: 1; display: flex; flex-direction: column; justify-content: center; align-items: flex-start; padding-bottom: 8%; }
  .cvr-scrim {
    position: absolute; left: 0; right: 0; bottom: 0; height: 42%;
    background: linear-gradient(to top, rgba(10,8,4,0.72) 0%, rgba(10,8,4,0.46) 38%, rgba(10,8,4,0) 100%);
    z-index: 1;
  }
  .cvr-on-photo { position: absolute; left: 0; right: 0; bottom: 0; }
  .cvr-title-on-photo { color: #fdfaf3; text-shadow: 0 1px 3px rgba(0,0,0,0.55), 0 0 1px rgba(0,0,0,0.35); }
  .cvr-on-photo .cvr-subtitle, .cvr-on-photo .cvr-date { color: #fdfaf3; }
  .cvr-on-photo .cvr-kicker { color: #e9dcb8; }
  /* COVER_SPLIT (v3) : photo pleine hauteur a gauche, panneau de texte a droite. */
  .cvr-split { display: flex; flex-direction: row; height: 100%; }
  .cvr-split-photo { flex: 0 0 55%; position: relative; overflow: hidden; }
  .cvr-split-photo .photo-frame { width: 100%; height: 100%; }
  .cvr-split-text { flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: center; }
  /* COVER_FRAMED (v3) : photo encadree, marge genereuse, titre en dessous. */
  .cvr-framed-stack { height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; gap: 8mm; }
  .cvr-framed-photo { margin: 0; width: 66%; aspect-ratio: 3 / 4; padding: 6mm; background: rgba(0,0,0,0.04); border: 1px solid rgba(0,0,0,0.14); box-shadow: 0 2px 14px rgba(0,0,0,0.08); box-sizing: border-box; }
  .cvr-framed-photo .photo-frame { width: 100%; height: 100%; }
  .cvr-framed-text { max-width: 80%; }
  .cvr-framed-text .cvr-title { text-align: center; }
  .cvr-framed-text .cvr-subtitle, .cvr-framed-text .cvr-date { text-align: center; }
`;

module.exports = {
  renderFrontCoverPage,
  COVER_BASE_CSS,
  FRONT_COVER_CSS,
  FRONT_COVER_VARIANTS,
  TYPE_SCALE,
  scaleFor,
  pt,
  safeText,
  themeStyle,
  themeOrnamentClasses,
  backgroundStyleFor,
  coverImgFrame
};
