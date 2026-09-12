// backend/services/composition/textQualityEngine.js
//
// Controle qualite des TEXTES avant impression (cahier des charges
// "Systeme typographique" §19). Pendant exact de photoQualityEngine.js, et
// volontairement construit sur le meme modele : memes 3 statuts, meme forme
// d'annotation persistee, meme branchement dans la route de verification
// avant commande — pour qu'il n'y ait qu'UN ecran recapitulatif a lire, pas
// deux systemes d'avertissement concurrents.
//
// Fonctions pures. Miroir frontend : frontend/src/components/book/atelier/
// textQuality.js (meme convention de duplication assumee que photoQuality).
//
// Ce que ce module verifie (§19) :
//   - debordement : le texte ne tient pas dans son emplacement ;
//   - taille minimale imprimable : en dessous, l'encre bave et le texte
//     devient penible a lire sur papier ;
//   - contraste : uniquement quand le texte est REELLEMENT pose sur une
//     photo (voir computePageTextFit) ;
//   - proximite du bord / de la reliure : marges de securite.
//
// Ce qu'il ne verifie PAS, faute de pouvoir le faire honnetement ici : la
// coherence typographique globale du livre (elle est garantie par
// construction, l'utilisateur ne pouvant pas choisir de police libre).

const typography = require('./typographySystem');
const { resolveCoverFormat } = require('./coverFormat');
const { resolveFormatDensity } = require('./formatDensity');

// Taille minimale reellement imprimable. En dessous de 7pt, une impression
// offset/numerique standard ne garantit plus une lecture confortable — c'est
// la borne basse du role 'caption' (8pt) moins une marge de tolerance, pour
// qu'un ajustement automatique legitime ne declenche pas d'alerte.
const MIN_PRINTABLE_PT = 7;
// En dessous de cette valeur on previent sans bloquer : c'est lisible, mais
// on s'approche de la limite.
const LIMITE_PRINTABLE_PT = 8;

// Marges de securite, en mm, mesurees depuis le bord du papier (§19). La
// reliure demande davantage que les bords libres : c'est le cote ou la page
// se courbe et ou le texte devient difficile a lire.
const SAFE_EDGE_MM = 8;
const SAFE_BINDING_MM = 14;

const STATUTS = { OK: 'ok', LIMITE: 'limite', INSUFFISANT: 'insuffisant' };

const FIT_DISPLAY = {
  [STATUTS.OK]: { severity: 'ok', label: 'Texte bien place' },
  [STATUTS.LIMITE]: { severity: 'warning', label: 'Texte a verifier' },
  [STATUTS.INSUFFISANT]: { severity: 'error', label: 'Texte trop long ou trop petit' }
};

// Zone de texte reellement disponible sur une page, marges de page deduites.
// Reprend les memes constantes que photoQualityEngine (PAGE_PADDING_MM 14,
// mis a l'echelle par spaceScale) pour que les deux moteurs decrivent la
// meme page — les desynchroniser produirait deux verites sur une meme
// geometrie.
const PAGE_PADDING_MM = 14;

function resolveUsableAreaMm(formatId) {
  const { trimWidthMm, trimHeightMm } = resolveCoverFormat(formatId);
  const { spaceScale } = resolveFormatDensity(formatId);
  const pad = PAGE_PADDING_MM * (spaceScale ?? 1);
  return {
    widthMm: Math.max(1, trimWidthMm - 2 * pad),
    heightMm: Math.max(1, trimHeightMm - 2 * pad),
    paddingMm: pad
  };
}

// Part de la hauteur utile qu'occupe l'emplacement TEXTE d'un layout donne.
// Valeurs lues sur le CSS reel de pageRenderer (flex) plutot que devinees :
// un texte partageant la page avec une photo n'a evidemment pas toute la
// hauteur. `null` = layout inconnu de cette table, on ne prononce alors
// aucun jugement plutot que d'en inventer un.
const TEXT_SLOT_HEIGHT_SHARE = {
  ONE_TESTIMONY: 1,
  'texte-pleine': 1,
  TWO_TESTIMONIES: 0.5,
  THREE_TESTIMONIES: 0.33,
  PHOTO_TEXT: 0.4,
  TEXT_PHOTO: 0.4,
  TWO_PHOTOS_TEXT: 0.3,
  TITLE_TEXT: 0.75,
  PHOTO_WITH_CAPTION: 0.1,
  TITLE_TWO_PHOTOS: 0.2,
  TITLE_FOUR_PHOTOS: 0.18
};

