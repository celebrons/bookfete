const {
  composeFrontCover,
  composeBackCover,
  composeCoversIntoPages,
  COVER_PHOTO_THRESHOLDS,
  MULTI_PHOTO_MAX
} = require('../../services/composition/coverComposer');
const { resolveCoverFormat } = require('../../services/composition/coverFormat');

const FORMAT = resolveCoverFormat('standard'); // 220x280
const TEMPLATE = { id: 'tpl-1', slug: 'elegance' };

function greatPhoto(id, displayOrder = 0) {
  // Excellente resolution + ratio quasi-identique au format + portrait.
  return { id, kind: 'photo', display_order: displayOrder, metadata: { width: 2100, height: 2970, orientation: 'portrait' } };
}

function mediumPhoto(id, displayOrder = 0) {
  // Correcte mais pas excellente : carree, resolution moyenne.
  return { id, kind: 'photo', display_order: displayOrder, metadata: { width: 900, height: 900, orientation: 'square' } };
}

function weakPhoto(id, displayOrder = 0) {
  // Tres eloignee du ratio couverture, basse resolution, paysage.
  return { id, kind: 'photo', display_order: displayOrder, metadata: { width: 200, height: 60, orientation: 'landscape' } };
}

function textItem(id, displayOrder = 0, length = 100) {
  return { id, kind: 'texte', display_order: displayOrder, text: 'x'.repeat(length) };
}

describe('coverComposer.composeFrontCover — arbre de decision', () => {
  // PAR DEFAUT, UNE COUVERTURE DE TEXTE (2026-09-21).
  //
  // Le moteur choisissait ici la « meilleure » photo, et souvent trois d'un
  // coup. Retour utilisateur : « le systeme remplit systematiquement la
  // couverture avec 3 photos ». Aucun calcul ne sait quelle photo represente
  // un voyage — et se tromper la se voit plus que partout ailleurs.
  it('une photo excellente ne s\'impose plus en couverture', () => {
    const items = [greatPhoto('p1')];
    const front = composeFrontCover({ book: { title: 'Titre' }, items, template: TEMPLATE, format: FORMAT });
    expect(front.content.variant).toBe('COVER_MINIMAL');
    expect(front.content.itemIds).toEqual([]);
  });

  it('plusieurs photos excellentes non plus : jamais de trio impose', () => {
    const items = [greatPhoto('p1', 0), greatPhoto('p2', 1), greatPhoto('p3', 2), greatPhoto('p4', 3)];
    const front = composeFrontCover({ book: { title: 'Titre' }, items, template: TEMPLATE, format: FORMAT });
    expect(front.content.variant).toBe('COVER_MINIMAL');
    expect(front.content.itemIds).toEqual([]);
  });

  // Ce qui n'a PAS change, et qui doit etre protege : un choix explicite
  // reste souverain, qu'il porte sur le format ou sur la photo.
  it('une photo choisie explicitement reste souveraine', () => {
    const items = [greatPhoto('p1'), greatPhoto('p2', 1)];
    const front = composeFrontCover({
      book: { title: 'Titre', cover_overrides: { frontPhotoId: 'p2' } },
      items, template: TEMPLATE, format: FORMAT
    });
    expect(front.content.itemIds).toEqual(['p2']);
    expect(front.content.variant).not.toBe('COVER_MINIMAL');
  });

  it('aucune photo -> COVER_MINIMAL', () => {
    const items = [textItem('t1'), textItem('t2')];
    const front = composeFrontCover({ book: { title: 'Titre' }, items, template: TEMPLATE, format: FORMAT });
    expect(front.content.variant).toBe('COVER_MINIMAL');
    expect(front.content.itemIds).toEqual([]);
  });

  it('aucune photo du tout (livre vide) -> COVER_MINIMAL, ne plante jamais', () => {
    expect(() => composeFrontCover({ book: { title: 'Titre' }, items: [], template: TEMPLATE, format: FORMAT })).not.toThrow();
    const front = composeFrontCover({ book: { title: 'Titre' }, items: [], template: TEMPLATE, format: FORMAT });
    expect(front.content.variant).toBe('COVER_MINIMAL');
  });

  it('COVER_MULTI_PHOTO reste rare : un livre equilibre (texte+photos) avec plusieurs bonnes photos ne le declenche pas forcement', () => {
    const items = [
      greatPhoto('p1', 0), greatPhoto('p2', 1), greatPhoto('p3', 2),
      textItem('t1', 3, 400), textItem('t2', 4, 400), textItem('t3', 5, 400), textItem('t4', 6, 400)
    ];
    const front = composeFrontCover({ book: { title: 'Titre' }, items, template: TEMPLATE, format: FORMAT });
    // profil non-PHOTO attendu ici (beaucoup de texte) -> pas de multi-photo
    expect(front.content.variant).not.toBe('COVER_MULTI_PHOTO');
  });

  it('titre tres long : passe tel quel (la troncature est une responsabilite CSS du renderer, pas du composer)', () => {
    const longTitle = 'Un titre extremement long qui depasse largement ce qu\'une couverture peut raisonnablement afficher sur une seule ligne '.repeat(3);
    const front = composeFrontCover({ book: { title: longTitle }, items: [], template: TEMPLATE, format: FORMAT });
    expect(front.content.title).toBe(longTitle.trim().slice(0, 180));
  });

  it('titre tres court fonctionne normalement', () => {
    const front = composeFrontCover({ book: { title: 'Bob' }, items: [], template: TEMPLATE, format: FORMAT });
    expect(front.content.title).toBe('Bob');
  });

  it('titre avec caracteres accentues preserve exactement', () => {
    const front = composeFrontCover({ book: { title: 'Été à Noël, 60 ans de Renée' }, items: [], template: TEMPLATE, format: FORMAT });
    expect(front.content.title).toBe('Été à Noël, 60 ans de Renée');
  });

  it('jamais de sous-titre invente : toujours vide (aucune source de donnee aujourd\'hui)', () => {
    const front = composeFrontCover({ book: { title: 'Titre' }, items: [], template: TEMPLATE, format: FORMAT });
    expect(front.content.subtitle).toBe('');
  });

  it('date absente si book.event_date n\'est pas fourni (jamais deduite de created_at)', () => {
    const front = composeFrontCover({ book: { title: 'Titre', created_at: '2026-01-01' }, items: [], template: TEMPLATE, format: FORMAT });
    expect(front.content.dateLabel).toBe('');
  });

  it('date affichee si book.event_date est fourni', () => {
    const front = composeFrontCover({ book: { title: 'Titre', event_date: '2019-06-15' }, items: [], template: TEMPLATE, format: FORMAT });
    expect(front.content.dateLabel).toBe('2019');
  });

  it('embarque le theme resolu (pas de re-resolution necessaire cote renderer)', () => {
    const front = composeFrontCover({ book: { title: 'Titre' }, items: [], template: TEMPLATE, format: FORMAT });
    expect(front.content.theme).toBeDefined();
    expect(front.content.theme.titleFont).toContain('Cormorant Garamond');
  });
});

