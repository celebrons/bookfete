// Tests unitaires du rendu HTML (fonction pure) : structure des pages,
// echappement HTML, repli propre quand le livre n'a pas encore de pages.

const { renderBookHtml, escapeHtml } = require('../../services/composition/pageRenderer');

// Le <style> (en <head>) contient les noms de classes CSS eux-memes : toute
// recherche de "ce qui a ete rendu" doit se limiter au <body>, sous peine de
// faux positifs/negatifs sur les selecteurs CSS.
function bodyOf(html) {
  return html.slice(html.indexOf('<body>'));
}

describe('escapeHtml', () => {
  it('echappe les caracteres HTML sensibles', () => {
    expect(escapeHtml('<script>alert("x")</script> & fils')).toBe(
      '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; fils'
    );
  });
});

describe('renderBookHtml', () => {
  const items = [
    { id: 'photo-1', kind: 'photo', url: 'https://cdn.test/1.jpg' },
    { id: 'texte-1', kind: 'texte', text: 'Un souvenir <b>précieux</b>.' }
  ];
  const pages = [
    { page_index: 0, content: { kind: 'photo', blocks: [{ kind: 'photo', itemIds: ['photo-1'] }] } },
    { page_index: 1, content: { kind: 'texte', blocks: [{ kind: 'texte', itemIds: ['texte-1'] }] } }
  ];

  it('produit un document HTML autonome a la bonne taille de page', () => {
    const html = renderBookHtml({ book: { title: 'Mon livre' }, pages, items });

    expect(html).toContain('<!doctype html>');
    expect(html).toContain('<title>Mon livre</title>');
    expect(html).toContain('@page { size: 210mm 297mm; margin: 0; }');
  });

  it('rend une page par entree de pages, dans l\'ordre de page_index', () => {
    const html = renderBookHtml({ book: {}, pages: [...pages].reverse(), items });
    const firstIndex = html.indexOf('data-page-index="0"');
    const secondIndex = html.indexOf('data-page-index="1"');
    expect(firstIndex).toBeGreaterThan(-1);
    expect(secondIndex).toBeGreaterThan(firstIndex);
  });

  it('echappe le texte des items pour eviter toute injection', () => {
    const html = renderBookHtml({ book: {}, pages, items });
    expect(html).not.toContain('<b>précieux</b>');
    expect(html).toContain('&lt;b&gt;précieux&lt;/b&gt;');
  });

  it('affiche un message clair si le livre n\'a pas encore de pages composées', () => {
    const html = renderBookHtml({ book: {}, pages: [], items: [] });
    expect(html).toContain("n'a pas encore de pages composées");
  });

  it('ignore silencieusement un itemId qui ne correspond a aucun item', () => {
    const brokenPages = [{ page_index: 0, content: { kind: 'photo', blocks: [{ kind: 'photo', itemIds: ['missing'] }] } }];
    expect(() => renderBookHtml({ book: {}, pages: brokenPages, items: [] })).not.toThrow();
  });
});

describe('renderBookHtml — le rendu varie reellement selon le layout choisi', () => {
  // Reproduit le cas signale : deux variantes du meme moteur (compose() avec
  // un variant different) doivent produire un HTML visuellement different,
  // pas seulement un layout_id different en base.
  const layouts = [
    { id: 'lay-pleine', slug: 'photo-pleine-page', kind: 'photo' },
    { id: 'lay-marge', slug: 'photo-avec-marge', kind: 'photo' },
    { id: 'lay-centre', slug: 'texte-centre', kind: 'texte' },
    { id: 'lay-citation', slug: 'texte-citation', kind: 'texte' }
  ];
  const items = [
    { id: 'photo-1', kind: 'photo', url: 'https://cdn.test/1.jpg' },
    { id: 'texte-1', kind: 'texte', text: 'Un souvenir.' }
  ];

  it('photo-pleine-page et photo-avec-marge rendent des classes differentes', () => {
    const pleine = renderBookHtml({
      book: {}, items, layouts,
      pages: [{ page_index: 0, content: { blocks: [{ kind: 'photo', itemIds: ['photo-1'], layoutId: 'lay-pleine' }] } }]
    });
    const marge = renderBookHtml({
      book: {}, items, layouts,
      pages: [{ page_index: 0, content: { blocks: [{ kind: 'photo', itemIds: ['photo-1'], layoutId: 'lay-marge' }] } }]
    });

    expect(pleine).not.toContain('class="block-photo photo-solo photo-inset"');
    expect(marge).toContain('class="block-photo photo-solo photo-inset"');
    expect(pleine).not.toEqual(marge);
  });

  it('texte-centre et texte-citation rendent des classes differentes', () => {
    const centre = renderBookHtml({
      book: {}, items, layouts,
      pages: [{ page_index: 0, content: { blocks: [{ kind: 'texte', itemIds: ['texte-1'], layoutId: 'lay-centre' }] } }]
    });
    const citation = renderBookHtml({
      book: {}, items, layouts,
      pages: [{ page_index: 0, content: { blocks: [{ kind: 'texte', itemIds: ['texte-1'], layoutId: 'lay-citation' }] } }]
    });

    expect(citation).toContain('class="block-texte texte-citation"');
    expect(centre).not.toContain('class="block-texte texte-citation"');
    expect(centre).not.toEqual(citation);
  });
});

