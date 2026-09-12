// backend/services/composition/typographySystem.js
//
// SOURCE UNIQUE de la typographie Celebrons (cahier des charges "Systeme
// typographique", 2026-09-11). Fonctions pures : aucun acces reseau/disque,
// aucune dependance au DOM — c'est ce qui permet au PDF (Chrome headless
// cote serveur) et a l'atelier (navigateur) d'appliquer EXACTEMENT les
// memes regles (§18 : "Le preview et le PDF doivent utiliser exactement les
// memes regles de positionnement, taille et wrapping").
//
// Miroir frontend : frontend/src/components/book/atelier/typography.js —
// meme convention de duplication assumee que photoQualityEngine.js /
// photoQuality.js. Toute modification ici doit y etre reportee.
//
// PRINCIPE DIRECTEUR (§ regle finale) : "L'utilisateur personnalise le
// contenu. Celebrons reste responsable du design." Ce module ne decrit donc
// jamais un reglage libre, mais un CADRE : un role choisi par l'utilisateur
// determine police, taille, graisse, interligne et couleur. Il n'y a
// volontairement aucune fonction ici permettant de choisir une police
// arbitraire ou une couleur hors palette.

// --- 1. Les 5 roles (§3) ---------------------------------------------------
// Chaque TextBlock connait son role, et le role determine tout le reste.
const TEXT_ROLES = ['title', 'subtitle', 'body', 'caption', 'quote'];
const DEFAULT_TEXT_ROLE = 'body';

// --- 2. Deux familles maximum par livre (§4) -------------------------------
// Titres : serif editoriale. Textes : sans-serif tres lisible. Aucune police
// decorative/manuscrite, et aucun moyen pour l'utilisateur d'en ajouter une :
// la hierarchie se fait par taille/graisse/espacement/blanc (§4), pas par
// multiplication des familles.
const FONT_STACKS = {
  serif: "'Cormorant Garamond', Georgia, 'Times New Roman', serif",
  sans: "'Inter', 'Helvetica Neue', Arial, sans-serif"
};