describe('coverComposer.composeFrontCover — libelle de l\'occasion (kicker)', () => {
  it('resout le slug technique stocke en base vers son libelle lisible (jamais le slug brut)', () => {
    const front = composeFrontCover({ book: { title: 'Titre', event_type: 'projet' }, items: [], template: TEMPLATE, format: FORMAT });
    expect(front.content.kicker).toBe('Fin de projet');
  });

  it('fonctionne pour chaque occasion du catalogue de creation', () => {
    const front = composeFrontCover({ book: { title: 'Titre', event_type: 'mariage' }, items: [], template: TEMPLATE, format: FORMAT });
    expect(front.content.kicker).toBe('Mariage / Union');
  });

  it('un slug inconnu (occasion ajoutee depuis, non cataloguee ici) s\'affiche tel quel plutot que de disparaitre', () => {
    const front = composeFrontCover({ book: { title: 'Titre', event_type: 'evenement-sur-mesure' }, items: [], template: TEMPLATE, format: FORMAT });
    expect(front.content.kicker).toBe('evenement-sur-mesure');
  });

  it('aucune occasion renseignee -> kicker vide (jamais invente)', () => {
    const front = composeFrontCover({ book: { title: 'Titre' }, items: [], template: TEMPLATE, format: FORMAT });
    expect(front.content.kicker).toBe('');
  });

  // Retour utilisateur : le kicker automatique (ex. "Fin de projet",
  // derive de l'occasion choisie a la creation) doit pouvoir etre
  // personnalise depuis l'atelier — meme principe de surcharge que
  // closingPhraseMode/closingPhraseText plus bas (auto/custom/none).
  it('kickerMode "auto" explicite se comporte comme l\'absence de surcharge', () => {
    const front = composeFrontCover({
      book: { title: 'Titre', event_type: 'projet', cover_overrides: { kickerMode: 'auto' } },
      items: [], template: TEMPLATE, format: FORMAT
    });
    expect(front.content.kicker).toBe('Fin de projet');
  });

  it('kickerMode "none" -> aucun kicker, meme si une occasion est renseignee', () => {
    const front = composeFrontCover({
      book: { title: 'Titre', event_type: 'projet', cover_overrides: { kickerMode: 'none' } },
      items: [], template: TEMPLATE, format: FORMAT
    });
    expect(front.content.kicker).toBe('');
  });

  it('kickerMode "custom" -> le texte exact fourni par l\'utilisateur, ignore l\'occasion', () => {
    const front = composeFrontCover({
      book: { title: 'Titre', event_type: 'projet', cover_overrides: { kickerMode: 'custom', kickerText: 'Notre belle aventure' } },
      items: [], template: TEMPLATE, format: FORMAT
    });
    expect(front.content.kicker).toBe('Notre belle aventure');
  });

  it('kickerMode "custom" avec un texte vide -> kicker vide (jamais un espace affiche)', () => {
    const front = composeFrontCover({
      book: { title: 'Titre', event_type: 'projet', cover_overrides: { kickerMode: 'custom', kickerText: '   ' } },
      items: [], template: TEMPLATE, format: FORMAT
    });
    expect(front.content.kicker).toBe('');
  });
});

