// Le cahier interieur est renumerote pour loger les gardes blanches. Ce
// fichier verrouille la seule chose que cette renumerotation ne doit JAMAIS
// emporter avec elle : de quel cote d'une double page chaque page se trouve.
//
// C'est une regression qui ne se voit pas. Elle ne casse aucun appel, ne leve
// aucune erreur, et ne se decouvre qu'en ouvrant le livre imprime — la moitie
// droite d'une photo posee sur la page de gauche.

const os = require('os');
const path = require('path');
const fsp = require('fs/promises');

jest.mock('../../services/printing/gelatoCoverComposer', () => ({
  composeGelatoWraparoundCover: jest.fn(async () => ({
    buffer: Buffer.from('couverture'),
    dims: { bleedSize: { width: 440, height: 292 } }
  }))
}));

jest.mock('../../services/composition/pdfService', () => ({
  renderPdfByPrinting: jest.fn()
}));

const pdfService = require('../../services/composition/pdfService');
const { buildGelatoPrintReadyPdf } = require('../../services/printing/gelatoPrintFile');

// Une page composee quelconque : seul son index nous interesse ici.
const pageComposee = (index) => ({
  page_index: index,
  layout_id: 'l-spread',
  content: { blocks: [{ kind: 'photo', itemIds: ['p1'], layoutId: 'l-spread' }] }
});

async function construire(nbPages, pageCount) {
  const dossier = await fsp.mkdtemp(path.join(os.tmpdir(), 'gelato-test-'));
  const rendu = path.join(dossier, 'rendu.pdf');
  const sortie = path.join(dossier, 'sortie.pdf');
  pdfService.renderPdfByPrinting.mockImplementation(async () => {
    await fsp.writeFile(rendu, 'pdf');
    return rendu;
  });

  const resultat = await buildGelatoPrintReadyPdf({
    book: { id: 'b1', title: 'Livre' },
    items: [],
    layouts: [{ id: 'l-spread', slug: 'FULL_PHOTO_SPREAD' }],
    template: {},
    format: { trimWidthMm: 210, trimHeightMm: 280 },
    interiorPages: Array.from({ length: nbPages }, (_, i) => pageComposee(i)),
    gelatoProductUid: 'uid',
    pageCount,
    outputPath: sortie
  });

  const { pages } = pdfService.renderPdfByPrinting.mock.calls[0][0];
  await fsp.rm(dossier, { recursive: true, force: true });
  return { pages, resultat };
}

describe('gelatoPrintFile — les gardes ne doivent pas decaler les doubles pages', () => {
  beforeEach(() => jest.clearAllMocks());

  it('conserve dans spreadIndex l index d ORIGINE de chaque page composee', async () => {
    const { pages } = await construire(6, 30);

    // La garde de tete occupe la place 0 : toutes les pages du livre sont
    // donc decalees d un cran dans le fichier.
    expect(pages[0].page_index).toBe(0);
    expect(pages[0].spreadIndex).toBeUndefined();

    const duLivre = pages.filter((page) => Number.isInteger(page.spreadIndex));
    expect(duLivre).toHaveLength(6);
    duLivre.forEach((page, index) => {
      expect(page.spreadIndex).toBe(index);
      // Le decalage est bien reel : sans spreadIndex, c est page_index que
      // le moteur de rendu lirait, et il donnerait la mauvaise moitie.
      expect(page.page_index).toBe(index + 1);
    });
  });

  it('la double page sort avec ses moities du bon cote, gardes comprises', async () => {
    // Le test qui compte vraiment : on rend REELLEMENT les pages telles que
    // le fichier d'impression les presente, et on lit la moitie obtenue.
    // Une double page occupe les index 3 et 4 (un vrai vis-a-vis : la page 1
    // est seule a droite — voir pageParity.js).
    const { pages } = await construire(6, 30);
    const { renderBookHtml } = require('../../services/composition/pageRenderer');

    const html = renderBookHtml({
      book: { title: 'Livre' },
      pages,
      items: [{ id: 'p1', kind: 'photo', url: 'https://cdn.test/panorama.jpg' }],
      layouts: [{ id: 'l-spread', slug: 'FULL_PHOTO_SPREAD' }],
      format: { formatId: 'standard', trimWidthMm: 210, trimHeightMm: 280 }
    });

    const moities = [...html.matchAll(/data-page-index="(\d+)"[\s\S]*?photo-spread (is-spread-\w+)/g)]
      .reduce((acc, [, index, classe]) => ({ ...acc, [index]: classe }), {});

    // La page composee 3 est a la place 4 du fichier (la garde occupe la 0).
    expect(moities['4']).toBe('is-spread-left');
    expect(moities['5']).toBe('is-spread-right');
  });

  it('garde une garde blanche en tete et une en queue', async () => {
    const { pages, resultat } = await construire(6, 30);
    expect(pages).toHaveLength(32);
    expect(pages[0].layout_id).toBeNull();
    expect(pages[pages.length - 1].layout_id).toBeNull();
    expect(resultat.realInteriorPages).toBe(6);
    expect(resultat.totalPages).toBe(33);
  });
});