// --- 3. Echelles typographiques (§10) --------------------------------------
// Des PLAGES, jamais des tailles arbitraires. `minPt`/`maxPt` sont les bornes
// du role ; la taille reellement appliquee depend du format ET de la place
// disponible (voir fitTextToSlot). `maxLines: null` = pas de limite (corps de
// texte), sinon le depassement devient une alerte, jamais une troncature.
// `usesMeasure` : la largeur de colonne reduite (measureRatio) ne s'applique
// qu'au texte COURANT. Une mesure de lecture etroite sert a ne pas fatiguer
// l'oeil sur des lignes longues — un titre court et centre n'a rien a y
// gagner, et l'etrangler le forcerait a passer sur 4 lignes en Luxe alors
// qu'il tient sur 3. Le titre occupe donc toute la largeur disponible.
const ROLE_SCALE = {
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

// --- 4. Le format change la COMPOSITION, pas seulement l'echelle (§15) -----
// Avant ce module, les 3 formats partageaient une seule variable CSS
// (--fmt-type-scale : 0.8 / 1 / 1.25) appliquee mecaniquement a toutes les
// tailles — exactement le "scaling" que le cahier des charges refuse.
//
// Ici chaque format choisit sa POSITION dans la plage de chaque role
// (`rangePosition` : 0 = bas de plage, 1 = haut), plus son propre interligne
// et sa propre largeur de colonne. Consequence concrete : en Livret un titre
// descend vers 28pt avec un interligne serre et une colonne large (compact),
// en Luxe il monte vers 36pt avec un interligne genereux et une colonne plus
// etroite (plus de blanc autour, §12). Ce n'est pas la meme page agrandie.
const FORMAT_TYPOGRAPHY = {
  livret: {
    rangePosition: 0,
    leadingFactor: 0.94,
    // Largeur de colonne de texte, en % de la largeur utile de la page. Plus
    // large en livret : la page est petite, etrangler la colonne donnerait
    // des lignes de 4 mots.
    measureRatio: 1,
    // Marge interieure autour d'un texte, en mm (avant mise a l'echelle).
    slotPaddingMm: 3
  },
  standard: {
    rangePosition: 0.5,
    leadingFactor: 1,
    measureRatio: 0.92,
    slotPaddingMm: 5
  },
  luxe: {
    rangePosition: 1,
    leadingFactor: 1.12,
    // Colonne volontairement plus etroite : c'est ce qui cree la respiration
    // editoriale attendue du Luxe (§15), et ca rapproche le corps de texte
    // de la mesure de lecture ideale (~65 signes).
    measureRatio: 0.78,
    slotPaddingMm: 8
  }
};
const DEFAULT_FORMAT_TYPOGRAPHY_ID = 'standard';

// --- 5. Palette controlee (§5) ---------------------------------------------
// Pas de color picker : une liste fermee. `onDark` marque les teintes
// utilisables sur fond sombre (voir checkTextContrast).
const TEXT_COLORS = {
  ink: { label: 'Noir', hex: '#241f18' },
  graphite: { label: 'Gris fonce', hex: '#4a4335' },
  softGrey: { label: 'Gris doux', hex: '#6d6252' },
  white: { label: 'Blanc', hex: '#ffffff', onDark: true },
  ivory: { label: 'Ivoire', hex: '#fffdf8', onDark: true },
  beige: { label: 'Beige', hex: '#efe8d8', onDark: true },
  taupe: { label: 'Taupe', hex: '#8f8a7c' },
  // Accent PONCTUEL uniquement (§5 : "Ne jamais transformer une page en page
  // doree"). Reserve aux details editoriaux du §17 : numero de chapitre,
  // filet, date, lieu. Volontairement absent des couleurs proposees pour un
  // corps de texte — voir selectableColorsForRole.
  //
  // Teinte PLUS SOMBRE que l'or decoratif du theme (#c9a35f) : en aplat ce
  // dernier est superbe, mais en TEXTE sur le papier ivoire il tombe a
  // 2.3:1, soit illisible. #8a6a1f (4.96:1) est exactement l'or deja utilise
  // par le renderer pour le numero de page — meme famille, reellement lisible.
  accent: { label: 'Or subtil', hex: '#8a6a1f', accentOnly: true }
};
const DEFAULT_TEXT_COLOR = 'ink';

// Couleur du papier (.page dans pageRenderer BASE_CSS). Sert de fond de
// reference pour savoir quelles couleurs de texte sont reellement lisibles.
const PAGE_PAPER_HEX = '#fffdf8';

// Contraste minimal exige d'une couleur pour etre PROPOSEE dans la palette.
// Volontairement plus permissif que les seuils WCAG appliques par le controle
// qualite (checkTextContrast) : ceux-ci jugent un texte pose sur une PHOTO,
// situation ou l'on veut etre severe ; ici on filtre seulement ce qui serait
// franchement illisible sur le papier, sans interdire les gris doux qui font
// partie de l'identite editoriale.
const PALETTE_MIN_CONTRAST = 3;

// Couleurs proposables pour un role donne, SUR UN FOND DONNE.
//
// Deux filtres, tous deux issus du cahier des charges §5 :
//   - l'accent dore n'apparait que pour les roles "detail" (caption), jamais
//     pour un corps de texte ou un titre ("ne jamais transformer une page en
//     page doree") ;
//   - une couleur qui n'a pas assez de contraste avec le fond est ECARTEE.
//     Sur le papier ivoire du livre, cela retire blanc/ivoire/beige : les
//     proposer reviendrait a laisser l'utilisateur ecrire un texte INVISIBLE
//     a l'impression. Elles redeviennent disponibles des que le fond est
//     sombre (texte sur photo), ou elles sont precisement le bon choix.
function selectableColorsForRole(role, { backgroundHex = PAGE_PAPER_HEX } = {}) {
  const allowAccent = role === 'caption';
  return Object.entries(TEXT_COLORS)
    .filter(([, value]) => (allowAccent ? true : !value.accentOnly))
    .filter(([, value]) => contrastRatio(value.hex, backgroundHex) >= PALETTE_MIN_CONTRAST)
    .map(([token, value]) => ({ token, label: value.label, hex: value.hex }));
}

function resolveTextColor(token) {
  const entry = TEXT_COLORS[token] || TEXT_COLORS[DEFAULT_TEXT_COLOR];
  return entry.hex;
}

// --- 6. Resolution d'un role vers un style concret -------------------------
function normalizeRole(role) {
  const value = String(role || '').trim().toLowerCase();
  return TEXT_ROLES.includes(value) ? value : DEFAULT_TEXT_ROLE;
}

function resolveFormatTypography(formatId) {
  return FORMAT_TYPOGRAPHY[formatId] || FORMAT_TYPOGRAPHY[DEFAULT_FORMAT_TYPOGRAPHY_ID];
}

const round2 = (value) => Math.round(value * 100) / 100;

// Taille "naturelle" d'un role dans un format donne, avant toute adaptation
// a la place disponible.
function baseSizePt(role, formatId) {
  const scale = ROLE_SCALE[normalizeRole(role)];
  const fmt = resolveFormatTypography(formatId);
  return round2(scale.minPt + (scale.maxPt - scale.minPt) * fmt.rangePosition);
}

// Style complet d'un role pour un format. C'est ce que consomment le
// renderer (CSS) et l'atelier (apercu a l'ecran).
function resolveRoleStyle(role, formatId, overrides = {}) {
  const safeRole = normalizeRole(role);
  const scale = ROLE_SCALE[safeRole];
  const fmt = resolveFormatTypography(formatId);

  // L'utilisateur ne choisit PAS une taille libre : il peut au mieux
  // deplacer le curseur dans la plage du role (§2/§6 — options avancees
  // secondaires). Toute valeur hors plage est ramenee dans les bornes plutot
  // que refusee : le contenu reste affiche, le design reste tenu.
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
    // 1 pour les roles qui n'utilisent pas la mesure reduite : ils occupent
    // toute la largeur de leur emplacement.
    measureRatio: scale.usesMeasure ? fmt.measureRatio : 1,
    usesMeasure: scale.usesMeasure,
    slotPaddingMm: fmt.slotPaddingMm
  };
}