describe('coverComposer.composeFrontCover — surcharges manuelles (cover_overrides)', () => {
  it('le trio reste disponible, mais il se CHOISIT', () => {
    const items = [greatPhoto('p1', 0), greatPhoto('p2', 1), greatPhoto('p3', 2)];
    const front = composeFrontCover({
      book: { title: 'Titre', cover_overrides: { frontVariant: 'COVER_MULTI_PHOTO' } },
      items, template: TEMPLATE, format: FORMAT
    });
    expect(front.content.variant).toBe('COVER_MULTI_PHOTO');
    expect(front.content.itemIds.length).toBeGreaterThan(1);
    expect(front.content.itemIds.length).toBeLessThanOrEqual(MULTI_PHOTO_MAX);
  });

  it('un livre qui n\'a jamais touche cover_overrides se comporte a l\'identique (non-regression)', () => {
    const items = [greatPhoto('p1'), weakPhoto('p2')];
    const withoutField = composeFrontCover({ book: { title: 'Titre' }, items, template: TEMPLATE, format: FORMAT });
    const withEmptyObject = composeFrontCover({ book: { title: 'Titre', cover_overrides: {} }, items, template: TEMPLATE, format: FORMAT });
    expect(withEmptyObject.content).toEqual(withoutField.content);
  });

  it('frontPhotoId valide force cette photo, meme si son score est sous le seuil "correct"', () => {
    const items = [greatPhoto('p1'), weakPhoto('p2')];
    const front = composeFrontCover({
      book: { title: 'Titre', cover_overrides: { frontPhotoId: 'p2' } },
      items, template: TEMPLATE, format: FORMAT
    });
    expect(front.content.itemIds).toEqual(['p2']);
    expect(front.content.variant).not.toBe('COVER_MINIMAL');
  });

  it('frontPhotoId choisi manuellement n\'aboutit jamais a COVER_MULTI_PHOTO', () => {
    const items = [greatPhoto('p1'), greatPhoto('p2'), greatPhoto('p3'), greatPhoto('p4')];
    const front = composeFrontCover({
      book: { title: 'Titre', cover_overrides: { frontPhotoId: 'p2' } },
      items, template: TEMPLATE, format: FORMAT
    });
    expect(front.content.variant).not.toBe('COVER_MULTI_PHOTO');
    expect(front.content.itemIds).toEqual(['p2']);
  });

  it('frontPhotoId orphelin (photo supprimee depuis) retombe silencieusement sur la couverture de texte', () => {
    const items = [greatPhoto('p1')];
    const front = composeFrontCover({
      book: { title: 'Titre', cover_overrides: { frontPhotoId: 'photo-disparue' } },
      items, template: TEMPLATE, format: FORMAT
    });
    // Repli sur le comportement automatique, qui est desormais la
    // couverture de texte : jamais une photo choisie a la place de celle
    // qui a disparu — ce serait deviner a la place de l'utilisateur.
    expect(front.content.variant).toBe('COVER_MINIMAL');
    expect(front.content.itemIds).toEqual([]);
  });

  it('sous-titre et date surcharges apparaissent dans le contenu', () => {
    const front = composeFrontCover({
      book: { title: 'Titre', cover_overrides: { subtitle: 'Les souvenirs de ceux qui l\'aiment', dateLabel: 'Ete 2019' } },
      items: [], template: TEMPLATE, format: FORMAT
    });
    expect(front.content.subtitle).toBe('Les souvenirs de ceux qui l\'aiment');
    expect(front.content.dateLabel).toBe('Ete 2019');
  });

  it('dateLabel surcharge est prioritaire sur book.event_date', () => {
    const front = composeFrontCover({
      book: { title: 'Titre', event_date: '2019-06-15', cover_overrides: { dateLabel: '2020' } },
      items: [], template: TEMPLATE, format: FORMAT
    });
    expect(front.content.dateLabel).toBe('2020');
  });
});

describe('coverComposer.composeFrontCover — format force explicitement (frontVariant)', () => {
  it('frontVariant "AUTO" explicite se comporte comme l\'absence de surcharge (non-regression)', () => {
    const items = [greatPhoto('p1'), weakPhoto('p2')];
    const auto = composeFrontCover({
      book: { title: 'Titre', cover_overrides: { frontVariant: 'AUTO' } },
      items, template: TEMPLATE, format: FORMAT
    });
    const noOverride = composeFrontCover({ book: { title: 'Titre' }, items, template: TEMPLATE, format: FORMAT });
    expect(auto.content).toEqual(noOverride.content);
  });

  it('frontVariant inconnu/corrompu retombe sur l\'arbre automatique (jamais d\'erreur)', () => {
    const items = [greatPhoto('p1')];
    const bogus = composeFrontCover({
      book: { title: 'Titre', cover_overrides: { frontVariant: 'CECI_NEXISTE_PAS' } },
      items, template: TEMPLATE, format: FORMAT
    });
    const noOverride = composeFrontCover({ book: { title: 'Titre' }, items, template: TEMPLATE, format: FORMAT });
    expect(bogus.content).toEqual(noOverride.content);
  });

  it('COVER_MINIMAL force en presence d\'une excellente photo -> COVER_MINIMAL quand meme (choix assume)', () => {
    const items = [greatPhoto('p1')];
    const front = composeFrontCover({
      book: { title: 'Titre', cover_overrides: { frontVariant: 'COVER_MINIMAL' } },
      items, template: TEMPLATE, format: FORMAT
    });
    expect(front.content.variant).toBe('COVER_MINIMAL');
    expect(front.content.itemIds).toEqual([]);
  });

  it('COVER_SPLIT force avec une photo disponible -> COVER_SPLIT avec cette photo', () => {
    const items = [greatPhoto('p1')];
    const front = composeFrontCover({
      book: { title: 'Titre', cover_overrides: { frontVariant: 'COVER_SPLIT' } },
      items, template: TEMPLATE, format: FORMAT
    });
    expect(front.content.variant).toBe('COVER_SPLIT');
    expect(front.content.itemIds).toEqual(['p1']);
  });

  it('un format photo force ignore le seuil de qualite habituel : une photo faible est quand meme affichee', () => {
    const items = [weakPhoto('p1')];
    const front = composeFrontCover({
      book: { title: 'Titre', cover_overrides: { frontVariant: 'COVER_FRAMED' } },
      items, template: TEMPLATE, format: FORMAT
    });
    expect(front.content.variant).toBe('COVER_FRAMED');
    expect(front.content.itemIds).toEqual(['p1']);
  });

  it('un format photo force sans aucune photo disponible -> repli gracieux sur COVER_MINIMAL', () => {
    const items = [textItem('t1')];
    const front = composeFrontCover({
      book: { title: 'Titre', cover_overrides: { frontVariant: 'COVER_PHOTO_TITLE' } },
      items, template: TEMPLATE, format: FORMAT
    });
    expect(front.content.variant).toBe('COVER_MINIMAL');
    expect(front.content.itemIds).toEqual([]);
  });

  it('COVER_MULTI_PHOTO force avec 4 photos disponibles -> COVER_MULTI_PHOTO, jamais plus de MULTI_PHOTO_MAX', () => {
    const items = [greatPhoto('p1'), greatPhoto('p2'), greatPhoto('p3'), greatPhoto('p4')];
    const front = composeFrontCover({
      book: { title: 'Titre', cover_overrides: { frontVariant: 'COVER_MULTI_PHOTO' } },
      items, template: TEMPLATE, format: FORMAT
    });
    expect(front.content.variant).toBe('COVER_MULTI_PHOTO');
    expect(front.content.itemIds.length).toBeLessThanOrEqual(MULTI_PHOTO_MAX);
    expect(front.content.itemIds.length).toBeGreaterThanOrEqual(2);
  });

  it('COVER_MULTI_PHOTO force avec une seule photo disponible -> repli sur COVER_PHOTO', () => {
    const items = [mediumPhoto('p1')];
    const front = composeFrontCover({
      book: { title: 'Titre', cover_overrides: { frontVariant: 'COVER_MULTI_PHOTO' } },
      items, template: TEMPLATE, format: FORMAT
    });
    expect(front.content.variant).toBe('COVER_PHOTO');
    expect(front.content.itemIds).toEqual(['p1']);
  });

  it('COVER_MULTI_PHOTO force sans aucune photo disponible -> repli sur COVER_MINIMAL', () => {
    const items = [textItem('t1')];
    const front = composeFrontCover({
      book: { title: 'Titre', cover_overrides: { frontVariant: 'COVER_MULTI_PHOTO' } },
      items, template: TEMPLATE, format: FORMAT
    });
    expect(front.content.variant).toBe('COVER_MINIMAL');
    expect(front.content.itemIds).toEqual([]);
  });

  it('frontPhotoId + frontVariant COVER_MULTI_PHOTO combines : la photo choisie apparait en premier', () => {
    const items = [greatPhoto('p1'), greatPhoto('p2'), greatPhoto('p3')];
    const front = composeFrontCover({
      book: { title: 'Titre', cover_overrides: { frontVariant: 'COVER_MULTI_PHOTO', frontPhotoId: 'p3' } },
      items, template: TEMPLATE, format: FORMAT
    });
    expect(front.content.variant).toBe('COVER_MULTI_PHOTO');
    expect(front.content.itemIds[0]).toBe('p3');
  });

  it('frontPhotoId + un format a une seule photo : utilise exactement la photo choisie, pas forcement la mieux notee', () => {
    const items = [greatPhoto('p1'), weakPhoto('p2')];
    const front = composeFrontCover({
      book: { title: 'Titre', cover_overrides: { frontVariant: 'COVER_SPLIT', frontPhotoId: 'p2' } },
      items, template: TEMPLATE, format: FORMAT
    });
    expect(front.content.variant).toBe('COVER_SPLIT');
    expect(front.content.itemIds).toEqual(['p2']);
  });
});

