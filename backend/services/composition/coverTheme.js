// backend/services/composition/coverTheme.js
//
// Theme visuel de couverture (typographie + palette) par style de livre
// (book_templates.slug : elegance | editorial | minimal — les 3 memes
// templates deja choisis en step 1 du composeur, reutilises tels quels
// plutot que d'inventer un second systeme de style pour la couverture).
//
// Palette hex reprise de TEMPLATE_PALETTES (frontend/src/components/book/
// BookComposeLuxe.js) pour que la couverture reelle corresponde a l'apercu
// deja vu par l'utilisateur au choix du style.
//
// Les 3 polices sont les seules chargees dans tout le projet (verifie par
// grep exhaustif : frontend/public/index.html, frontend/src/styles/
// luxe-theme.css, et l'ancien pipeline PDF backend/routes/books.js
// chargent exactement les memes) : Cormorant Garamond, Playfair Display,
// Inter. Jamais d'autre police ajoutee ici (§7 du cahier des charges :
// une police principale, eventuellement une secondaire).
//
// Fonctions pures, aucun acces reseau/disque.

const COVER_THEMES = {
  elegance: {
    titleFont: "'Cormorant Garamond', Georgia, serif",
    titleFontStyle: 'italic',
    titleFontWeight: 500,
    secondaryFont: "'Inter', sans-serif",
    bg: '#f4f0e6',
    paper: '#fffdf8',
    ink: '#241f18',
    accent: '#c9a35f'
  },
  editorial: {
    titleFont: "'Playfair Display', Georgia, serif",
    titleFontStyle: 'normal',
    titleFontWeight: 500,
    secondaryFont: "'Inter', sans-serif",
    bg: '#eceae4',
    paper: '#ffffff',
    ink: '#2b2620',
    accent: '#8a7a63'
  },
  minimal: {
    titleFont: "'Inter', sans-serif",
    titleFontStyle: 'normal',
    titleFontWeight: 700,
    secondaryFont: "'Inter', sans-serif",
    bg: '#f2f2f2',
    paper: '#ffffff',
    ink: '#1a1a1a',
    accent: '#1a1a1a'
  }
};

const DEFAULT_THEME_SLUG = 'elegance';

/**
 * @param {object|null} template - book_templates row (ou null/inconnu)
 * @returns {object} theme — ne leve jamais, replie sur le theme par defaut
 */
function resolveCoverTheme(template) {
  const slug = template?.slug;
  return COVER_THEMES[slug] || COVER_THEMES[DEFAULT_THEME_SLUG];
}

// Habillage de couverture propre au FORMAT (livret/standard/luxe),
// applique PAR-DESSUS le theme de style (editorial/elegance/minimal,
// resolveCoverTheme ci-dessus) — deux axes independants, comme mood/
// template pour les pages interieures (voir layoutScoring.js).
//
// LUXE : matiere + teinte propres (pas seulement des dimensions) — `paper`/
// `bg` remplaces par un ivoire premium unique (un seul ton retenu parmi les
// 4 proposes — ivoire/beige/taupe/noir profond — pour rester dans le budget
// de cette passe ; un selecteur pourra venir plus tard), `texture:'linen'`
// (voir COVER_BASE_CSS : .has-linen-texture, un motif tisse suggere en CSS
// pur) et `titleEffect:'emboss'` (voir .cvr-title.is-embossed). Accent dore
// force quel que soit le style choisi (retour utilisateur : "il faut mettre
// du dore pour le luxe") — plus riche que le gold pale d'elegance, pour
// rester visible meme si ce style-la est deja choisi. `ornament` pilote le
// cadre dore fin en surimpression (COVER_BASE_CSS : .has-gold-frame).
//
// LIVRET : "pas de dorure" est une vraie contrainte, pas juste une absence
// d'ajout — meme si le style choisi (ex. "elegance") fournit lui-meme un
// accent dore pale, le format Livret l'ecrase par une teinte neutre. C'est
// ce qui garantit "design minimaliste, jamais de doré" quel que soit le
// style graphique choisi par ailleurs.
//
// STANDARD : aucun override. La "legere touche doree eventuelle" du cahier
// des charges se produit deja naturellement SI l'utilisateur a choisi le
// style "elegance" (accent deja doux/dore) — forcer un gold ici brouillerait
// la distinction avec le Luxe, donc pas d'ajout deliberement.
function applyFormatAccent(theme, formatId) {
  if (formatId === 'luxe') {
    return {
      ...theme,
      paper: '#ede6d6',
      bg: '#ede6d6',
      accent: '#c19a3d',
      accentDeep: '#8a6a1f',
      ornament: 'gold-frame',
      texture: 'linen',
      titleEffect: 'emboss'
    };
  }
  if (formatId === 'livret') {
    return { ...theme, accent: '#8f8a7c', ornament: 'none' };
  }
  return { ...theme, ornament: 'none' };
}

module.exports = {
  COVER_THEMES,
  DEFAULT_THEME_SLUG,
  resolveCoverTheme,
  applyFormatAccent
};