// --- 7. Adaptation automatique du texte (§9) -------------------------------
// Largeur moyenne d'un glyphe, en fraction de la taille de police. Mesure
// approchee mais DETERMINISTE — c'est la propriete qui compte : serveur et
// navigateur doivent arriver au meme resultat sans mesurer quoi que ce soit,
// sinon l'apercu et le PDF divergeraient (§18/§19 "coherence Preview/PDF").
// Valeurs relevees sur les deux familles reellement utilisees, texte francais
// courant. Volontairement legerement PESSIMISTES (on surestime la largeur) :
// se tromper en annoncant un debordement qui n'arrive pas est sans gravite,
// l'inverse produirait un livre imprime avec du texte coupe.
const AVG_GLYPH_WIDTH_EM = { serif: 0.47, sans: 0.505 };

const PT_PER_MM = 72 / 25.4;

// Nombre de signes tenant sur une ligne de `widthMm` a `sizePt`.
function charsPerLine(widthMm, sizePt, familyKey) {
  const widthPt = widthMm * PT_PER_MM;
  const glyphPt = sizePt * (AVG_GLYPH_WIDTH_EM[familyKey] || AVG_GLYPH_WIDTH_EM.sans);
  if (glyphPt <= 0) return 0;
  return Math.max(1, Math.floor(widthPt / glyphPt));
}

// Nombre de lignes occupees. Les retours a la ligne explicites comptent, et
// chaque paragraphe est habille separement : deux paragraphes courts ne
// tiennent pas sur une ligne, meme si leur total est court.
function estimateLineCount(text, widthMm, sizePt, familyKey) {
  const perLine = charsPerLine(widthMm, sizePt, familyKey);
  if (perLine <= 0) return 0;
  return String(text || '')
    .split(/\n/)
    .reduce((total, paragraph) => total + Math.max(1, Math.ceil(paragraph.trim().length / perLine)), 0);
}

function estimateHeightMm(lineCount, sizePt, lineHeight) {
  return (lineCount * sizePt * lineHeight) / PT_PER_MM;
}