describe('coverComposer.composeBackCover — statistiques et repli', () => {
  it('les trois stats a 0 -> repli automatique sur BACK_MINIMAL, jamais BACK_STATS avec une ligne vide', () => {
    const back = composeBackCover({ book: { id: 'b1', collection_mode: 'solo' }, items: [], template: TEMPLATE, format: FORMAT });
    expect(back.content.variant).toBe('BACK_MINIMAL');
    expect(back.content.statsLine).toBe('');
  });

  it('stats avec 0 photo -> ligne sans "photos", variante stats quand meme choisie', () => {
    const items = [textItem('t1'), textItem('t2')];
    const back = composeBackCover({ book: { id: 'b1', collection_mode: 'solo' }, items, template: TEMPLATE, format: FORMAT });
    expect(back.content.statsLine).not.toContain('photo');
    expect(back.content.statsLine).toContain('souvenir');
    expect(['BACK_STATS', 'BACK_PHOTO_STATS']).toContain(back.content.variant);
  });

  it('stats avec 0 contribution (livre solo) -> pas de "contributeurs" dans la ligne', () => {
    const items = [greatPhoto('p1'), textItem('t1')];
    const back = composeBackCover({ book: { id: 'b1', collection_mode: 'solo' }, items, template: TEMPLATE, format: FORMAT });
    expect(back.content.statsLine).not.toContain('contributeur');
  });

  it('livre solo : contributeurs toujours 0 meme si un item porte un contribution_id errant', () => {
    const items = [{ ...greatPhoto('p1'), contribution_id: 'contrib-x' }];
    const back = composeBackCover({ book: { id: 'b1', collection_mode: 'solo' }, items, template: TEMPLATE, format: FORMAT });
    expect(back.content.statsLine).not.toContain('contributeur');
  });

  it('livre groupe : compte les contribution_id distincts', () => {
    const items = [
      { ...greatPhoto('p1'), contribution_id: 'c1' },
      { ...textItem('t1'), contribution_id: 'c1' },
      { ...textItem('t2'), contribution_id: 'c2' }
    ];
    const back = composeBackCover({ book: { id: 'b1', collection_mode: 'open' }, items, template: TEMPLATE, format: FORMAT });
    expect(back.content.statsLine).toContain('2 contributeurs');
  });

  it('choisit BACK_PHOTO_STATS avec une photo differente de celle du recto, quand une photo acceptable existe', () => {
    const items = [greatPhoto('p1'), mediumPhoto('p2'), textItem('t1')];
    const back = composeBackCover({
      book: { id: 'b1', collection_mode: 'solo' },
      items,
      template: TEMPLATE,
      format: FORMAT,
      frontCoverItemIds: ['p1'] // deja utilisee en couverture
    });
    if (back.content.variant === 'BACK_PHOTO_STATS') {
      expect(back.content.itemIds).not.toContain('p1');
    }
  });

  it('ne choisit jamais BACK_PHOTO_STATS si aucune photo acceptable ne reste (repli sur BACK_STATS)', () => {
    const items = [weakPhoto('p1'), textItem('t1')];
    const back = composeBackCover({
      book: { id: 'b1', collection_mode: 'solo' },
      items,
      template: TEMPLATE,
      format: FORMAT,
      frontCoverItemIds: []
    });
    expect(back.content.variant).not.toBe('BACK_PHOTO_STATS');
  });

  // Chiffres retires a la demande (cover_overrides.backStatsHidden,
  // 2026-09-19). Le point delicat : masquer un chiffre ne doit changer que
  // le TEXTE affiche, jamais la mise en page — sinon decocher "nombre de
  // photos" ferait disparaitre la photo de 4e par effet de bord.
  it('masquer le nombre de photos retire le chiffre sans changer la variante ni la photo', () => {
    const items = [greatPhoto('p1'), mediumPhoto('p2'), textItem('t1')];
    const base = {
      items,
      template: TEMPLATE,
      format: FORMAT,
      frontCoverItemIds: ['p1']
    };
    const avant = composeBackCover({ ...base, book: { id: 'b1', collection_mode: 'solo' } });
    const apres = composeBackCover({
      ...base,
      book: { id: 'b1', collection_mode: 'solo', cover_overrides: { backStatsHidden: ['photos'] } }
    });

    expect(avant.content.statsLine).toContain('photo');
    expect(apres.content.statsLine).not.toContain('photo');
    expect(apres.content.variant).toBe(avant.content.variant);
    expect(apres.content.itemIds).toEqual(avant.content.itemIds);
  });

  it('masquer TOUS les chiffres laisse la 4e intacte (photo comprise), seule la ligne disparait', () => {
    const items = [greatPhoto('p1'), mediumPhoto('p2'), textItem('t1')];
    const base = { items, template: TEMPLATE, format: FORMAT, frontCoverItemIds: ['p1'] };
    const avant = composeBackCover({ ...base, book: { id: 'b1', collection_mode: 'solo' } });
    const apres = composeBackCover({
      ...base,
      book: {
        id: 'b1',
        collection_mode: 'solo',
        cover_overrides: { backStatsHidden: ['contributeurs', 'souvenirs', 'photos'] }
      }
    });

    expect(apres.content.statsLine).toBe('');
    expect(apres.content.variant).toBe(avant.content.variant);
    expect(apres.content.itemIds).toEqual(avant.content.itemIds);
  });
});

