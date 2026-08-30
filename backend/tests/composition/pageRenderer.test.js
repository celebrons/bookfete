// Tests unitaires du rendu HTML (fonction pure) : structure des pages,
// echappement HTML, repli propre quand le livre n'a pas encore de pages.

const { renderBookHtml, escapeHtml } = require('../../services/composition/pageRenderer');

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
