// backend/services/composition/photoQualityEngine.js
//
// Calcule la resolution effective (DPI) d'une photo TELLE QU'ELLE SERA
// REELLEMENT IMPRIMEE dans son emplacement — c'est-a-dire sur la zone
// physique (mm) reellement couverte par l'image une fois object-fit:cover
// applique (voir pageRenderer.js), PAS sur la taille brute du fichier
// source (cahier des charges "PhotoSlot", 2026-09-10, §9/§10 : "NE PAS
// calculer le DPI uniquement a partir de la taille originale de la photo").
//
// Fonction pure, aucun acces reseau/disque — meme garantie que
// layoutScoring.js, dont ce module reutilise directement PHOTO_SLOT_RATIOS
// (la FORME reelle de chaque emplacement, deja documentee/verifiee contre
// le vrai CSS grid de pageRenderer.js) plutot que d'en re-deriver un second
// calcul independant qui pourrait diverger avec le temps.

const { PHOTO_SLOT_RATIOS } = require('./layoutScoring');
const { resolveCoverFormat } = require('./coverFormat');
const { resolveFormatDensity } = require('./formatDensity');

const MM_PER_INCH = 25.4;

// Memes constantes que BASE_CSS (pageRenderer.js) : padding de page
// (calc(14mm * scale)) et gap de grille photo (calc(3mm * scale)). Codees
// en dur ici pour la meme raison que d'autres constantes visuelles le sont
// deja ailleurs dans ce module de composition (coverTheme.js, etc.) — ce
// module reste une fonction pure, sans dependance a un parseur CSS.
const PAGE_PADDING_MM = 14;
const GRID_GAP_MM = 3;

// Surface reellement disponible pour le contenu d'une page (apres marges),
// et gap de grille effectif — les deux mis a l'echelle par spaceScale
// (formatDensity.js), exactement comme --fmt-space-scale en CSS.
function resolveUsableAreaMm(formatId) {
  const { trimWidthMm, trimHeightMm } = resolveCoverFormat(formatId);
  const { spaceScale } = resolveFormatDensity(formatId);
  const scale = spaceScale ?? 1;
  const pad = PAGE_PADDING_MM * scale;
  return {
    widthMm: Math.max(1, trimWidthMm - 2 * pad),
    heightMm: Math.max(1, trimHeightMm - 2 * pad),
    gapMm: GRID_GAP_MM * scale
  };
}

// Nombre de colonnes REELLEMENT occupees par ce slot pour ce slug — lu
// directement dans les regles grid-template-columns de BASE_CSS
// (pageRenderer.js : .photo-grid-2/.photo-grid-4/.title-photos-grid-2/-3/-4
// sont toutes a 2 colonnes ; .photo-grid-3 n'a 2 colonnes que pour ses 2
// premiers slots, le 3e prenant toute la largeur via nth-child(3)).
function resolveSlotColumns(slug, slotIndex) {
  if (slug === 'TWO_PHOTOS' || slug === 'TITLE_TWO_PHOTOS' || slug === 'FOUR_PHOTOS' || slug === 'TITLE_FOUR_PHOTOS') return 2;
  if (slug === 'THREE_PHOTOS') return slotIndex === 2 ? 1 : 2;
  // TWO_PHOTOS_STACKED : une seule colonne, deux rangees (.photo-grid-duo-v).
  if (slug === 'TWO_PHOTOS_STACKED') return 1;
  // Mises en page mixtes (2026-09-11) : la photo de PHOTO_TEXT/TEXT_PHOTO
  // occupe toute la largeur (colonne flex), celles de TWO_PHOTOS_TEXT sont
  // cote a cote (.mixte-multi-photo{flex:1 1 45%}) — voir PHOTO_SLOT_RATIOS.
  if (slug === 'PHOTO_TEXT' || slug === 'TEXT_PHOTO') return 1;
  if (slug === 'TWO_PHOTOS_TEXT') return 2;
  return null;
}

