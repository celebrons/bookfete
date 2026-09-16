// Photo en DOUBLE PAGE : quelle moitie de l'image sort sur quelle page ?
//
// Signale trois fois (2026-09-15, puis 2026-09-16 : « les photos sur double
// page sont tjrs inversees »). Les deux corrections precedentes ont ete
// validees par un controle qui rendait les pages DIRECTEMENT, avec la
// numerotation de l'atelier. Le PDF, lui, passe d'abord par
// composeCoversIntoPages, qui renumerote tout pour placer la couverture en
// tete : la page interieure 0 y devient l'index 1. Comme la moitie affichee
// se deduit de la PARITE de l'index, elle basculait — dans le PDF, et
// seulement dans le PDF. Le controle regardait donc a cote.
//
// Ces tests couvrent les DEUX contextes, c'est tout l'interet :
// l'atelier (pages non renumerotees) et l'export PDF (couvertures incluses).

const pageRenderer = require('../../services/composition/pageRenderer');
const coverComposer = require('../../services/composition/coverComposer');
const { resolveCoverFormat } = require('../../services/composition/coverFormat');

const SPREAD = { id: 'lay-spread', slug: 'FULL_PHOTO_SPREAD', kind: 'photo' };
const PHOTO = { id: 'p1', kind: 'photo', url: 'https://cdn.test/panorama.jpg' };

const pageDouble = (index) => ({
  page_index: index,
  layout_id: SPREAD.id,
  content: {
    kind: 'photo',
    blocks: [{ kind: 'photo', layoutId: SPREAD.id, itemIds: [PHOTO.id] }],
    itemIds: [PHOTO.id]
  }
});

const rendre = (page) => pageRenderer.renderSinglePageHtml({
  book: { id: 'b1', title: 'Livre' },
  page,
  items: [PHOTO],
  layouts: [SPREAD],
  format: { formatId: 'standard', ...resolveCoverFormat('standard') }
});

// La classe posee sur la FIGURE dit quelle moitie est cadree.
//
// On lit l'attribut de la figure, jamais le document entier : la feuille de
// style embarquee contient les deux noms de classe (`.is-spread-left` ET
// `.is-spread-right`), donc un simple `html.includes(...)` repond « gauche »
// quoi qu'il arrive — un test qui passe sans rien prouver.
const moitieDe = (html) => {
  const figure = html.match(/<figure class="([^"]*photo-spread[^"]*)"/);
  if (!figure) return 'aucune';
  if (figure[1].includes('is-spread-left')) return 'gauche';
  if (figure[1].includes('is-spread-right')) return 'droite';
  return 'aucune';
};

describe('Double page — dans l atelier (pages non renumerotees)', () => {
  it('la page d index PAIR montre la moitie GAUCHE', () => {
    expect(moitieDe(rendre(pageDouble(4)))).toBe('gauche');
  });

  it('la page d index IMPAIR montre la moitie DROITE', () => {
    expect(moitieDe(rendre(pageDouble(5)))).toBe('droite');
  });
});

describe('Double page — dans l export PDF (couvertures incluses)', () => {
  // La chaine reelle : c'est elle qui renumerote, et c'est la que le defaut
  // vivait. Un test qui saute cette etape ne prouve rien.
  const composer = (interiorPages) => coverComposer.composeCoversIntoPages({
    book: { id: 'b1', title: 'Livre', print_format: 'standard' },
    items: [PHOTO],
    template: null,
    interiorPages,
    format: resolveCoverFormat('standard')
  });

  it('la double page garde ses moities dans le bon sens malgre la renumerotation', () => {
    const interiorPages = [0, 1, 2, 3, 4, 5].map(pageDouble);
    const pages = composer(interiorPages);

    // La couverture est en tete : la page interieure i est a la position i+1.
    const interieure4 = pages[5];
    const interieure5 = pages[6];

    // La renumerotation a bien eu lieu — sans quoi le test ne prouverait rien.
    expect(interieure4.page_index).toBe(5);
    expect(interieure5.page_index).toBe(6);

    // ... et pourtant les moities suivent la page INTERIEURE, pas l'index
    // renumerote : paire a gauche, impaire a droite.
    expect(moitieDe(rendre(interieure4))).toBe('gauche');
    expect(moitieDe(rendre(interieure5))).toBe('droite');
  });

  it('conserve l index interieur d origine dans spreadIndex', () => {
    const pages = composer([0, 1].map(pageDouble));
    expect(pages[1].spreadIndex).toBe(0);
    expect(pages[2].spreadIndex).toBe(1);
  });

  it('une page sans spreadIndex retombe sur page_index (atelier, fichier imprimeur)', () => {
    // gelatoPrintFile.js renumerote ses pages interieures lui-meme et ne
    // passe jamais par composeCoversIntoPages : le repli doit rester juste.
    expect(moitieDe(rendre({ ...pageDouble(2), spreadIndex: undefined }))).toBe('gauche');
    expect(moitieDe(rendre({ ...pageDouble(3), spreadIndex: undefined }))).toBe('droite');
  });
});
