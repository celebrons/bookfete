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

describe('renderBookHtml — cadrage des photos (jamais de recadrage)', () => {
  it("utilise object-fit:contain (l'image entiere reste toujours visible), jamais cover (qui recadrerait)", () => {
    const html = renderBookHtml({
      book: {},
      items: [{ id: 'photo-1', kind: 'photo', url: 'https://cdn.test/1.jpg' }],
      pages: [{ page_index: 0, content: { kind: 'photo', blocks: [{ kind: 'photo', itemIds: ['photo-1'] }] } }]
    });
    expect(html).toContain('.photo-frame img');
    expect(html).toContain('object-fit: contain');
    expect(html).not.toContain('object-fit: cover');
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
    expect(html).toContain('@page { size: 220mm 280mm; margin: 0; }'); // DEFAULT_FORMAT = "standard" (coverFormat.js)
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

describe('renderBookHtml — nouveaux layouts atelier manuel (v3)', () => {
  const v3Layouts = [
    { id: 'l-two-photos', slug: 'TWO_PHOTOS', kind: 'photo' },
    { id: 'l-three-photos', slug: 'THREE_PHOTOS', kind: 'photo' },
    { id: 'l-four-photos', slug: 'FOUR_PHOTOS', kind: 'photo' },
    { id: 'l-two-testimonies', slug: 'TWO_TESTIMONIES', kind: 'texte' },
    { id: 'l-three-testimonies', slug: 'THREE_TESTIMONIES', kind: 'texte' },
    { id: 'l-title-text', slug: 'TITLE_TEXT', kind: 'mixte' },
    { id: 'l-title-two-photos', slug: 'TITLE_TWO_PHOTOS', kind: 'mixte' },
    { id: 'l-title-four-photos', slug: 'TITLE_FOUR_PHOTOS', kind: 'mixte' }
  ];
  const items = [
    { id: 'p1', kind: 'photo', url: 'https://cdn.test/1.jpg' },
    { id: 'p2', kind: 'photo', url: 'https://cdn.test/2.jpg' },
    { id: 'p3', kind: 'photo', url: 'https://cdn.test/3.jpg' },
    { id: 'p4', kind: 'photo', url: 'https://cdn.test/4.jpg' },
    { id: 'title1', kind: 'texte', text: 'Notre ete 2019' },
    { id: 'body1', kind: 'texte', text: 'Un souvenir plus long, raconte ici.' },
    { id: 't1', kind: 'texte', text: 'Temoignage un.' },
    { id: 't2', kind: 'texte', text: 'Temoignage deux.' },
    { id: 't3', kind: 'texte', text: 'Temoignage trois.' }
  ];

  function pageFor(layoutSlug, itemIds, kind = 'mixte') {
    const layout = v3Layouts.find((l) => l.slug === layoutSlug);
    return renderBookHtml({
      book: {},
      items,
      layouts: v3Layouts,
      pages: [{ page_index: 0, content: { kind, blocks: [{ kind, itemIds, layoutId: layout.id }] } }]
    });
  }

  it('THREE_PHOTOS rend les trois photos, 2 en haut et 1 pleine largeur en bas', () => {
    const full = pageFor('THREE_PHOTOS', ['p1', 'p2', 'p3'], 'photo');
    const html = bodyOf(full);
    expect(html).toContain('data-layout="THREE_PHOTOS"');
    expect(html).toContain('photo-grid-3');
    expect((html.match(/<img /g) || []).length).toBe(3);
    // La 3e photo doit s'etendre sur les 2 colonnes (regle CSS dediee),
    // jamais une simple 3e colonne egale aux deux premieres.
    expect(full).toContain('.photo-grid-3 .photo-frame:nth-child(3) { grid-column: 1 / -1; }');
  });

  it('TITLE_TEXT rend le premier item comme titre (page-title), le second comme corps de texte', () => {
    const html = bodyOf(pageFor('TITLE_TEXT', ['title1', 'body1'], 'mixte'));
    expect(html).toContain('class="page-title"');
    expect(html).toContain('Notre ete 2019');
    expect(html).toContain('Un souvenir plus long, raconte ici.');
    // Le titre apparait avant le corps dans le HTML (ordre visuel).
    expect(html.indexOf('Notre ete 2019')).toBeLessThan(html.indexOf('Un souvenir plus long'));
  });

  it('TITLE_TWO_PHOTOS rend un titre suivi de deux photos (jamais le titre traite comme une legende de photo)', () => {
    const html = bodyOf(pageFor('TITLE_TWO_PHOTOS', ['title1', 'p1', 'p2'], 'mixte'));
    expect(html).toContain('class="page-title"');
    expect(html).toContain('Notre ete 2019');
    expect(html).toContain('title-photos-grid-2');
    expect((html.match(/<img /g) || []).length).toBe(2);
    expect(html).not.toContain('<figcaption>');
  });

  it('TITLE_FOUR_PHOTOS rend un titre suivi de quatre photos', () => {
    const html = bodyOf(pageFor('TITLE_FOUR_PHOTOS', ['title1', 'p1', 'p2', 'p3', 'p4'], 'mixte'));
    expect(html).toContain('Notre ete 2019');
    expect((html.match(/<img /g) || []).length).toBe(4);
  });

  it('un layout titre sans item pour le titre ne plante jamais (protection generale, itemId manquant)', () => {
    expect(() => pageFor('TITLE_TWO_PHOTOS', ['missing', 'p1', 'p2'], 'mixte')).not.toThrow();
  });

  // Regression (retour utilisateur : "quand je retire un element, les
  // autres ne restent pas a leur place") : renderTitleTextBlock/
  // renderTitlePhotosBlock recevaient la liste COMPACTEE (deja filtree des
  // trous) plutot que la liste POSITIONNELLE — des que le titre (position 0)
  // etait retire, l'item suivant (une photo ou le corps de texte) glissait
  // en position 0 et etait a tort traite comme le titre, faisant disparaitre
  // silencieusement le vrai contenu restant du rendu.
  it('TITLE_TWO_PHOTOS avec le TITRE retire (photos seules restantes) : les deux photos restent visibles, aucune traitee comme titre', () => {
    const html = bodyOf(pageFor('TITLE_TWO_PHOTOS', [null, 'p1', 'p2'], 'mixte'));
    expect(html).not.toContain('class="page-title"');
    expect((html.match(/<img /g) || []).length).toBe(2); // les 2 photos, aucune perdue
  });

  it('TITLE_TEXT avec le TITRE retire (corps de texte seul restant) : le corps reste visible, jamais rendu comme titre', () => {
    const html = bodyOf(pageFor('TITLE_TEXT', [null, 'body1'], 'mixte'));
    expect(html).not.toContain('class="page-title"');
    expect(html).toContain('Un souvenir plus long, raconte ici.');
  });

  it('TITLE_TWO_PHOTOS avec UNE photo retiree (titre + 1 photo restants) : le titre reste le titre, la photo restante reste visible', () => {
    const html = bodyOf(pageFor('TITLE_TWO_PHOTOS', ['title1', 'p1', null], 'mixte'));
    expect(html).toContain('class="page-title"');
    expect(html).toContain('Notre ete 2019');
    expect((html.match(/<img /g) || []).length).toBe(1); // p1 seule, jamais traitee comme titre
  });

  // Regression : .block-title-photos/.block-title-text avaient ete oublies
  // de la regle CSS qui donne aux blocs leur contexte flex (display:flex +
  // flex-direction:column). Consequence invisible dans un test HTML pur
  // (les <img> etaient bien presents dans le markup) mais reelle a l'affichage
  // : sans ce contexte flex, .title-photos-grid (qui a besoin de flex:1 pour
  // hériter une hauteur definie) s'effondrait a 0px de haut — les photos
  // etaient dans le HTML mais invisibles a l'ecran, seul le titre (texte en
  // flux normal, pas concerne par ce chainage de hauteur) apparaissait.
  it('block-title-photos et block-title-text font partie du contexte flex commun (sinon les photos/le texte s\'effondrent a 0px malgre un HTML correct)', () => {
    const html = pageFor('TITLE_TWO_PHOTOS', ['title1', 'p1', 'p2'], 'mixte');
    const flexRuleMatch = html.match(/\.block-photo,[^{]*\{[^}]*\}/);
    expect(flexRuleMatch).not.toBeNull();
    expect(flexRuleMatch[0]).toContain('.block-title-photos');
    expect(flexRuleMatch[0]).toContain('.block-title-text');
    expect(flexRuleMatch[0]).toContain('display: flex');
  });

  // Regression (retour utilisateur : "il faut absolument que les autres
  // photos restent a leur place lorsque je supprime une autre photo ou un
  // autre texte") : la classe de grille (photo-grid-N) etait choisie a
  // partir du nombre de photos REELLEMENT presentes (liste compactee) —
  // retirer une photo du milieu recomposait toute la grille et faisait
  // visuellement "sauter" les photos survivantes vers une autre position.
  // La grille doit desormais toujours garder le nombre d'EMPLACEMENTS du
  // format (photo-grid-4 reste photo-grid-4 meme a 3 photos), avec une
  // case vide (meme classe .photo-frame, sans <img>) pour l'emplacement
  // retire — jamais de trou visible ni de decalage des autres photos.
  it('FOUR_PHOTOS avec une photo du milieu retiree : la grille reste photo-grid-4 (jamais recomposee en 3), les photos survivantes gardent leur case', () => {
    const html = bodyOf(pageFor('FOUR_PHOTOS', ['p1', 'p2', null, 'p4'], 'photo'));
    expect(html).toContain('photo-grid-4');
    expect(html).not.toContain('photo-grid-3');
    expect((html.match(/<img /g) || []).length).toBe(3);
    // 4 cases au total (3 remplies + 1 vide), toutes en .photo-frame.
    expect((html.match(/class="photo-frame"/g) || []).length).toBe(4);
  });

  it('THREE_PHOTOS avec la 1ere photo retiree : la grille reste photo-grid-3, les 2 photos restantes gardent leur position (pas de decalage vers photo-grid-2)', () => {
    const html = bodyOf(pageFor('THREE_PHOTOS', [null, 'p2', 'p3'], 'photo'));
    expect(html).toContain('photo-grid-3');
    expect(html).not.toContain('photo-grid-2');
    expect((html.match(/<img /g) || []).length).toBe(2);
  });

  it('TWO_PHOTOS avec une photo retiree : la grille reste photo-grid-2 (jamais recomposee en solo pleine page)', () => {
    const html = bodyOf(pageFor('TWO_PHOTOS', ['p1', null], 'photo'));
    expect(html).toContain('photo-grid-2');
    expect(html).not.toContain('photo-solo');
    expect((html.match(/<img /g) || []).length).toBe(1);
  });

  it('TWO_TESTIMONIES avec un temoignage retire : la grille reste testimony-stack-2, la carte restante garde sa colonne (pas de recomposition en texte plein)', () => {
    const html = bodyOf(pageFor('TWO_TESTIMONIES', [null, 't2'], 'texte'));
    expect(html).toContain('testimony-stack-2');
    expect(html).toContain('Temoignage deux.');
    expect(html).not.toContain('Temoignage un.');
    expect((html.match(/testimony-card/g) || []).length).toBe(1);
  });

  it('THREE_TESTIMONIES avec le temoignage du milieu retire : la grille reste testimony-stack-3, les 2 autres gardent leur position d\'origine', () => {
    const html = bodyOf(pageFor('THREE_TESTIMONIES', ['t1', null, 't3'], 'texte'));
    expect(html).toContain('testimony-stack-3');
    expect(html).toContain('Temoignage un.');
    expect(html).toContain('Temoignage trois.');
    expect((html.match(/testimony-card/g) || []).length).toBe(2);
  });

  it('TITLE_FOUR_PHOTOS avec une photo (pas le titre) retiree : la grille photo reste title-photos-grid-4, le titre et les photos survivantes gardent leur place', () => {
    const html = bodyOf(pageFor('TITLE_FOUR_PHOTOS', ['title1', 'p1', null, 'p3', 'p4'], 'mixte'));
    expect(html).toContain('class="page-title"');
    expect(html).toContain('title-photos-grid-4');
    expect((html.match(/<img /g) || []).length).toBe(3);
  });
});

describe('renderBookHtml — densite par format (--fmt-space-scale/--fmt-type-scale)', () => {
  it('replie sur 1 (aucun changement visuel) quand format ne porte pas spaceScale/typeScale', () => {
    const html = renderBookHtml({ book: {}, pages: [], items: [] });
    expect(html).toContain('--fmt-space-scale: 1;');
    expect(html).toContain('--fmt-type-scale: 1;');
  });

  it('reprend spaceScale/typeScale du format transmis (voir formatDensity.js)', () => {
    const html = renderBookHtml({
      book: {},
      pages: [],
      items: [],
      format: { trimWidthMm: 170, trimHeightMm: 220, spaceScale: 0.75, typeScale: 0.88 }
    });
    expect(html).toContain('--fmt-space-scale: 0.75;');
    expect(html).toContain('--fmt-type-scale: 0.88;');
  });

  it('les marges/gaps et tailles de police significatives dependent des variables (jamais une valeur figee)', () => {
    const html = renderBookHtml({ book: {}, pages: [], items: [] });
    expect(html).toContain('padding: calc(14mm * var(--fmt-space-scale, 1));');
    expect(html).toContain('font-size: calc(13pt * var(--fmt-type-scale, 1));');
  });
});

describe('renderBookHtml — details dores discrets sur les pages interieures (Luxe uniquement)', () => {
  const pages = [{ page_index: 3, content: { kind: 'photo', blocks: [{ kind: 'photo', itemIds: ['photo-1'] }] } }];
  const items = [{ id: 'photo-1', kind: 'photo', url: 'https://cdn.test/1.jpg' }];

  it('format.formatId === "luxe" ajoute is-luxe + un numero de page discret, jamais un cadre pleine page', () => {
    const html = bodyOf(renderBookHtml({ book: {}, pages, items, format: { trimWidthMm: 240, trimHeightMm: 320, formatId: 'luxe' } }));
    expect(html).toMatch(/<section class="page is-luxe"/);
    expect(html).toContain('<span class="page-number-luxe">4</span>'); // page_index 3 -> "page 4" affichee
    // Retour utilisateur explicite ("ne pas mettre du doré partout") : le
    // cadre pleine page essaye puis retire ne doit plus jamais apparaitre.
    expect(html).not.toContain('has-gold-frame');
  });

  it('un autre format (ou aucun format) ne porte ni is-luxe ni numero de page', () => {
    const standard = bodyOf(renderBookHtml({ book: {}, pages, items, format: { trimWidthMm: 220, trimHeightMm: 280, formatId: 'standard' } }));
    const sansFormat = bodyOf(renderBookHtml({ book: {}, pages, items }));
    [standard, sansFormat].forEach((html) => {
      expect(html).not.toContain('is-luxe');
      expect(html).not.toContain('page-number-luxe');
    });
  });
});

describe('renderBookHtml — page de separation de chapitre (Luxe uniquement)', () => {
  it('rend le numero et le titre entre deux filets, aucune photo/texte reel', () => {
    const pages = [{ page_index: 5, content: { kind: 'chapter-separator', number: '02', title: 'CE QUI COMPTE' } }];
    const html = bodyOf(renderBookHtml({ book: {}, pages, items: [], format: { formatId: 'luxe' } }));
    expect(html).toContain('class="separator-number">02<');
    expect(html).toContain('class="separator-title">CE QUI COMPTE<');
    expect((html.match(/separator-rule/g) || []).length).toBe(2);
    expect(html).toContain('data-page-index="5"');
  });

  it('echappe le titre (jamais d\'injection)', () => {
    const pages = [{ page_index: 0, content: { kind: 'chapter-separator', number: '01', title: '<b>x</b>' } }];
    const html = bodyOf(renderBookHtml({ book: {}, pages, items: [], format: { formatId: 'luxe' } }));
    expect(html).not.toContain('<b>x</b>');
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
  });

  it('ne plante jamais si number/title sont absents', () => {
    const pages = [{ page_index: 0, content: { kind: 'chapter-separator' } }];
    expect(() => renderBookHtml({ book: {}, pages, items: [], format: { formatId: 'luxe' } })).not.toThrow();
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