describe('renderBookHtml — nouveaux layouts v2', () => {
  const v2Layouts = [
    { id: 'l-full-photo', slug: 'FULL_PHOTO', kind: 'photo' },
    { id: 'l-two-photos', slug: 'TWO_PHOTOS', kind: 'photo' },
    { id: 'l-four-photos', slug: 'FOUR_PHOTOS', kind: 'photo' },
    { id: 'l-caption', slug: 'PHOTO_WITH_CAPTION', kind: 'mixte' },
    { id: 'l-one-testimony', slug: 'ONE_TESTIMONY', kind: 'texte' },
    { id: 'l-two-testimonies', slug: 'TWO_TESTIMONIES', kind: 'texte' },
    { id: 'l-three-testimonies', slug: 'THREE_TESTIMONIES', kind: 'texte' },
    { id: 'l-photo-text', slug: 'PHOTO_TEXT', kind: 'mixte' },
    { id: 'l-text-photo', slug: 'TEXT_PHOTO', kind: 'mixte' },
    { id: 'l-two-photos-text', slug: 'TWO_PHOTOS_TEXT', kind: 'mixte' }
  ];
  const items = [
    { id: 'p1', kind: 'photo', url: 'https://cdn.test/1.jpg' },
    { id: 'p2', kind: 'photo', url: 'https://cdn.test/2.jpg' },
    { id: 't1', kind: 'texte', text: 'Un premier temoignage.' },
    { id: 't2', kind: 'texte', text: 'Un second temoignage.' }
  ];

  function pageFor(layoutSlug, itemIds, kind = 'mixte') {
    const layout = v2Layouts.find((l) => l.slug === layoutSlug);
    return renderBookHtml({
      book: {},
      items,
      layouts: v2Layouts,
      pages: [{ page_index: 0, content: { kind, blocks: [{ kind, itemIds, layoutId: layout.id }] } }]
    });
  }

  it('FOUR_PHOTOS rend une grille de 4 photos', () => {
    const four = ['p1', 'p2', 'p1', 'p2'];
    const html = pageFor('FOUR_PHOTOS', four, 'photo');
    expect(html).toContain('data-layout="FOUR_PHOTOS"');
  });

  it('PHOTO_WITH_CAPTION rend une figure avec figcaption, distincte de PHOTO_TEXT', () => {
    const withCaption = bodyOf(pageFor('PHOTO_WITH_CAPTION', ['p1', 't1'], 'mixte'));
    expect(withCaption).toContain('class="block-photo photo-with-caption"');
    expect(withCaption).toContain('<figcaption>');

    const photoText = bodyOf(pageFor('PHOTO_TEXT', ['p1', 't1'], 'mixte'));
    expect(photoText).not.toContain('<figcaption>');
  });

  it('PHOTO_TEXT et TEXT_PHOTO respectent l\'ordre reel des items (photo puis texte, ou l\'inverse)', () => {
    const photoText = bodyOf(pageFor('PHOTO_TEXT', ['p1', 't1'], 'mixte'));
    const textPhoto = bodyOf(pageFor('TEXT_PHOTO', ['t1', 'p1'], 'mixte'));

    const photoIndexA = photoText.indexOf('mixte-photo');
    const texteIndexA = photoText.indexOf('mixte-texte');
    expect(photoIndexA).toBeLessThan(texteIndexA);

    const texteIndexB = textPhoto.indexOf('mixte-texte');
    const photoIndexB = textPhoto.indexOf('mixte-photo');
    expect(texteIndexB).toBeLessThan(photoIndexB);
  });

  it('TWO_TESTIMONIES rend deux temoignages en cartes distinctes', () => {
    const html = pageFor('TWO_TESTIMONIES', ['t1', 't2'], 'texte');
    expect(html).toContain('testimony-stack-2');
    expect(html).toContain('Un premier temoignage.');
    expect(html).toContain('Un second temoignage.');
  });

  it('ONE_TESTIMONY rend un texte pleine page', () => {
    const html = pageFor('ONE_TESTIMONY', ['t1'], 'texte');
    expect(html).toContain('class="block-texte texte-pleine"');
  });
});

describe('renderBookHtml — texte decoupe (textOverrides)', () => {
  const layouts = [{ id: 'l-one-testimony', slug: 'ONE_TESTIMONY', kind: 'texte' }];
  const items = [{ id: 't1', kind: 'texte', text: 'Texte original tres long, jamais affiche entier ici.' }];

  it("affiche le fragment (textOverride) plutot que le texte complet de l'item", () => {
    const pages = [{
      page_index: 0,
      content: {
        kind: 'texte',
        blocks: [{
          kind: 'texte',
          itemIds: ['t1'],
          layoutId: 'l-one-testimony',
          textOverrides: [{ itemId: 't1', text: 'Premier fragment seulement.', splitIndex: 0, splitTotal: 2, continuation: false }]
        }]
      }
    }];
    const html = renderBookHtml({ book: {}, items, layouts, pages });
    expect(html).toContain('Premier fragment seulement.');
    expect(html).not.toContain('Texte original tres long');
    expect(html).toContain('(1/2)');
  });

  it("affiche une attribution de suite sans repeter la photo/le nom sur une page de continuation", () => {
    const contributionItems = [{ id: 't1', kind: 'texte', text: 'x', metadata: { contributor_name: 'Alice' } }];
    const pages = [{
      page_index: 0,
      content: {
        kind: 'texte',
        blocks: [{
          kind: 'texte',
          itemIds: ['t1'],
          layoutId: 'l-one-testimony',
          textOverrides: [{ itemId: 't1', text: 'Suite du recit.', splitIndex: 1, splitTotal: 2, continuation: true }]
        }]
      }
    }];
    const html = bodyOf(renderBookHtml({ book: {}, items: contributionItems, layouts, pages }));
    expect(html).toContain('Suite du recit.');
    expect(html).toContain('Alice');
    expect(html).toContain('(suite)');
    expect(html).not.toContain('<img'); // pas de photo re-rendue
  });
});