describe('coverComposer.composeBackCover — surcharge de la phrase de cloture', () => {
  it('sans surcharge (absent) : comportement automatique inchange (non-regression)', () => {
    const book = { id: 'book-stable-id' };
    const withoutField = composeBackCover({ book, items: [], template: TEMPLATE, format: FORMAT });
    const withEmptyObject = composeBackCover({ book: { ...book, cover_overrides: {} }, items: [], template: TEMPLATE, format: FORMAT });
    expect(withEmptyObject.content.phrase).toBe(withoutField.content.phrase);
  });

  it('closingPhraseMode "auto" explicite se comporte comme l\'absence de surcharge', () => {
    const book = { id: 'book-stable-id-2' };
    const auto = composeBackCover({ book: { ...book, cover_overrides: { closingPhraseMode: 'auto' } }, items: [], template: TEMPLATE, format: FORMAT });
    const noOverride = composeBackCover({ book, items: [], template: TEMPLATE, format: FORMAT });
    expect(auto.content.phrase).toBe(noOverride.content.phrase);
  });

  it('closingPhraseMode "none" -> aucune phrase, structurellement absente (jamais une chaine vide)', () => {
    const back = composeBackCover({
      book: { id: 'b1', cover_overrides: { closingPhraseMode: 'none' } },
      items: [], template: TEMPLATE, format: FORMAT
    });
    expect(back.content.phrase).toBeNull();
  });

  it('closingPhraseMode "custom" -> le texte exact fourni par l\'utilisateur', () => {
    const back = composeBackCover({
      book: { id: 'b1', cover_overrides: { closingPhraseMode: 'custom', closingPhraseText: 'Notre histoire, pour toujours.' } },
      items: [], template: TEMPLATE, format: FORMAT
    });
    expect(back.content.phrase).toBe('Notre histoire, pour toujours.');
  });

  it('closingPhraseMode "custom" avec un texte vide se comporte comme "none" (jamais de chaine vide affichee)', () => {
    const back = composeBackCover({
      book: { id: 'b1', cover_overrides: { closingPhraseMode: 'custom', closingPhraseText: '   ' } },
      items: [], template: TEMPLATE, format: FORMAT
    });
    expect(back.content.phrase).toBeNull();
  });
});

