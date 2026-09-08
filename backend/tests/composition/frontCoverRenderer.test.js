const { renderFrontCoverPage, FRONT_COVER_VARIANTS } = require('../../services/composition/frontCoverRenderer');
const { resolveCoverTheme } = require('../../services/composition/coverTheme');

const FORMAT = { trimWidthMm: 210, trimHeightMm: 297, safeMarginMm: 15 };
const THEME = resolveCoverTheme({ slug: 'elegance' });

function photoItem(id, url = 'https://cdn.test/photo.jpg', orientation = 'portrait') {
  return { id, kind: 'photo', url, metadata: { orientation } };
}

function pageFor(variant, { itemIds = [], title = 'Titre', kicker = '', subtitle = '', dateLabel = '' } = {}) {
  return {
    page_index: 0,
    content: { kind: 'front-cover', variant, itemIds, title, kicker, subtitle, dateLabel, theme: THEME }
  };
}

describe('frontCoverRenderer.renderFrontCoverPage — structure commune', () => {
  it('produit toujours un <section class="page ..."> avec data-page-index', () => {
    const html = renderFrontCoverPage(pageFor('COVER_MINIMAL'), { format: FORMAT, isLast: false, itemsById: {} });
    expect(html).toContain('<section class="page');
    expect(html).toContain('data-page-index="0"');
    expect(html).toContain('data-cvr-role="front-cover"');
  });

  it('porte la classe page-break sauf si isLast (meme convention que les pages interieures)', () => {
    const notLast = renderFrontCoverPage(pageFor('COVER_MINIMAL'), { format: FORMAT, isLast: false, itemsById: {} });
    const last = renderFrontCoverPage(pageFor('COVER_MINIMAL'), { format: FORMAT, isLast: true, itemsById: {} });
    expect(notLast).toContain('page-break');
    expect(last).not.toContain('page-break');
  });

  it('echappe le titre (protection injection), meme motif que pageRenderer.test.js', () => {
    const html = renderFrontCoverPage(pageFor('COVER_MINIMAL', { title: '<script>alert(1)</script>' }), { format: FORMAT, isLast: true, itemsById: {} });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('preserve les caracteres accentues', () => {
    const html = renderFrontCoverPage(pageFor('COVER_MINIMAL', { title: 'Été à Noël, 60 ans de Renée' }), { format: FORMAT, isLast: true, itemsById: {} });
    expect(html).toContain('Été à Noël, 60 ans de Renée');
  });

  it('le contenu textuel vit dans la zone de securite (cvr-safe)', () => {
    const html = renderFrontCoverPage(pageFor('COVER_MINIMAL', { title: 'Un titre' }), { format: FORMAT, isLast: true, itemsById: {} });
    expect(html).toContain('cvr-safe');
  });
});

describe('frontCoverRenderer — COVER_MINIMAL', () => {
  it('ne contient aucune photo/photo-frame (livre sans photo, ne plante jamais)', () => {
    const html = renderFrontCoverPage(pageFor('COVER_MINIMAL'), { format: FORMAT, isLast: true, itemsById: {} });
    expect(html).not.toContain('photo-frame');
    expect(html).not.toContain('<img');
  });
});

describe('frontCoverRenderer — COVER_PHOTO / COVER_PHOTO_TITLE / COVER_MULTI_PHOTO', () => {
  it('COVER_PHOTO reutilise photo-frame (jamais de deformation, meme technique que les pages interieures)', () => {
    const itemsById = { p1: photoItem('p1') };
    const html = renderFrontCoverPage(pageFor('COVER_PHOTO', { itemIds: ['p1'] }), { format: FORMAT, isLast: true, itemsById });
    expect(html).toContain('class="photo-frame');
    expect(html).toContain('<img src="https://cdn.test/photo.jpg"');
  });

  it('COVER_PHOTO_TITLE applique systematiquement un voile derriere le texte (pas de detection de luminosite)', () => {
    const itemsById = { p1: photoItem('p1') };
    const html = renderFrontCoverPage(pageFor('COVER_PHOTO_TITLE', { itemIds: ['p1'] }), { format: FORMAT, isLast: true, itemsById });
    expect(html).toContain('cvr-scrim');
  });

  it('applique le biais de recadrage portrait uniquement pour une photo source portrait', () => {
    const itemsById = { p1: photoItem('p1', 'https://cdn.test/a.jpg', 'portrait') };
    const html = renderFrontCoverPage(pageFor('COVER_PHOTO_TITLE', { itemIds: ['p1'] }), { format: FORMAT, isLast: true, itemsById });
    expect(html).toContain('cvr-bias-portrait');
  });

  it('ne biaise jamais une photo paysage', () => {
    const itemsById = { p1: photoItem('p1', 'https://cdn.test/a.jpg', 'landscape') };
    const html = renderFrontCoverPage(pageFor('COVER_PHOTO_TITLE', { itemIds: ['p1'] }), { format: FORMAT, isLast: true, itemsById });
    expect(html).not.toContain('cvr-bias-portrait');
  });

  it('COVER_MULTI_PHOTO rend au maximum 3 photos, jamais une mosaique', () => {
    const itemsById = { p1: photoItem('p1'), p2: photoItem('p2'), p3: photoItem('p3'), p4: photoItem('p4') };
    const html = renderFrontCoverPage(
      pageFor('COVER_MULTI_PHOTO', { itemIds: ['p1', 'p2', 'p3', 'p4'] }),
      { format: FORMAT, isLast: true, itemsById }
    );
    const imgCount = (html.match(/<img /g) || []).length;
    expect(imgCount).toBeLessThanOrEqual(3);
  });

  it('un itemId sans item correspondant est ignore silencieusement (ne plante jamais)', () => {
    expect(() => renderFrontCoverPage(pageFor('COVER_PHOTO', { itemIds: ['missing'] }), { format: FORMAT, isLast: true, itemsById: {} })).not.toThrow();
  });
});

describe('frontCoverRenderer — COVER_SPLIT / COVER_FRAMED (v3)', () => {
  it('COVER_SPLIT reutilise photo-frame (jamais de deformation) dans son panneau photo', () => {
    const itemsById = { p1: photoItem('p1') };
    const html = renderFrontCoverPage(pageFor('COVER_SPLIT', { itemIds: ['p1'] }), { format: FORMAT, isLast: true, itemsById });
    expect(html).toContain('cvr-split-photo');
    expect(html).toContain('class="photo-frame');
    expect(html).toContain('<img src="https://cdn.test/photo.jpg"');
  });

  it('COVER_SPLIT ne plante jamais sans photo', () => {
    expect(() => renderFrontCoverPage(pageFor('COVER_SPLIT'), { format: FORMAT, isLast: true, itemsById: {} })).not.toThrow();
  });

  it('COVER_FRAMED reutilise photo-frame (jamais de deformation) dans son cadre', () => {
    const itemsById = { p1: photoItem('p1') };
    const html = renderFrontCoverPage(pageFor('COVER_FRAMED', { itemIds: ['p1'] }), { format: FORMAT, isLast: true, itemsById });
    expect(html).toContain('cvr-framed-photo');
    expect(html).toContain('class="photo-frame');
    expect(html).toContain('<img src="https://cdn.test/photo.jpg"');
  });

  it('COVER_FRAMED ne plante jamais sans photo', () => {
    expect(() => renderFrontCoverPage(pageFor('COVER_FRAMED'), { format: FORMAT, isLast: true, itemsById: {} })).not.toThrow();
  });

  it('le contenu textuel des deux nouvelles variantes vit dans la zone de securite (cvr-safe)', () => {
    const htmlSplit = renderFrontCoverPage(pageFor('COVER_SPLIT'), { format: FORMAT, isLast: true, itemsById: {} });
    const htmlFramed = renderFrontCoverPage(pageFor('COVER_FRAMED'), { format: FORMAT, isLast: true, itemsById: {} });
    expect(htmlSplit).toContain('cvr-safe');
    expect(htmlFramed).toContain('cvr-safe');
  });
});

describe('frontCoverRenderer — sous-titre affiche sur les 6 variantes (regression)', () => {
  it.each(FRONT_COVER_VARIANTS)('%s affiche le sous-titre quand il est fourni (oubli initial sur COVER_PHOTO/COVER_MULTI_PHOTO)', (variant) => {
    const html = renderFrontCoverPage(
      pageFor(variant, { subtitle: 'Les souvenirs de ceux qui l\'aiment' }),
      { format: FORMAT, isLast: true, itemsById: {} }
    );
    expect(html).toContain('cvr-subtitle');
    expect(html).toContain('Les souvenirs de ceux qui l&#39;aiment');
  });
});

describe('frontCoverRenderer — sous-titre jamais invente', () => {
  it('n\'affiche pas de bloc sous-titre quand il est vide', () => {
    const html = renderFrontCoverPage(pageFor('COVER_MINIMAL', { subtitle: '' }), { format: FORMAT, isLast: true, itemsById: {} });
    expect(html).not.toContain('cvr-subtitle');
  });

  it('affiche le sous-titre seulement s\'il est explicitement fourni', () => {
    const html = renderFrontCoverPage(pageFor('COVER_MINIMAL', { subtitle: 'Les souvenirs de ceux qui l\'aiment' }), { format: FORMAT, isLast: true, itemsById: {} });
    expect(html).toContain('cvr-subtitle');
    expect(html).toContain('Les souvenirs de ceux qui l&#39;aiment');
  });
});

describe('frontCoverRenderer — coherence recto/verso (theme partage)', () => {
  it('deux rendus avec le meme theme utilisent exactement les memes variables CSS', () => {
    const htmlA = renderFrontCoverPage(pageFor('COVER_MINIMAL'), { format: FORMAT, isLast: true, itemsById: {} });
    const htmlB = renderFrontCoverPage(pageFor('COVER_MINIMAL', { title: 'Autre titre' }), { format: FORMAT, isLast: true, itemsById: {} });
    const extractVars = (html) => html.match(/--cvr-title-font:[^;]+/)[0];
    expect(extractVars(htmlA)).toBe(extractVars(htmlB));
  });
});