// Cherche la plus grande taille du role qui fait tenir `text` dans
// `slotWidthMm` x `slotHeightMm`, par pas de 0.5pt, de la taille naturelle du
// format jusqu'a la borne basse du role.
//
// Retourne toujours un resultat AFFICHABLE (jamais de troncature, §9) :
//   status 'ok'      -> tient a la taille naturelle du format
//   status 'reduced' -> tient, mais a une taille reduite dans la plage
//   status 'overflow'-> ne tient meme pas a la taille minimale du role :
//                       l'appelant doit alerter l'utilisateur (§9 "afficher
//                       une alerte legere"), surtout pas couper en silence.
function fitTextToSlot({ text, role, formatId, slotWidthMm, slotHeightMm }) {
  const style = resolveRoleStyle(role, formatId);
  const safeText = String(text || '');

  // Marge interieure du format retiree des deux cotes : un texte qui touche
  // le bord de son emplacement n'est jamais elegant, et se rapproche
  // dangereusement de la zone de coupe (§19).
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
      ...style, status: 'ok', lines: 0, estimatedHeightMm: 0,
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

  if (!chosen) {
    // Ne tient pas, meme au minimum du role. On rend quand meme, a la taille
    // minimale : le texte reste LISIBLE et ENTIER, et c'est l'alerte (et le
    // controle qualite avant commande) qui porte le probleme.
    const atMin = fits(style.minPt);
    return {
      ...style,
      fontSizePt: style.minPt,
      status: 'overflow',
      lines: atMin.lines,
      estimatedHeightMm: round2(atMin.heightMm),
      overflowMm: round2(atMin.heightMm - usableHeightMm),
      usableWidthMm: round2(usableWidthMm),
      usableHeightMm: round2(usableHeightMm)
    };
  }

  return {
    ...style,
    fontSizePt: chosen.sizePt,
    status: chosen.sizePt < naturalPt - 0.001 ? 'reduced' : 'ok',
    lines: chosen.lines,
    estimatedHeightMm: round2(chosen.heightMm),
    usableWidthMm: round2(usableWidthMm),
    usableHeightMm: round2(usableHeightMm)
  };
}