// Les mises en page mixtes utilisent un gap de 5mm (.mixte-ordered), pas le
// gap de grille photo de 3mm — meme mise a l'echelle par spaceScale.
const MIXTE_SLUGS = new Set(['PHOTO_TEXT', 'TEXT_PHOTO', 'TWO_PHOTOS_TEXT']);
const MIXTE_GAP_MM = 5;

/**
 * Taille physique (mm) reellement couverte par la photo dans ce slot, une
 * fois object-fit:cover applique — jamais la taille du fichier source.
 * Reutilise PHOTO_SLOT_RATIOS (layoutScoring.js) pour la FORME (largeur
 * connue avec certitude via le nombre de colonnes -> hauteur deduite du
 * ratio deja valide, plutot que re-derivee independamment).
 * @returns {{widthMm:number, heightMm:number}|null} null si le slug/slot
 *   n'est pas reconnu par cette table — l'appelant doit alors s'abstenir
 *   d'evaluer la qualite pour ce slot plutot que de deviner.
 */
function resolveSlotSizeMm(layoutSlug, slotIndex, formatId) {
  const expectedRatios = PHOTO_SLOT_RATIOS[layoutSlug];
  if (!expectedRatios) return null;
  const rawRatio = expectedRatios[slotIndex];
  if (!rawRatio) return null;

  const { widthMm: usableW, heightMm: usableH, gapMm: gap } = resolveUsableAreaMm(formatId);

  // FULL_PHOTO/PHOTO_WITH_CAPTION : la photo occupe (quasi) toute la page —
  // meme repli "page entiere" que PAGE_RATIO_BY_FORMAT dans layoutScoring.js.
  if (rawRatio === 'page') {
    return { widthMm: usableW, heightMm: usableH };
  }

  const columns = resolveSlotColumns(layoutSlug, slotIndex);
  if (!columns) return null;
  const effectiveGap = MIXTE_SLUGS.has(layoutSlug) ? gap * (MIXTE_GAP_MM / GRID_GAP_MM) : gap;
  const widthMm = columns === 2 ? (usableW - effectiveGap) / 2 : usableW;
  const heightMm = widthMm / rawRatio;
  return { widthMm, heightMm };
}

/**
 * DPI effectif = densite de pixels source sur la zone mm REELLEMENT
 * couverte (jamais la photo entiere) apres cover-fit, divisee par le zoom
 * manuel eventuel (zoomer = etaler moins de pixels sources sur la meme
 * zone physique = DPI plus bas). Formule verifiee a la main contre
 * l'exemple du cahier des charges (§9) : 4000x3000px, cadre 20x20cm ->
 * 3000x3000px reellement utilises -> ~381 DPI.
 * @returns {number|null} null si des donnees essentielles manquent
 *   (jamais bloquant pour l'appelant — voir checkImageFit/statutForDpi).
 */
function computeEffectiveDpi({ imageWidthPx, imageHeightPx, frameWidthMm, frameHeightMm, zoom, fitMode }) {
  if (!imageWidthPx || !imageHeightPx || !frameWidthMm || !frameHeightMm) return null;
  const frameWidthIn = frameWidthMm / MM_PER_INCH;
  const frameHeightIn = frameHeightMm / MM_PER_INCH;
  // L'axe contraignant s'inverse selon le mode d'ajustement (2026-09-13) :
  //   - `cover` agrandit l'image jusqu'a couvrir le cadre, donc c'est l'axe
  //     le PLUS etire qui fixe la resolution -> min() ;
  //   - `contain` la reduit jusqu'a tenir entierement, donc c'est l'autre ->
  //     max(), et la resolution est mecaniquement MEILLEURE (l'image occupe
  //     moins de surface imprimee).
  // Garder min() en mode contain produisait un avertissement de flou sur une
  // photo qui n'en souffre pas — une fausse alerte sur un mode que
  // l'utilisateur vient de choisir deliberement.
  const perAxis = [imageWidthPx / frameWidthIn, imageHeightPx / frameHeightIn];
  const baseDpi = fitMode === 'contain' ? Math.max(...perAxis) : Math.min(...perAxis);
  const effectiveZoom = zoom && zoom > 0 ? zoom : 1;
  return baseDpi / effectiveZoom;
}

