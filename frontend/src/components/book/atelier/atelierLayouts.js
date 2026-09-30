// frontend/src/components/book/atelier/atelierLayouts.js
//
// Metadonnees statiques des formats de page proposes dans l'atelier de
// creation personnalisee — a garder synchronise avec les slugs actifs de
// layout_definitions (voir backend/sql/phase04_layout_catalog_seed.sql /
// phase08_layout_engine_v2.sql / phase11_manual_layouts.sql). L'ordre du
// tableau `slots` de chaque layout doit correspondre exactement a
// capacity.slots cote backend : c'est cet ordre qui est envoye tel quel a
// PUT /pages/:pageIndex/manual (voir BookAtelierLuxe.js), et
// manualPageBuilder.js valide dans ce meme ordre.
//
// "category" correspond aux 5 boutons proposes quand une page est vide
// (cahier des charges §3) — chaque bouton filtre simplement cette meme
// liste, jamais un second mecanisme de choix.
//
// 'title' est un slot texte a l'affichage stylise different (voir
// pageRenderer.js: renderTitleTextBlock/renderTitlePhotosBlock) mais reste
// un slot 'text' cote validation — jamais un troisieme type cote backend.

export const ATELIER_CATEGORIES = [
  { id: 'photo-single', icon: '📷' },
  { id: 'photo-multi', icon: '📷📷' },
  { id: 'photo-text', icon: '📷✍️' },
  { id: 'text', icon: '✍️' },
  { id: 'title-photos', icon: '🅃📷' }
];

export const ATELIER_LAYOUTS = [
  { slug: 'FULL_PHOTO', category: 'photo-single', slots: ['photo'] },
  // Une seule photo etalee sur les DEUX pages. `spread: true` : choisir cette
  // mise en page l'applique a la paire entiere, jamais a une page seule (voir
  // BookAtelierLuxe : handleChooseLayout / l'alignement de la page jumelle).
  { slug: 'FULL_PHOTO_SPREAD', category: 'photo-single', slots: ['photo'], spread: true },
  // Les deux arrangements d'une paire de photos. Les libelles decrivent la
  // forme des CADRES (ce que l'utilisateur voit et choisit), pas le sens de
  // l'empilement : "2 photos verticales" = cote a cote, cadres etroits et
  // hauts ; "2 photos horizontales" = l'une sous l'autre, cadres larges et
  // bas. C'est le vocabulaire employe par l'utilisateur (2026-09-13), et
  // c'est le seul qui soit sans ambiguite au moment de choisir.
  { slug: 'TWO_PHOTOS', category: 'photo-multi', slots: ['photo', 'photo'] },
  { slug: 'TWO_PHOTOS_STACKED', category: 'photo-multi', slots: ['photo', 'photo'] },
  { slug: 'THREE_PHOTOS', category: 'photo-multi', slots: ['photo', 'photo', 'photo'] },
  { slug: 'FOUR_PHOTOS', category: 'photo-multi', slots: ['photo', 'photo', 'photo', 'photo'] },
  { slug: 'PHOTO_TEXT', category: 'photo-text', slots: ['photo', 'text'] },
  { slug: 'TEXT_PHOTO', category: 'photo-text', slots: ['text', 'photo'] },
  { slug: 'PHOTO_WITH_CAPTION', category: 'photo-text', slots: ['photo', 'text'] },
  { slug: 'TWO_PHOTOS_TEXT', category: 'photo-text', slots: ['photo', 'photo', 'text'] },
  { slug: 'ONE_TESTIMONY', category: 'text', slots: ['text'] },
  { slug: 'TWO_TESTIMONIES', category: 'text', slots: ['text', 'text'] },
  { slug: 'THREE_TESTIMONIES', category: 'text', slots: ['text', 'text', 'text'] },
  { slug: 'TITLE_TEXT', category: 'text', slots: ['title', 'text'] },
  { slug: 'TITLE_TWO_PHOTOS', category: 'title-photos', slots: ['title', 'photo', 'photo'] },
  { slug: 'TITLE_FOUR_PHOTOS', category: 'title-photos', slots: ['title', 'photo', 'photo', 'photo', 'photo'] }
];

export const layoutsByCategory = (categoryId) => ATELIER_LAYOUTS.filter((layout) => layout.category === categoryId);

export const findAtelierLayout = (slug) => ATELIER_LAYOUTS.find((layout) => layout.slug === slug) || null;

// Libelles traduits (chantier bilingue, 2026-09-30) : calcules A L'AFFICHAGE,
// jamais au chargement du module — sinon ils restent figes dans la langue
// active au premier import et ne suivent plus un changement de langue. Le
// meme slug/id sert de cle i18n, donc un seul point de synchronisation avec
// les JSON de locales/atelier.json.
export const getCategoryLabel = (id, t) => t(`layouts.categories.${id}`);
export const getLayoutLabel = (slug, t) => t(`layouts.slugs.${slug}`);

// Un slot 'title'/'text' accepte un item kind='texte' ; un slot 'photo'
// accepte un item kind='photo'. Utilise pour le retour visuel immediat
// (avant meme la validation serveur, qui reste la source de verite finale).
export const slotAcceptsItem = (slotType, item) => {
  if (!item) return true;
  if (slotType === 'photo') return item.kind === 'photo';
  return item.kind === 'texte';
};