// --- 8. Contraste texte sur photo (§16) ------------------------------------
// Luminance relative WCAG, puis rapport de contraste. Sert a decider si un
// texte pose sur une photo a besoin d'un voile (scrim) — jamais a rendre le
// texte illisible en esperant que ca passe.
function relativeLuminance(hex) {
  const clean = String(hex || '').replace('#', '');
  if (clean.length !== 6) return 0;
  const channel = (offset) => {
    const value = parseInt(clean.slice(offset, offset + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}

function contrastRatio(hexA, hexB) {
  const a = relativeLuminance(hexA);
  const b = relativeLuminance(hexB);
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return round2((lighter + 0.05) / (darker + 0.05));
}

// Seuil WCAG AA pour du "grand texte" (>= 18pt) : 3:1 ; sinon 4.5:1. Un livre
// imprime n'est pas une page web, mais ces seuils restent la reference la
// plus solide disponible, et pecher par exces de lisibilite ne coute rien.
const CONTRAST_LARGE_PT = 18;
function checkTextContrast({ colorHex, backgroundHex, sizePt }) {
  const ratio = contrastRatio(colorHex, backgroundHex);
  const required = (Number(sizePt) || 0) >= CONTRAST_LARGE_PT ? 3 : 4.5;
  return {
    ratio,
    required,
    ok: ratio >= required,
    // Un voile tres subtil suffit generalement a franchir le seuil sans
    // denaturer la photo (§16 : "une zone neutre ou un scrim tres subtil").
    needsScrim: ratio < required
  };
}

// --- 9. Generation du CSS (§18) --------------------------------------------
// Le renderer n'ecrit AUCUNE taille de texte en dur : il consomme ces
// variables. C'est la seule facon de garantir que l'apercu ecran, le PDF et
// le fichier d'impression Gelato appliquent la meme typographie, puisque
// tous trois rendent le meme HTML issu de pageRenderer.
function typographyCssVariables(formatId) {
  const lines = [`    --type-measure: ${resolveFormatTypography(formatId).measureRatio};`,
    `    --type-pad-mm: ${resolveFormatTypography(formatId).slotPaddingMm}mm;`];

  TEXT_ROLES.forEach((role) => {
    const style = resolveRoleStyle(role, formatId);
    lines.push(
      `    --type-${role}-size: ${style.fontSizePt}pt;`,
      `    --type-${role}-lh: ${style.lineHeight};`,
      `    --type-${role}-ls: ${style.letterSpacingEm}em;`,
      `    --type-${role}-family: ${style.fontFamily};`,
      `    --type-${role}-weight: ${style.fontWeight};`,
      `    --type-${role}-style: ${style.fontStyle};`,
      `    --type-${role}-align: ${style.align};`,
      `    --type-${role}-color: ${style.color};`
    );
  });

  return lines.join('\n');
}

// Selecteurs HISTORIQUES rattaches a chaque role. Le renderer produit ce
// markup depuis longtemps ; plutot que de le reecrire en masse (et de risquer
// une regression sur des livres deja composes), on rattache ces selecteurs au
// role auquel ils correspondent deja de fait. La typographie reste donc
// definie a UN seul endroit, et le markup neuf (edition en ligne) peut
// utiliser directement `.text-role-<role>`.
const ROLE_LEGACY_SELECTORS = {
  title: ['.page-title'],
  subtitle: [],
  body: [
    '.block-texte p',
    '.texte-pleine p',
    '.testimony-card p',
    '.mixte-ordered .mixte-texte p',
    '.title-text-body p'
  ],
  caption: ['.photo-with-caption figcaption', '.contribution-name', '.split-marker'],
  quote: ['.texte-citation p', '.contribution-message']
};

// Une classe par role. Les blocs du renderer portent `.text-role-<role>` et
// heritent de tout : plus aucune taille dispersee dans la feuille de style.
function typographyCssRules() {
  return TEXT_ROLES.map((role) => `  ${[`.text-role-${role}`, ...(ROLE_LEGACY_SELECTORS[role] || [])].join(', ')} {
    font-family: var(--type-${role}-family);
    font-size: var(--type-${role}-size);
    line-height: var(--type-${role}-lh);
    letter-spacing: var(--type-${role}-ls);
    font-weight: var(--type-${role}-weight);
    font-style: var(--type-${role}-style);
    text-align: var(--type-${role}-align);
    color: var(--type-${role}-color);
    /* Les retours a la ligne saisis par l'utilisateur sont CONSERVES.
       Sans cette regle, le HTML reduit tout \\n a une espace : les retours
       etaient bien enregistres, mais invisibles a l'ecran comme a
       l'impression (bug signale 2026-09-11). 'pre-line' respecte les
       retours volontaires tout en continuant de fusionner les espaces
       multiples et de faire l'habillage normal — contrairement a 'pre',
       qui empecherait le retour a la ligne automatique.
       Coherent avec estimateLineCount, qui compte deja chaque paragraphe
       separement. */
    white-space: pre-line;
  }`).join('\n') + `
  /* Nuances VOLONTAIRES qui survivent au role. Elles doivent etre declarees
     ICI, apres les regles de role : celles-ci posent font-style/text-align
     pour tout le role, et ecraseraient sinon ces intentions precises. */
  .photo-with-caption figcaption { font-style: italic; }
  .photo-with-caption.is-framed figcaption { text-align: left; }
  .contribution-continuation { text-transform: none; letter-spacing: 0; font-style: italic; }`;
}

module.exports = {
  TEXT_ROLES,
  DEFAULT_TEXT_ROLE,
  FONT_STACKS,
  ROLE_SCALE,
  FORMAT_TYPOGRAPHY,
  DEFAULT_FORMAT_TYPOGRAPHY_ID,
  TEXT_COLORS,
  DEFAULT_TEXT_COLOR,
  PAGE_PAPER_HEX,
  PALETTE_MIN_CONTRAST,
  CONTRAST_LARGE_PT,
  AVG_GLYPH_WIDTH_EM,
  normalizeRole,
  resolveFormatTypography,
  selectableColorsForRole,
  resolveTextColor,
  baseSizePt,
  resolveRoleStyle,
  charsPerLine,
  estimateLineCount,
  estimateHeightMm,
  fitTextToSlot,
  relativeLuminance,
  contrastRatio,
  checkTextContrast,
  typographyCssVariables,
  typographyCssRules
};
