// frontend/src/components/book/atelier/typography.js
//
// MIROIR de backend/services/composition/typographySystem.js — meme
// convention de duplication assumee que photoQuality.js / photoQualityEngine.js
// (voir leur en-tete). Toute modification d'un cote doit etre reportee de
// l'autre : c'est ce qui permet a l'atelier d'afficher EXACTEMENT ce que le
// PDF imprimera (cahier des charges typographique §1 "WYSIWYG" et §18
// "le preview et le PDF doivent utiliser exactement les memes regles").
//
// Ce module ne sait rien du DOM : il calcule, il ne mesure pas. C'est
// volontaire — une mesure navigateur donnerait un resultat que le serveur ne
// peut pas reproduire, et l'apercu divergerait du fichier imprime.

export const TEXT_ROLES = ['title', 'subtitle', 'body', 'caption', 'quote'];
export const DEFAULT_TEXT_ROLE = 'body';

// Libelles utilisateur. Le cahier des charges interdit un editeur de type
// Canva (§2) : l'utilisateur ne choisit donc jamais une police, il choisit
// un ROLE, et le role decide de tout le reste.
export const ROLE_LABELS = {
  title: 'Titre',
  subtitle: 'Sous-titre',
  // "Texte" seul etait ambigu dans une liste ou tout est du texte.
  body: 'Texte courant',
  caption: 'Legende',
  quote: 'Citation'
};

export const FONT_STACKS = {
  serif: "'Cormorant Garamond', Georgia, 'Times New Roman', serif",
  sans: "'Inter', 'Helvetica Neue', Arial, sans-serif"
};

export const ROLE_SCALE = {
  title: {
    minPt: 28, maxPt: 36, family: 'serif', weight: 500, usesMeasure: false,
    leading: 1.14, tracking: 0, maxLines: 3, align: 'center', color: 'ink'
  },
  subtitle: {
    minPt: 12, maxPt: 16, family: 'sans', weight: 500, usesMeasure: false,
    leading: 1.4, tracking: 0.08, maxLines: 3, align: 'center', color: 'graphite'
  },
  body: {
    minPt: 10, maxPt: 12, family: 'sans', weight: 400, usesMeasure: true,
    leading: 1.65, tracking: 0, maxLines: null, align: 'justify', color: 'ink'
  },
  caption: {
    minPt: 8, maxPt: 10, family: 'sans', weight: 400, usesMeasure: false,
    leading: 1.45, tracking: 0.02, maxLines: 3, align: 'center', color: 'softGrey'
  },
  quote: {
    minPt: 18, maxPt: 26, family: 'serif', weight: 400, usesMeasure: true,
    leading: 1.45, tracking: 0, maxLines: 6, align: 'center', color: 'ink'
  }
};

export const FORMAT_TYPOGRAPHY = {
  livret: { rangePosition: 0, leadingFactor: 0.94, measureRatio: 1, slotPaddingMm: 3 },
  standard: { rangePosition: 0.5, leadingFactor: 1, measureRatio: 0.92, slotPaddingMm: 5 },
  luxe: { rangePosition: 1, leadingFactor: 1.12, measureRatio: 0.78, slotPaddingMm: 8 }
};
const DEFAULT_FORMAT_TYPOGRAPHY_ID = 'standard';

export const TEXT_COLORS = {
  ink: { label: 'Noir', hex: '#241f18' },
  graphite: { label: 'Gris fonce', hex: '#4a4335' },
  softGrey: { label: 'Gris doux', hex: '#6d6252' },
  white: { label: 'Blanc', hex: '#ffffff', onDark: true },
  ivory: { label: 'Ivoire', hex: '#fffdf8', onDark: true },
  beige: { label: 'Beige', hex: '#efe8d8', onDark: true },
  taupe: { label: 'Taupe', hex: '#8f8a7c' },
  // Or de TEXTE (plus sombre que l'or decoratif #c9a35f, illisible en texte
  // sur papier ivoire) — voir typographySystem.js cote backend.
  accent: { label: 'Or subtil', hex: '#8a6a1f', accentOnly: true }
};
export const DEFAULT_TEXT_COLOR = 'ink';