// Layouts ou le texte est pose SUR une photo. Aujourd'hui aucun layout du
// catalogue ne le fait (le texte est toujours a cote, jamais dessus) : la
// table existe pour que le controle de contraste s'active automatiquement le
// jour ou un tel layout apparait, plutot que d'etre oublie a ce moment-la.
const TEXT_OVER_PHOTO_SLUGS = new Set();

// Role par defaut d'un emplacement texte selon le layout et la position.
// C'est la hierarchie editoriale du §14 : une page a UN element dominant.
function defaultRoleForSlot(layoutSlug, slotIndex) {
  if (layoutSlug === 'PHOTO_WITH_CAPTION') return 'caption';
  if (layoutSlug === 'TITLE_TEXT') return slotIndex === 0 ? 'title' : 'body';
  if (layoutSlug === 'TITLE_TWO_PHOTOS' || layoutSlug === 'TITLE_FOUR_PHOTOS') return 'title';
  if (layoutSlug === 'ONE_TESTIMONY' || layoutSlug === 'texte-citation') return 'quote';
  return 'body';
}

function statutForTextFit({ fit, sizePt }) {
  if (fit.status === 'overflow') return STATUTS.INSUFFISANT;
  if (sizePt < MIN_PRINTABLE_PT) return STATUTS.INSUFFISANT;
  if (sizePt < LIMITE_PRINTABLE_PT) return STATUTS.LIMITE;
  if (fit.status === 'reduced') return STATUTS.LIMITE;
  return STATUTS.OK;
}

// Verification complete d'UN texte dans UN emplacement.
function checkTextFit({
  text,
  role,
  layoutSlug,
  slotIndex = 0,
  formatId,
  overrides = {},
  backgroundHex = null
}) {
  const safeRole = typography.normalizeRole(role || defaultRoleForSlot(layoutSlug, slotIndex));
  const usable = resolveUsableAreaMm(formatId);
  const heightShare = TEXT_SLOT_HEIGHT_SHARE[layoutSlug];

  if (heightShare == null) {
    // Layout inconnu : on le dit, on ne devine pas. Cohérent avec
    // photoQualityEngine, qui renvoie aussi null plutot qu'un faux verdict.
    return null;
  }

  const slotWidthMm = usable.widthMm;
  const slotHeightMm = usable.heightMm * heightShare;

  const fit = typography.fitTextToSlot({
    text, role: safeRole, formatId, slotWidthMm, slotHeightMm, overrides
  });

  // La taille appliquee tient compte d'un eventuel reglage utilisateur, mais
  // reste bornee par le role (resolveRoleStyle clampe deja).
  const style = typography.resolveRoleStyle(safeRole, formatId, overrides);
  // Une taille CHOISIE a la main fait foi ; sinon c'est l'ajustement
  // automatique qui decide, dans les deux sens (il sait desormais agrandir un
  // texte court, pas seulement reduire un texte long — voir fitTextToSlot).
  // L'ancien Math.min() annulait silencieusement tout agrandissement.
  const sizePt = Number.isFinite(Number(overrides.sizePt)) ? style.fontSizePt : fit.fontSizePt;

  const reasons = [];
  if (fit.status === 'overflow') {
    reasons.push(`Le texte depasse d'environ ${Math.max(1, Math.round(fit.overflowMm))} mm, meme a la taille minimale.`);
  }
  if (sizePt < MIN_PRINTABLE_PT) {
    reasons.push(`Taille ${sizePt} pt : en dessous du minimum imprimable (${MIN_PRINTABLE_PT} pt).`);
  } else if (sizePt < LIMITE_PRINTABLE_PT) {
    reasons.push(`Taille ${sizePt} pt : lisible, mais proche de la limite d'impression.`);
  } else if (fit.status === 'reduced') {
    reasons.push('Le texte a ete reduit automatiquement pour tenir dans son emplacement.');
  }

  // Contraste : uniquement si le texte est reellement sur une photo et qu'on
  // connait la teinte de fond. Sans mesure reelle, se taire plutot que
  // d'inventer un verdict.
  let contrast = null;
  if (TEXT_OVER_PHOTO_SLUGS.has(layoutSlug) && backgroundHex) {
    contrast = typography.checkTextContrast({
      colorHex: style.color, backgroundHex, sizePt
    });
    if (!contrast.ok) {
      reasons.push(`Contraste ${contrast.ratio}:1 sur la photo (minimum ${contrast.required}:1) : un voile leger est necessaire.`);
    }
  }

  let statut = statutForTextFit({ fit, sizePt });
  if (contrast && !contrast.ok && statut === STATUTS.OK) statut = STATUTS.LIMITE;

  return {
    role: safeRole,
    statut,
    severity: FIT_DISPLAY[statut].severity,
    label: FIT_DISPLAY[statut].label,
    sizePt,
    minPt: style.minPt,
    maxPt: style.maxPt,
    lines: fit.lines,
    fitStatus: fit.status,
    overflowMm: fit.overflowMm ?? 0,
    estimatedHeightMm: fit.estimatedHeightMm,
    availableHeightMm: fit.usableHeightMm,
    contrastRatio: contrast ? contrast.ratio : null,
    needsScrim: contrast ? contrast.needsScrim : false,
    charCount: String(text || '').trim().length,
    reasons
  };
}