// Seuils du cahier des charges v2 (2026-09-11) : 3 statuts, pas plus —
// une seule echelle dans toute l'application (badge, ecran recapitulatif,
// statut persiste). Remplace les 5 paliers de la v1 (coupure a 300),
// volontairement : la v2 fixe explicitement 250 et 150.
const DPI_OK = 250;
const DPI_LIMITE = 150;

// Au dela de 15% d'ecart entre le ratio de la photo et celui du cadre, le
// recadrage automatique reste applique (jamais de blocage) mais l'ecart est
// signale : c'est ce qui declenche la proposition de mises en page mieux
// adaptees cote atelier (cahier des charges v2, §1a/§2).
const RATIO_GAP_THRESHOLD = 0.15;

// Messages utilisateur : jamais le mot "DPI" (§2). `ok` n'a volontairement
// aucun message ni badge — critere d'acceptation n°1 : "une photo bien
// cadree et haute resolution ne declenche aucun avertissement visible".
const FIT_DISPLAY = {
  ok: { severity: null, label: '' },
  limite: { severity: 'warning', label: 'Cette photo risque d\'apparaître légèrement floue à l\'impression' },
  insuffisant: { severity: 'danger', label: 'Résolution insuffisante : cette photo risque d\'apparaître floue à l\'impression' }
};

function statutForDpi(dpi) {
  if (!Number.isFinite(dpi)) return null; // donnee manquante -> pas d'avis, jamais un faux avertissement
  if (dpi >= DPI_OK) return 'ok';
  if (dpi >= DPI_LIMITE) return 'limite';
  return 'insuffisant';
}

/**
 * Fonction utilitaire canonique du cahier des charges v2 (§4) — appelee a
 * l'insertion d'une photo dans un cadre (temps reel, via le miroir
 * frontend) ET sur tout le livre avant l'ecran recapitulatif.
 *
 * @returns {{ecartRatio:number|null, dpiEffectif:number|null, statut:'ok'|'limite'|'insuffisant'|null,
 *   severity:string|null, label:string, ratioGap:boolean}}
 *   statut === null uniquement quand une donnee essentielle manque (photo
 *   jamais sondee, cadre inconnu) : l'appelant n'affiche alors rien plutot
 *   que d'inventer un avertissement.
 */
function checkImageFit({ imageWidthPx, imageHeightPx, frameWidthMm, frameHeightMm, zoom, fitMode }) {
  const dpiEffectif = computeEffectiveDpi({ imageWidthPx, imageHeightPx, frameWidthMm, frameHeightMm, zoom, fitMode });
  const statut = statutForDpi(dpiEffectif);
  // En mode "photo entiere", un zoom superieur a 1 recommence a rogner : au
  // dela, l'ecart de forme redevient une coupe, comme en mode `cover`.
  const showsWholePhoto = fitMode === 'contain' && !(zoom > 1);

  let ecartRatio = null;
  if (imageWidthPx && imageHeightPx && frameWidthMm && frameHeightMm) {
    const ratioImage = imageWidthPx / imageHeightPx;
    const ratioCadre = frameWidthMm / frameHeightMm;
    ecartRatio = Math.abs(ratioImage - ratioCadre) / ratioCadre;
  }

  return {
    ecartRatio,
    dpiEffectif: Number.isFinite(dpiEffectif) ? Math.round(dpiEffectif) : null,
    statut,
    // `ratioGap` veut dire "une partie de la photo est coupee" — c'est ce que
    // les ecrans en font (message de recadrage, proposition d'autres mises en
    // page). En mode "photo entiere", RIEN n'est coupe : l'ecart de forme
    // devient de la marge, choisie deliberement. Le signaler comme une coupe
    // serait simplement faux.
    ratioGap: !showsWholePhoto && ecartRatio != null && ecartRatio > RATIO_GAP_THRESHOLD,
    ...(statut ? FIT_DISPLAY[statut] : { severity: null, label: '' })
  };
}

/**
 * Raccourci : meme chose a partir d'un item place dans un emplacement connu
 * (resout le cadre via resolveSlotSizeMm). Retourne null si le slug/slot
 * n'est pas evaluable ou si la photo n'a pas ete sondee a l'upload.
 */
