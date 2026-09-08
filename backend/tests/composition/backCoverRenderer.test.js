const { renderBackCoverPage } = require('../../services/composition/backCoverRenderer');
const { resolveCoverTheme } = require('../../services/composition/coverTheme');

const FORMAT = { trimWidthMm: 210, trimHeightMm: 297, safeMarginMm: 15 };
const THEME = resolveCoverTheme({ slug: 'elegance' });

function photoItem(id, url = 'https://cdn.test/photo.jpg') {
  return { id, kind: 'photo', url, metadata: { orientation: 'landscape' } };
}

function pageFor(variant, { itemIds = [], statsLine = '', phrase = null } = {}) {
  return {
    page_index: 3,
    content: { kind: 'back-cover', variant, itemIds, statsLine, phrase, theme: THEME }
  };
}

describe('backCoverRenderer.renderBackCoverPage — structure commune', () => {
  it('produit toujours un <section class="page ..."> avec data-page-index', () => {
    const html = renderBackCoverPage(pageFor('BACK_MINIMAL'), { format: FORMAT, isLast: true, itemsById: {} });
    expect(html).toContain('<section class="page');
    expect(html).toContain('data-page-index="3"');
    expect(html).toContain('data-cvr-role="back-cover"');
  });

  it('la signature Celebrons est toujours presente, mais discrete (petite classe de marque, jamais la classe titre)', () => {
    const html = renderBackCoverPage(pageFor('BACK_MINIMAL'), { format: FORMAT, isLast: true, itemsById: {} });
    expect(html).toContain('cvr-brand');
    expect(html).toContain('Celebrons');
    expect(html).not.toMatch(/class="cvr-title[^"]*">Celebrons/);
  });

  it('echappe le contenu (protection injection)', () => {
    const html = renderBackCoverPage(pageFor('BACK_MINIMAL', { phrase: '<script>alert(1)</script>' }), { format: FORMAT, isLast: true, itemsById: {} });
    expect(html).not.toContain('<script>alert(1)</script>');
  });
});

describe('backCoverRenderer — BACK_MINIMAL (phrase absente structurellement)', () => {
  it('sans phrase : le bloc phrase est structurellement absent, pas juste une chaine vide dans un <p>', () => {
    const html = renderBackCoverPage(pageFor('BACK_MINIMAL', { phrase: null }), { format: FORMAT, isLast: true, itemsById: {} });
    expect(html).not.toContain('cvr-back-phrase');
  });

  it('avec phrase : le bloc est present et affiche le texte exact', () => {
    const html = renderBackCoverPage(pageFor('BACK_MINIMAL', { phrase: 'Des mots, des souvenirs.' }), { format: FORMAT, isLast: true, itemsById: {} });
    expect(html).toContain('cvr-back-phrase');
    expect(html).toContain('Des mots, des souvenirs.');
  });

  it('ne contient jamais de statistiques (BACK_MINIMAL n\'en affiche pas, meme si statsLine est fourni par erreur)', () => {
    const html = renderBackCoverPage(pageFor('BACK_MINIMAL', { statsLine: '3 photos' }), { format: FORMAT, isLast: true, itemsById: {} });
    expect(html).not.toContain('cvr-back-stats');
  });
});

describe('backCoverRenderer — BACK_STATS', () => {
  it('affiche la ligne de statistiques exacte fournie par coverComposer (aucune recomposition ici)', () => {
    const html = renderBackCoverPage(pageFor('BACK_STATS', { statsLine: '32 contributeurs · 47 souvenirs · 18 photos' }), { format: FORMAT, isLast: true, itemsById: {} });
    expect(html).toContain('32 contributeurs');
    expect(html).toContain('47 souvenirs');
    expect(html).toContain('18 photos');
  });

  it('les separateurs "." recoivent une classe d\'accent distincte', () => {
    const html = renderBackCoverPage(pageFor('BACK_STATS', { statsLine: '5 souvenirs · 2 photos' }), { format: FORMAT, isLast: true, itemsById: {} });
    expect(html).toContain('cvr-dot');
  });

  it('ne rend aucune photo (BACK_STATS n\'en a pas)', () => {
    const html = renderBackCoverPage(pageFor('BACK_STATS', { statsLine: '5 souvenirs' }), { format: FORMAT, isLast: true, itemsById: {} });
    expect(html).not.toContain('cvr-back-photo');
  });
});

describe('backCoverRenderer — BACK_PHOTO_STATS', () => {
  it('rend la photo fournie avec le meme cadre (photo-frame) que le reste du livre (jamais de deformation ni de recadrage)', () => {
    const itemsById = { p1: photoItem('p1') };
    const html = renderBackCoverPage(
      pageFor('BACK_PHOTO_STATS', { itemIds: ['p1'], statsLine: '5 souvenirs · 2 photos' }),
      { format: FORMAT, isLast: true, itemsById }
    );
    expect(html).toContain('cvr-back-photo');
    expect(html).toContain('photo-frame');
    expect(html).toContain('<img src="https://cdn.test/photo.jpg"');
  });

  it('sans photo fournie (edge case), ne plante jamais et n\'affiche pas de figure vide', () => {
    const html = renderBackCoverPage(pageFor('BACK_PHOTO_STATS', { itemIds: [], statsLine: '5 souvenirs' }), { format: FORMAT, isLast: true, itemsById: {} });
    expect(() => html).not.toThrow();
    expect(html).not.toContain('<figure class="cvr-back-photo">');
  });
});

describe('backCoverRenderer — coherence avec le recto (meme theme)', () => {
  it('utilise exactement les memes variables de police que frontCoverRenderer pour le meme theme', () => {
    const { renderFrontCoverPage } = require('../../services/composition/frontCoverRenderer');
    const front = renderFrontCoverPage(
      { page_index: 0, content: { kind: 'front-cover', variant: 'COVER_MINIMAL', itemIds: [], title: 'T', kicker: '', subtitle: '', dateLabel: '', theme: THEME } },
      { format: FORMAT, isLast: false, itemsById: {} }
    );
    const back = renderBackCoverPage(pageFor('BACK_MINIMAL'), { format: FORMAT, isLast: true, itemsById: {} });

    const extractVars = (html) => html.match(/--cvr-title-font:[^;]+/)[0];
    expect(extractVars(front)).toBe(extractVars(back));
  });
});
