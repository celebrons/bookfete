// frontend/src/components/book/atelier/textQuality.js
//
// MIROIR partiel de backend/services/composition/textQualityEngine.js —
// uniquement ce dont l'atelier a besoin pour afficher, en direct, la meme
// chose que le controle serveur (cahier des charges typographique §19).
// Meme convention de duplication assumee que photoQuality.js.

import { fitTextToSlot } from './typography';
import { getPageMetrics, FORMAT_DIMENSIONS_MM } from './atelierLayoutGeometry';

export const MIN_PRINTABLE_PT = 7;
export const LIMITE_PRINTABLE_PT = 8;

// Zone utile d'une page, marges deduites. Delegue a getPageMetrics
// (atelierLayoutGeometry.js), qui est deja la source de ces marges pour le
// positionnement de l'incrustation : en garder une deuxieme copie ici
// garantirait qu'elles finissent par diverger.
export function usableAreaMm(printFormat) {
  const { contentWidthMm, contentHeightMm } = getPageMetrics(printFormat);
  return { widthMm: contentWidthMm, heightMm: contentHeightMm };
}

// Convertit un rectangle d'emplacement de l'incrustation (en % de la zone
// utile, voir atelierLayoutGeometry.js) en millimetres reels. C'est ce qui
// permet a l'editeur en ligne de juger un debordement avec les VRAIES
// dimensions du papier, pas avec des pixels d'ecran.
export function slotBoxMm(rect, printFormat) {
  const { widthMm, heightMm } = usableAreaMm(printFormat);
  return {
    slotWidthMm: (Number(rect?.width) || 100) / 100 * widthMm,
    slotHeightMm: (Number(rect?.height) || 100) / 100 * heightMm
  };
}

// Hierarchie editoriale par defaut (§14) — meme table que le backend
// (textQualityEngine.defaultRoleForSlot).
export function defaultRoleForSlot(layoutSlug, slotIndex) {
  if (layoutSlug === 'PHOTO_WITH_CAPTION') return 'caption';
  if (layoutSlug === 'TITLE_TEXT') return slotIndex === 0 ? 'title' : 'body';
  if (layoutSlug === 'TITLE_TWO_PHOTOS' || layoutSlug === 'TITLE_FOUR_PHOTOS') return 'title';
  if (layoutSlug === 'ONE_TESTIMONY' || layoutSlug === 'texte-citation') return 'quote';
  return 'body';
}

// Verdict affichable pour un texte dans un emplacement — meme forme que
// checkSlotImageFit (photoQuality.js) pour que les badges de l'atelier
// puissent etre traites de la meme facon.
export function checkSlotTextFit({ item, layoutSlug, slotIndex, printFormat, rect, role, overrides }) {
  if (!item || item.kind !== 'texte') return null;

  const { slotWidthMm, slotHeightMm } = slotBoxMm(rect, printFormat);
  const safeRole = role || defaultRoleForSlot(layoutSlug, slotIndex);
  const fit = fitTextToSlot({
    text: item.text, role: safeRole, formatId: printFormat, slotWidthMm, slotHeightMm
  });

  const sizePt = fit.fontSizePt;
  let statut = 'ok';
  if (fit.status === 'overflow' || sizePt < MIN_PRINTABLE_PT) statut = 'insuffisant';
  else if (fit.status === 'reduced' || sizePt < LIMITE_PRINTABLE_PT) statut = 'limite';

  return {
    role: safeRole,
    statut,
    severity: statut === 'ok' ? 'ok' : (statut === 'limite' ? 'warning' : 'error'),
    label: statut === 'insuffisant'
      ? 'Texte trop long pour cet emplacement'
      : (statut === 'limite' ? 'Texte reduit pour tenir' : 'Texte bien place'),
    sizePt,
    lines: fit.lines,
    overflowMm: fit.overflowMm ?? 0
  };
}

export { FORMAT_DIMENSIONS_MM };