// Marges de securite : un bloc dont le bord tombe trop pres du papier ou de
// la reliure (§19). `edgeMm`/`bindingMm` sont les distances REELLES du bloc
// au bord — l'appelant les connait mieux que nous.
function checkSafeArea({ edgeMm, bindingMm }) {
  const problems = [];
  if (Number.isFinite(edgeMm) && edgeMm < SAFE_EDGE_MM) {
    problems.push(`Le texte est a ${Math.round(edgeMm)} mm du bord (minimum conseille ${SAFE_EDGE_MM} mm).`);
  }
  if (Number.isFinite(bindingMm) && bindingMm < SAFE_BINDING_MM) {
    problems.push(`Le texte est a ${Math.round(bindingMm)} mm de la reliure (minimum conseille ${SAFE_BINDING_MM} mm).`);
  }
  return { ok: problems.length === 0, problems };
}

// Annote une page entiere. Meme forme de sortie que computePagePhotoFit :
// un objet indexe par itemId, range dans `content.textFit`, pour que l'ecran
// recapitulatif avant commande lise les deux de la meme facon.
const indexById = (rows) => Object.fromEntries((rows || []).map((row) => [row.id, row]));

function computePageTextFit({ page, itemsById, layoutsById, formatId }) {
  const layout = page?.layout_id ? layoutsById[page.layout_id] : null;
  const slug = layout?.slug;
  const itemIds = Array.isArray(page?.content?.itemIds) ? page.content.itemIds : [];
  const roles = page?.content?.textRoles || {};
  const styles = page?.content?.textStyles || {};

  const result = {};
  itemIds.forEach((itemId, slotIndex) => {
    if (!itemId) return;
    const item = itemsById[itemId];
    if (!item || item.kind !== 'texte') return;

    const check = checkTextFit({
      text: item.text,
      role: roles[itemId] || defaultRoleForSlot(slug, slotIndex),
      layoutSlug: slug,
      slotIndex,
      formatId,
      overrides: styles[itemId] || {}
    });
    if (check) result[itemId] = check;
  });

  return result;
}

// Ajoute/rafraichit `content.textFit` sur chaque page — jamais destructif :
// le reste de `content` est preserve tel quel.
//
// Signature volontairement IDENTIQUE a photoQualityEngine.annotatePagesWith-
// PhotoFit ({pages, items, layouts, formatId}) : les deux moteurs sont
// chaines aux memes endroits dans routes/composition.js, et devoir se
// souvenir que l'un prend des tableaux et l'autre des index serait une
// source d'erreur gratuite.
function annotatePagesWithTextFit({ pages, items, layouts, formatId }) {
  const itemsById = indexById(items);
  const layoutsById = indexById(layouts);
  return (pages || []).map((page) => ({
    ...page,
    content: {
      ...(page.content || {}),
      textFit: computePageTextFit({ page, itemsById, layoutsById, formatId })
    }
  }));
}

module.exports = {
  MIN_PRINTABLE_PT,
  LIMITE_PRINTABLE_PT,
  SAFE_EDGE_MM,
  SAFE_BINDING_MM,
  STATUTS,
  FIT_DISPLAY,
  TEXT_SLOT_HEIGHT_SHARE,
  TEXT_OVER_PHOTO_SLUGS,
  resolveUsableAreaMm,
  defaultRoleForSlot,
  statutForTextFit,
  checkTextFit,
  checkSafeArea,
  computePageTextFit,
  annotatePagesWithTextFit
};