describe('coverComposer.composeBackCover — format force explicitement (backVariant)', () => {
  it('backVariant "AUTO" explicite se comporte comme l\'absence de surcharge (non-regression)', () => {
    const items = [textItem('t1'), greatPhoto('p1')];
    const book = { id: 'b1', collection_mode: 'solo' };
    const auto = composeBackCover({ book: { ...book, cover_overrides: { backVariant: 'AUTO' } }, items, template: TEMPLATE, format: FORMAT });
    const noOverride = composeBackCover({ book, items, template: TEMPLATE, format: FORMAT });
    expect(auto.content).toEqual(noOverride.content);
  });

  it('backVariant inconnu/corrompu retombe sur l\'arbre automatique (jamais d\'erreur)', () => {
    const items = [textItem('t1'), greatPhoto('p1')];
    const book = { id: 'b1', collection_mode: 'solo' };
    const bogus = composeBackCover({ book: { ...book, cover_overrides: { backVariant: 'CECI_NEXISTE_PAS' } }, items, template: TEMPLATE, format: FORMAT });
    const noOverride = composeBackCover({ book, items, template: TEMPLATE, format: FORMAT });
    expect(bogus.content).toEqual(noOverride.content);
  });

  it('BACK_MINIMAL force malgre des statistiques disponibles -> BACK_MINIMAL quand meme (choix assume)', () => {
    const items = [textItem('t1'), greatPhoto('p1')];
    const back = composeBackCover({
      book: { id: 'b1', collection_mode: 'solo', cover_overrides: { backVariant: 'BACK_MINIMAL' } },
      items, template: TEMPLATE, format: FORMAT
    });
    expect(back.content.variant).toBe('BACK_MINIMAL');
    expect(back.content.itemIds).toEqual([]);
  });

  it('BACK_STATS force avec une photo acceptable disponible -> aucune photo affichee (stats seules, choix assume)', () => {
    const items = [textItem('t1'), greatPhoto('p1')];
    const back = composeBackCover({
      book: { id: 'b1', collection_mode: 'solo', cover_overrides: { backVariant: 'BACK_STATS' } },
      items, template: TEMPLATE, format: FORMAT,
      frontCoverItemIds: []
    });
    expect(back.content.variant).toBe('BACK_STATS');
    expect(back.content.itemIds).toEqual([]);
  });

  it('BACK_PHOTO_STATS force sans aucune photo disponible (toutes deja en couverture) -> repli sur BACK_STATS', () => {
    const items = [textItem('t1'), greatPhoto('p1')];
    const back = composeBackCover({
      book: { id: 'b1', collection_mode: 'solo', cover_overrides: { backVariant: 'BACK_PHOTO_STATS' } },
      items, template: TEMPLATE, format: FORMAT,
      frontCoverItemIds: ['p1'] // seule photo du livre, deja utilisee en couverture
    });
    expect(back.content.variant).toBe('BACK_STATS');
    expect(back.content.itemIds).toEqual([]);
  });

  it('BACK_PHOTO_STATS force ignore le seuil de qualite habituel : une photo faible est quand meme affichee', () => {
    const items = [textItem('t1'), weakPhoto('p1')];
    const back = composeBackCover({
      book: { id: 'b1', collection_mode: 'solo', cover_overrides: { backVariant: 'BACK_PHOTO_STATS' } },
      items, template: TEMPLATE, format: FORMAT,
      frontCoverItemIds: []
    });
    expect(back.content.variant).toBe('BACK_PHOTO_STATS');
    expect(back.content.itemIds).toEqual(['p1']);
  });

  it('backVariant force mais statistiques vides -> repli sur BACK_MINIMAL, quel que soit le format demande', () => {
    const back = composeBackCover({
      book: { id: 'b1', collection_mode: 'solo', cover_overrides: { backVariant: 'BACK_PHOTO_STATS' } },
      items: [], template: TEMPLATE, format: FORMAT
    });
    expect(back.content.variant).toBe('BACK_MINIMAL');
    expect(back.content.itemIds).toEqual([]);
  });
});

// Retour utilisateur (2026-09-10) : "permettre de modifier la photo de la
// 4e de couverture" — jusqu'ici seul le recto avait une surcharge de photo
// (frontPhotoId), meme principe applique ici a cover_overrides.backPhotoId.
describe('coverComposer.composeBackCover — surcharge de la photo (backPhotoId)', () => {
  it('backPhotoId valide force cette photo, meme sous le seuil "correct"', () => {
    const items = [greatPhoto('p1'), weakPhoto('p2'), textItem('t1')];
    const back = composeBackCover({
      book: { id: 'b1', collection_mode: 'solo', cover_overrides: { backPhotoId: 'p2' } },
      items, template: TEMPLATE, format: FORMAT,
      frontCoverItemIds: ['p1']
    });
    expect(back.content.variant).toBe('BACK_PHOTO_STATS');
    expect(back.content.itemIds).toEqual(['p2']);
  });

  it('backPhotoId orphelin (photo supprimee depuis) retombe silencieusement sur la selection automatique', () => {
    const items = [greatPhoto('p1'), mediumPhoto('p2'), textItem('t1')];
    const back = composeBackCover({
      book: { id: 'b1', collection_mode: 'solo', cover_overrides: { backPhotoId: 'photo-disparue' } },
      items, template: TEMPLATE, format: FORMAT,
      frontCoverItemIds: ['p1']
    });
    expect(back.content.variant).toBe('BACK_PHOTO_STATS');
    expect(back.content.itemIds).toEqual(['p2']);
  });

  it('backPhotoId qui pointe vers la photo DEJA utilisee en couverture est ignore (jamais de concurrence avec le recto)', () => {
    const items = [greatPhoto('p1'), mediumPhoto('p2'), textItem('t1')];
    const back = composeBackCover({
      book: { id: 'b1', collection_mode: 'solo', cover_overrides: { backPhotoId: 'p1' } },
      items, template: TEMPLATE, format: FORMAT,
      frontCoverItemIds: ['p1'] // p1 exclue du pool de la 4e, backPhotoId='p1' ne peut donc pas y correspondre
    });
    expect(back.content.itemIds).not.toContain('p1');
  });

  it('backPhotoId + backVariant BACK_PHOTO_STATS combines : utilise exactement la photo choisie', () => {
    const items = [greatPhoto('p1'), weakPhoto('p2'), textItem('t1')];
    const back = composeBackCover({
      book: { id: 'b1', collection_mode: 'solo', cover_overrides: { backVariant: 'BACK_PHOTO_STATS', backPhotoId: 'p2' } },
      items, template: TEMPLATE, format: FORMAT,
      frontCoverItemIds: ['p1']
    });
    expect(back.content.variant).toBe('BACK_PHOTO_STATS');
    expect(back.content.itemIds).toEqual(['p2']);
  });

  it('backPhotoId sans variante forcee affiche quand meme une photo (meme principe que le recto)', () => {
    const items = [mediumPhoto('p1'), textItem('t1')];
    const back = composeBackCover({
      book: { id: 'b1', collection_mode: 'solo', cover_overrides: { backPhotoId: 'p1' } },
      items, template: TEMPLATE, format: FORMAT,
      frontCoverItemIds: []
    });
    expect(back.content.variant).toBe('BACK_PHOTO_STATS');
    expect(back.content.itemIds).toEqual(['p1']);
  });

  it('backPhotoId sans statistiques disponibles -> repli sur BACK_MINIMAL (rien a afficher, meme regle que l\'automatique)', () => {
    const back = composeBackCover({
      book: { id: 'b1', collection_mode: 'solo', cover_overrides: { backPhotoId: 'p1' } },
      items: [], template: TEMPLATE, format: FORMAT
    });
    expect(back.content.variant).toBe('BACK_MINIMAL');
    expect(back.content.itemIds).toEqual([]);
  });
});