// Luminance relative WCAG puis rapport de contraste — miroir exact du
// backend (typographySystem.js). Sert ici a ne proposer que des couleurs
// reellement lisibles sur le fond de la page.
export function relativeLuminance(hex) {
  const clean = String(hex || '').replace('#', '');
  if (clean.length !== 6) return 0;
  const channel = (offset) => {
    const value = parseInt(clean.slice(offset, offset + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}

export function contrastRatio(hexA, hexB) {
  const a = relativeLuminance(hexA);
  const b = relativeLuminance(hexB);
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return Math.round(((lighter + 0.05) / (darker + 0.05)) * 100) / 100;
}

// Couleur du papier (.page dans pageRenderer BASE_CSS).
export const PAGE_PAPER_HEX = '#fffdf8';
export const PALETTE_MIN_CONTRAST = 3;

// Couleurs proposables pour un role, SUR UN FOND DONNE. Miroir exact de
// typographySystem.selectableColorsForRole : une couleur sans contraste
// suffisant avec le fond est ecartee, sinon l'utilisateur pourrait choisir
// un texte blanc sur papier ivoire — invisible a l'impression (probleme
// signale 2026-09-11 : "les couleurs proches du blanc n'apparaissent pas").
// Elles redeviennent proposees sur un fond sombre (texte sur photo).
export function selectableColorsForRole(role, { backgroundHex = PAGE_PAPER_HEX } = {}) {
  const allowAccent = role === 'caption';
  return Object.entries(TEXT_COLORS)
    .filter(([, value]) => (allowAccent ? true : !value.accentOnly))
    .filter(([, value]) => contrastRatio(value.hex, backgroundHex) >= PALETTE_MIN_CONTRAST)
    .map(([token, value]) => ({ token, label: value.label, hex: value.hex }));
}

export function resolveTextColor(token) {
  return (TEXT_COLORS[token] || TEXT_COLORS[DEFAULT_TEXT_COLOR]).hex;
}

export function normalizeRole(role) {
  const value = String(role || '').trim().toLowerCase();
  return TEXT_ROLES.includes(value) ? value : DEFAULT_TEXT_ROLE;
}

function resolveFormatTypography(formatId) {
  return FORMAT_TYPOGRAPHY[formatId] || FORMAT_TYPOGRAPHY[DEFAULT_FORMAT_TYPOGRAPHY_ID];
}

const round2 = (value) => Math.round(value * 100) / 100;

export function baseSizePt(role, formatId) {
  const scale = ROLE_SCALE[normalizeRole(role)];
  const fmt = resolveFormatTypography(formatId);
  return round2(scale.minPt + (scale.maxPt - scale.minPt) * fmt.rangePosition);
}

export function resolveRoleStyle(role, formatId, overrides = {}) {
  const safeRole = normalizeRole(role);
  const scale = ROLE_SCALE[safeRole];
  const fmt = resolveFormatTypography(formatId);

  const requested = Number(overrides.sizePt);
  const fontSizePt = Number.isFinite(requested)
    ? round2(Math.min(scale.maxPt, Math.max(scale.minPt, requested)))
    : baseSizePt(safeRole, formatId);

  const colorToken = TEXT_COLORS[overrides.color] ? overrides.color : scale.color;
  const align = ['left', 'center', 'right', 'justify'].includes(overrides.align)
    ? overrides.align
    : scale.align;

  return {
    role: safeRole,
    fontSizePt,
    minPt: scale.minPt,
    maxPt: scale.maxPt,
    lineHeight: round2(scale.leading * fmt.leadingFactor),
    letterSpacingEm: scale.tracking,
    fontFamily: FONT_STACKS[scale.family],
    familyKey: scale.family,
    fontWeight: scale.weight,
    fontStyle: safeRole === 'quote' ? 'italic' : 'normal',
    maxLines: scale.maxLines,
    align,
    colorToken,
    color: resolveTextColor(colorToken),
    measureRatio: scale.usesMeasure ? fmt.measureRatio : 1,
    usesMeasure: scale.usesMeasure,
    slotPaddingMm: fmt.slotPaddingMm
  };
}

const AVG_GLYPH_WIDTH_EM = { serif: 0.47, sans: 0.505 };
const PT_PER_MM = 72 / 25.4;

export function charsPerLine(widthMm, sizePt, familyKey) {
  const widthPt = widthMm * PT_PER_MM;
  const glyphPt = sizePt * (AVG_GLYPH_WIDTH_EM[familyKey] || AVG_GLYPH_WIDTH_EM.sans);
  if (glyphPt <= 0) return 0;
  return Math.max(1, Math.floor(widthPt / glyphPt));
}

export function estimateLineCount(text, widthMm, sizePt, familyKey) {
  const perLine = charsPerLine(widthMm, sizePt, familyKey);
  if (perLine <= 0) return 0;
  return String(text || '')
    .split(/\n/)
    .reduce((total, paragraph) => total + Math.max(1, Math.ceil(paragraph.trim().length / perLine)), 0);
}

export function estimateHeightMm(lineCount, sizePt, lineHeight) {
  return (lineCount * sizePt * lineHeight) / PT_PER_MM;
}

// Voir typographySystem.fitTextToSlot cote backend : meme algorithme, mots
// pour mots (y compris l'agrandissement et la regle des textes courts ajoutes
// le 2026-09-12). Retourne toujours un resultat affichable — 'overflow' est
// une ALERTE, jamais une troncature (§9).
export const JUSTIFY_MIN_LINES = 3;
export const GROW_BELOW_FILL = 0.85;
export const GROW_MAX_SHARE = 0.5;

export function fitTextToSlot({ text, role, formatId, slotWidthMm, slotHeightMm, overrides = {} }) {
  const style = resolveRoleStyle(role, formatId);
  const safeText = String(text || '');
  const alignChosen = ['left', 'center', 'right', 'justify'].includes(overrides.align);
  const alignFor = (lines) => {
    if (alignChosen) return overrides.align;
    if (style.align === 'justify' && lines > 0 && lines < JUSTIFY_MIN_LINES) return 'center';
    return style.align;
  };

  const usableWidthMm = Math.max(1, (Number(slotWidthMm) || 0) * style.measureRatio - style.slotPaddingMm * 2);
  const usableHeightMm = Math.max(1, (Number(slotHeightMm) || 0) - style.slotPaddingMm * 2);

  const fits = (sizePt) => {
    const lines = estimateLineCount(safeText, usableWidthMm, sizePt, style.familyKey);
    const heightMm = estimateHeightMm(lines, sizePt, style.lineHeight);
    const withinLines = style.maxLines == null || lines <= style.maxLines;
    return { lines, heightMm, ok: withinLines && heightMm <= usableHeightMm };
  };

  if (!safeText.trim()) {
    return {
      ...style, status: 'ok', lines: 0, estimatedHeightMm: 0, fillRatio: 0,
      usableWidthMm: round2(usableWidthMm), usableHeightMm: round2(usableHeightMm)
    };
  }

  const naturalPt = style.fontSizePt;
  let chosen = null;
  for (let sizePt = naturalPt; sizePt >= style.minPt - 0.001; sizePt -= 0.5) {
    const attempt = fits(round2(sizePt));
    if (attempt.ok) {
      chosen = { sizePt: round2(sizePt), ...attempt };
      break;
    }
  }

  // Agrandissement : voir le backend pour le raisonnement (occuper la place
  // sans effacer le caractere du format).
  if (chosen && Math.abs(chosen.sizePt - naturalPt) < 0.001) {
    const fill = usableHeightMm > 0 ? chosen.heightMm / usableHeightMm : 1;
    const growCeiling = naturalPt + (style.maxPt - naturalPt) * GROW_MAX_SHARE;
    if (fill < GROW_BELOW_FILL) {
      for (let sizePt = naturalPt + 0.5; sizePt <= growCeiling + 0.001; sizePt += 0.5) {
        const attempt = fits(round2(sizePt));
        if (!attempt.ok) break;
        chosen = { sizePt: round2(sizePt), ...attempt };
      }
    }
  }

  if (!chosen) {
    const atMin = fits(style.minPt);
    return {
      ...style,
      fontSizePt: style.minPt,
      align: alignFor(atMin.lines),
      status: 'overflow',
      lines: atMin.lines,
      estimatedHeightMm: round2(atMin.heightMm),
      fillRatio: usableHeightMm > 0 ? round2(atMin.heightMm / usableHeightMm) : 1,
      overflowMm: round2(atMin.heightMm - usableHeightMm),
      usableWidthMm: round2(usableWidthMm),
      usableHeightMm: round2(usableHeightMm)
    };
  }

  let status = 'ok';
  if (chosen.sizePt < naturalPt - 0.001) status = 'reduced';
  else if (chosen.sizePt > naturalPt + 0.001) status = 'grown';

  return {
    ...style,
    fontSizePt: chosen.sizePt,
    align: alignFor(chosen.lines),
    status,
    lines: chosen.lines,
    estimatedHeightMm: round2(chosen.heightMm),
    fillRatio: usableHeightMm > 0 ? round2(chosen.heightMm / usableHeightMm) : 1,
    usableWidthMm: round2(usableWidthMm),
    usableHeightMm: round2(usableHeightMm)
  };
}

// Dimensions reelles des pages, en mm (meme table que AtelierBookView.js /
// AtelierLayoutPanel.js / AtelierPageFilmstrip.js — convention de duplication
// deja etablie dans ce projet pour ces petites tables format -> dimensions).
export const FORMAT_DIMENSIONS_MM = {
  livret: { widthMm: 200, heightMm: 200 },
  standard: { widthMm: 210, heightMm: 280 },
  luxe: { widthMm: 210, heightMm: 280 }
};

// Conversion points -> pixels ECRAN, a l'echelle reelle de la page affichee.
// C'est la piece qui rend l'edition WYSIWYG : un titre 32pt occupe a l'ecran
// exactement la meme fraction de page qu'il occupera sur le papier.
//
// `referenceWidthPx` et `referenceWidthMm` doivent decrire LA MEME largeur.
// L'appelant (AtelierPageOverlay) mesure l'incrustation, qui couvre la ZONE
// DE CONTENU (page moins ses marges) — il passe donc la largeur de contenu en
// mm, pas la largeur de page.
//
// CORRIGE 2026-09-11 : on divisait par la largeur de PAGE tout en multipliant
// par la largeur mesuree du CONTENU, ce qui affichait le texte ~13% plus
// petit qu'a l'impression (probleme signale : "il apparait tout petit").
export function ptToScreenPx(sizePt, { referenceWidthPx, referenceWidthMm }) {
  if (!referenceWidthPx || !referenceWidthMm) return sizePt; // repli inoffensif
  const sizeMm = sizePt / PT_PER_MM;
  return (sizeMm / referenceWidthMm) * referenceWidthPx;
}

// Style CSS pret a poser sur un champ d'edition, a l'echelle de l'ecran.
export function screenStyleForRole(role, printFormat, reference, overrides = {}) {
  const style = resolveRoleStyle(role, printFormat, overrides);
  return {
    fontFamily: style.fontFamily,
    fontSize: `${ptToScreenPx(style.fontSizePt, reference)}px`,
    lineHeight: style.lineHeight,
    letterSpacing: `${style.letterSpacingEm}em`,
    fontWeight: style.fontWeight,
    fontStyle: style.fontStyle,
    textAlign: style.align,
    color: style.color
  };
}