function checkSlotImageFit({ item, layoutSlug, slotIndex, formatId, zoom, fitMode }) {
  const imageWidthPx = item?.metadata?.width;
  const imageHeightPx = item?.metadata?.height;
  if (!imageWidthPx || !imageHeightPx) return null;
  const frame = resolveSlotSizeMm(layoutSlug, slotIndex, formatId);
  if (!frame) return null;
  return checkImageFit({
    imageWidthPx,
    imageHeightPx,
    frameWidthMm: frame.widthMm,
    frameHeightMm: frame.heightMm,
    zoom,
    fitMode
  });
}

/**
 * Parcourt les blocs d'UNE page et renvoie le statut de chaque photo placee
 * (cahier des charges v2, §4 : "Stocker le statut par photo/cadre dans le
 * modele de donnees du livre, pas juste un calcul volatile a l'affichage").
 * Cle = itemId (un meme item n'apparait jamais deux fois sur une page).
 * @returns {object|null} { [itemId]: {statut, dpiEffectif, ecartRatio} } ou
 *   null si rien d'evaluable (aucun champ ajoute a la page dans ce cas).
 */
function computePagePhotoFit({ content, itemsById, layoutsById, formatId }) {
  const blocks = Array.isArray(content?.blocks) ? content.blocks : [];
  const adjustments = content?.photoAdjustments || {};
  const fit = {};

  blocks.forEach((block) => {
    const slug = layoutsById[block.layoutId]?.slug;
    if (!slug) return;
    (block.itemIds || []).forEach((itemId, slotIndex) => {
      const item = itemId ? itemsById[itemId] : null;
      if (!item || item.kind !== 'photo') return;
      const result = checkSlotImageFit({
        item,
        layoutSlug: slug,
        slotIndex,
        formatId,
        zoom: adjustments[itemId]?.zoom,
        fitMode: adjustments[itemId]?.fitMode
      });
      if (!result || !result.statut) return;
      fit[itemId] = {
        statut: result.statut,
        dpiEffectif: result.dpiEffectif,
        ecartRatio: result.ecartRatio == null ? null : Math.round(result.ecartRatio * 1000) / 1000,
        // Persiste pour que l'ecran recapitulatif avant commande n'annonce pas
        // une coupe sur une photo affichee entiere.
        ratioGap: result.ratioGap
      };
    });
  });

  return Object.keys(fit).length > 0 ? fit : null;
}

/**
 * Meme chose sur une liste de pages, en renvoyant de NOUVELLES pages
 * annotees (jamais de mutation en place — ces objets viennent souvent
 * directement du moteur de composition). Le serveur annote TOUJOURS a
 * l'ecriture ; le client n'envoie jamais ce champ lui-meme.
 */
function annotatePagesWithPhotoFit({ pages, items, layouts, formatId }) {
  const itemsById = Object.fromEntries((items || []).map((item) => [item.id, item]));
  const layoutsById = Object.fromEntries((layouts || []).map((layout) => [layout.id, layout]));

  return (pages || []).map((page) => {
    const photoFit = computePagePhotoFit({ content: page.content, itemsById, layoutsById, formatId });
    if (!photoFit) {
      // Jamais de champ vide laisse en base, et un ancien photoFit devenu
      // sans objet (page videe/recomposee) est retire proprement.
      if (!page.content?.photoFit) return page;
      const { photoFit: _drop, ...rest } = page.content;
      return { ...page, content: rest };
    }
    return { ...page, content: { ...page.content, photoFit } };
  });
}

module.exports = {
  resolveUsableAreaMm,
  resolveSlotSizeMm,
  computeEffectiveDpi,
  checkImageFit,
  checkSlotImageFit,
  statutForDpi,
  computePagePhotoFit,
  annotatePagesWithPhotoFit,
  FIT_DISPLAY,
  DPI_OK,
  DPI_LIMITE,
  RATIO_GAP_THRESHOLD,
  PAGE_PADDING_MM,
  GRID_GAP_MM
};