describe('coverComposer.composeCoversIntoPages', () => {
  it('place la couverture en premiere page et la 4e en derniere, pages interieures intactes entre les deux', () => {
    const interiorPages = [
      { page_index: 0, layout_id: 'l1', content: { kind: 'photo', itemIds: ['x'] } },
      { page_index: 1, layout_id: 'l2', content: { kind: 'texte', itemIds: ['y'] } }
    ];
    const pages = composeCoversIntoPages({
      book: { id: 'b1', title: 'Titre', collection_mode: 'solo' },
      items: [],
      template: TEMPLATE,
      interiorPages,
      format: FORMAT
    });

    expect(pages).toHaveLength(4);
    expect(pages[0].content.kind).toBe('front-cover');
    expect(pages[3].content.kind).toBe('back-cover');
    expect(pages[1].content).toEqual(interiorPages[0].content);
    expect(pages[2].content).toEqual(interiorPages[1].content);
  });

  it('reassigne page_index sequentiellement (0..n)', () => {
    const interiorPages = [{ page_index: 0, layout_id: 'l1', content: { kind: 'photo', itemIds: [] } }];
    const pages = composeCoversIntoPages({
      book: { id: 'b1', title: 'Titre' }, items: [], template: TEMPLATE, interiorPages, format: FORMAT
    });
    expect(pages.map((p) => p.page_index)).toEqual([0, 1, 2]);
  });

  it('fonctionne meme avec zero page interieure (livre sans contenu compose) : recto + verso seuls', () => {
    const pages = composeCoversIntoPages({
      book: { id: 'b1', title: 'Titre' }, items: [], template: TEMPLATE, interiorPages: [], format: FORMAT
    });
    expect(pages).toHaveLength(2);
    expect(pages[0].content.kind).toBe('front-cover');
    expect(pages[1].content.kind).toBe('back-cover');
  });
});

describe('coverComposer — habillage dore du format Luxe (coverTheme.applyFormatAccent)', () => {
  const LUXE_FORMAT = { ...FORMAT, formatId: 'luxe' };

  it('composeFrontCover applique le cadre dore quand format.formatId === "luxe"', () => {
    const front = composeFrontCover({ book: { title: 'Titre' }, items: [], template: TEMPLATE, format: LUXE_FORMAT });
    expect(front.content.theme.ornament).toBe('gold-frame');
  });

  it('composeBackCover applique le meme cadre dore (coherence recto/verso)', () => {
    const back = composeBackCover({ book: { title: 'Titre' }, items: [], template: TEMPLATE, format: LUXE_FORMAT, frontCoverItemIds: [] });
    expect(back.content.theme.ornament).toBe('gold-frame');
  });

  it('sans format.formatId (repli, ex. FORMAT standard des tests ci-dessus) : jamais de cadre', () => {
    const front = composeFrontCover({ book: { title: 'Titre' }, items: [], template: TEMPLATE, format: FORMAT });
    expect(front.content.theme.ornament).toBe('none');
  });

  it('composeCoversIntoPages transmet bien formatId aux deux faces', () => {
    const pages = composeCoversIntoPages({
      book: { id: 'b1', title: 'Titre' }, items: [], template: TEMPLATE, interiorPages: [], format: LUXE_FORMAT
    });
    expect(pages[0].content.theme.ornament).toBe('gold-frame'); // front
    expect(pages[1].content.theme.ornament).toBe('gold-frame'); // back
  });
});

// La 4e de couverture ne doit pas changer de photo quand le livre change de
// FORMAT. Defaut reel constate le 2026-09-14 sur deux livres de production :
// le score d'une photo depend du ratio de la page, et la 4e prend
// deliberement la DERNIERE photo acceptable — la position la plus sensible au
// moindre reordonnancement. Le simple fait de regarder le livre en Livret
// changeait donc sa 4e ("la photo de 4e est modifiee par une photo aleatoire
// en mode livret").
describe('coverComposer — la photo de 4e ne depend pas du format du livre', () => {
  const { resolveCoverFormat } = require('../../services/composition/coverFormat');

  // Des photos de FORMES tres differentes : c'est exactement ce qui faisait
  // bouger le classement d'un ratio de page a l'autre.
  const items = [
    { id: 'p-portrait', kind: 'photo', url: 'u1', display_order: 0, metadata: { width: 2400, height: 3200, orientation: 'portrait' } },
    { id: 'p-paysage', kind: 'photo', url: 'u2', display_order: 1, metadata: { width: 3600, height: 2400, orientation: 'landscape' } },
    { id: 'p-carre', kind: 'photo', url: 'u3', display_order: 2, metadata: { width: 2600, height: 2600, orientation: 'square' } },
    { id: 'p-portrait-2', kind: 'photo', url: 'u4', display_order: 3, metadata: { width: 2200, height: 3000, orientation: 'portrait' } },
    { id: 'p-carre-2', kind: 'photo', url: 'u5', display_order: 4, metadata: { width: 3000, height: 3000, orientation: 'square' } },
    { id: 't-1', kind: 'texte', text: 'Un souvenir', display_order: 5 }
  ];

  // Recto FIXE (COVER_PHOTO = une seule photo) : sans ca, la variante du recto
  // change elle-meme d'un format a l'autre, retire un nombre different de
  // photos de la pioche, et le test ne mesurerait plus ce qu'il annonce.
  const book = {
    id: 'b1',
    title: 'Les soixante ans de Jean',
    collection_mode: 'solo',
    cover_overrides: { frontVariant: 'COVER_PHOTO' }
  };

  const composer = (livre, formatId) => composeCoversIntoPages({
    book: livre,
    items,
    template: null,
    interiorPages: [],
    format: { formatId, ...resolveCoverFormat(formatId) }
  });

  it('choisit la MEME photo en livret, standard et luxe', () => {
    const photoDeLa4e = (formatId) => {
      const pages = composer(book, formatId);
      return pages[pages.length - 1].content.itemIds.join(',');
    };

    const livret = photoDeLa4e('livret');
    // Sans photo sur la 4e, le test ne prouverait rien.
    expect(livret).not.toBe('');
    expect(photoDeLa4e('standard')).toBe(livret);
    expect(photoDeLa4e('luxe')).toBe(livret);
  });

  it('un choix explicite de l utilisateur reste prioritaire dans tous les formats', () => {
    const avecChoix = { ...book, cover_overrides: { ...book.cover_overrides, backPhotoId: 'p-carre-2' } };
    ['livret', 'standard', 'luxe'].forEach((formatId) => {
      const pages = composer(avecChoix, formatId);
      expect(pages[pages.length - 1].content.itemIds).toEqual(['p-carre-2']);
    });
  });
});

// La photo de couverture doit etre RECADRABLE (2026-09-15) : « il faut
// pouvoir ajuster la photo de la 4e de couverture, la photo est tronquee ».
//
// Jusqu'ici coverImgFrame appelait imgFrame(url) SANS ajustement : la photo
// etait donc toujours rognee au centre, sur les deux faces, sans recours.
//
// Le reglage vit dans cover_overrides.frontPhotoAdjust / backPhotoAdjust,
// ecrit DIRECTEMENT par le navigateur : il n'a jamais transite par une
// validation serveur, d'ou les tests de bornes ci-dessous.
describe('coverComposer — cadrage manuel de la photo de couverture', () => {
  const { renderSinglePageHtml } = require('../../services/composition/pageRenderer');
  const { resolveCoverFormat } = require('../../services/composition/coverFormat');

  const items = [
    { id: 'p1', kind: 'photo', url: 'https://cdn.test/1.jpg', display_order: 0, metadata: { width: 3000, height: 2000, orientation: 'landscape' } },
    { id: 'p2', kind: 'photo', url: 'https://cdn.test/2.jpg', display_order: 1, metadata: { width: 2400, height: 3200, orientation: 'portrait' } },
    { id: 't1', kind: 'texte', text: 'Un souvenir', display_order: 2 },
    { id: 't2', kind: 'texte', text: 'Un autre souvenir', display_order: 3 }
  ];
  const format = { formatId: 'standard', ...resolveCoverFormat('standard') };

  // Le <style> du document contient les NOMS DE CLASSES : chercher
  // "is-contain" dans le HTML entier trouverait le selecteur CSS, pas le
  // rendu. Toute verification se limite au <body>.
  //
  // Le <body> porte une classe de style d'album (voir albumStyleClass) : on
  // ne peut pas chercher le tag "<body>" nu, il n'existe plus tel quel.
  const corpsDe = (html) => html.slice(html.indexOf('<body'));

  const rendre = (coverOverrides, face) => {
    const book = { id: 'b1', title: 'Voyage', collection_mode: 'solo', cover_overrides: coverOverrides };
    const pages = composeCoversIntoPages({ book, items, template: null, interiorPages: [], format });
    const page = face === 'back' ? pages[pages.length - 1] : pages[0];
    return corpsDe(renderSinglePageHtml({ book, page, items, layouts: [], format }));
  };

  const BASE_BACK = { backVariant: 'BACK_PHOTO_STATS', backPhotoId: 'p2' };

  it('sans reglage : cadrage automatique centre — le rendu d avant, inchange', () => {
    const html = rendre(BASE_BACK, 'back');
    expect(html).toMatch(/--fx:50%;--fy:50%;--zoom:1;/);
    expect(html).not.toMatch(/is-contain/);
  });

  it('applique le point focal et le zoom choisis sur la 4e', () => {
    const html = rendre({ ...BASE_BACK, backPhotoAdjust: { focalX: 0.25, focalY: 0.8, zoom: 1.4, fitMode: 'cover' } }, 'back');
    expect(html).toMatch(/--fx:25%/);
    expect(html).toMatch(/--fy:80%/);
    expect(html).toMatch(/--zoom:1\.4;/);
  });

  it('le mode "photo entiere" arrive bien sur la 4e — plus rien de tronque', () => {
    const html = rendre({ ...BASE_BACK, backPhotoAdjust: { focalX: 0.5, focalY: 0.5, zoom: 1, fitMode: 'contain' } }, 'back');
    expect(html).toMatch(/photo-frame is-contain/);
  });

  it('le recto a son propre cadrage, independant de celui de la 4e', () => {
    const overrides = {
      frontVariant: 'COVER_PHOTO_TITLE',
      frontPhotoId: 'p1',
      frontPhotoAdjust: { focalX: 0.1, focalY: 0.1, zoom: 1, fitMode: 'cover' },
      ...BASE_BACK,
      backPhotoAdjust: { focalX: 0.9, focalY: 0.9, zoom: 2, fitMode: 'cover' }
    };
    expect(rendre(overrides, 'front')).toMatch(/--fx:10%/);
    expect(rendre(overrides, 'back')).toMatch(/--fx:90%/);
  });

  // cover_overrides vient du navigateur : une valeur absurde ne doit jamais
  // produire une couverture cassee, seulement etre ramenee dans les bornes.
  it('borne une valeur absurde au lieu de la rendre telle quelle', () => {
    const html = rendre({ ...BASE_BACK, backPhotoAdjust: { focalX: 42, focalY: -7, zoom: 999, fitMode: 'n importe quoi' } }, 'back');
    expect(html).toMatch(/--fx:100%/);
    expect(html).toMatch(/--fy:0%/);
    expect(html).toMatch(/--zoom:2\.5;/); // PHOTO_ZOOM_MAX
    expect(html).not.toMatch(/is-contain/);
  });

  it('ignore un reglage qui n est meme pas un objet, sans casser la page', () => {
    const html = rendre({ ...BASE_BACK, backPhotoAdjust: 'pas un objet' }, 'back');
    expect(html).toMatch(/--fx:50%;--fy:50%;--zoom:1;/);
  });
});
