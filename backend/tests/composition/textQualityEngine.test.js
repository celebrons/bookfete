// Controle qualite des textes avant impression (§19). Pendant de
// photoQualityEngine.test.js : memes 3 statuts, meme exigence de ne JAMAIS
// produire un faux avertissement quand la donnee manque.

const engine = require('../../services/composition/textQualityEngine');

const baseArgs = {
  layoutSlug: 'ONE_TESTIMONY',
  slotIndex: 0,
  formatId: 'standard'
};

describe('textQualityEngine — verdicts', () => {
  it('un texte court dans un grand emplacement est ok', () => {
    const result = engine.checkTextFit({ ...baseArgs, text: 'Un souvenir tres court.', role: 'body' });
    expect(result.statut).toBe('ok');
    expect(result.severity).toBe('ok');
    expect(result.reasons).toHaveLength(0);
  });

  it('un texte demesure est signale comme insuffisant, avec le debordement chiffre', () => {
    const result = engine.checkTextFit({ ...baseArgs, text: 'mot '.repeat(3000), role: 'body' });
    expect(result.statut).toBe('insuffisant');
    expect(result.severity).toBe('error');
    expect(result.overflowMm).toBeGreaterThan(0);
    expect(result.reasons.join(' ')).toMatch(/depasse/i);
  });

  it('un texte reduit automatiquement est signale en "limite", pas en erreur', () => {
    // Assez long pour forcer une reduction dans la plage, sans deborder.
    const result = engine.checkTextFit({
      ...baseArgs, layoutSlug: 'PHOTO_TEXT', text: 'mot '.repeat(120), role: 'body'
    });
    expect(['limite', 'ok']).toContain(result.statut);
    if (result.statut === 'limite') {
      expect(result.severity).toBe('warning');
    }
  });

  it('ne prononce AUCUN verdict sur un layout inconnu (jamais un faux avertissement)', () => {
    const result = engine.checkTextFit({ ...baseArgs, layoutSlug: 'LAYOUT-QUI-NEXISTE-PAS', text: 'bonjour', role: 'body' });
    expect(result).toBeNull();
  });

  it('le role par defaut suit la hierarchie editoriale du layout (§14)', () => {
    expect(engine.defaultRoleForSlot('PHOTO_WITH_CAPTION', 0)).toBe('caption');
    expect(engine.defaultRoleForSlot('TITLE_TEXT', 0)).toBe('title');
    expect(engine.defaultRoleForSlot('TITLE_TEXT', 1)).toBe('body');
    expect(engine.defaultRoleForSlot('ONE_TESTIMONY', 0)).toBe('quote');
  });
});

describe('textQualityEngine — le format change le verdict (§15)', () => {
  it('un meme texte peut tenir dans un format et deborder dans un autre', () => {
    // 400 mots : la bascule REELLE mesuree sur ces reglages (en dessous, les
    // 3 formats absorbent le texte sans broncher). Si ce seuil devait changer,
    // c'est le signe que les echelles ont bouge — pas qu'il faut gonfler le
    // chiffre jusqu'a ce que le test passe.
    const text = 'mot '.repeat(400);
    const verdicts = ['livret', 'standard', 'luxe'].map((formatId) => (
      engine.checkTextFit({ ...baseArgs, formatId, text, role: 'body' }).statut
    ));
    // Luxe est le plus genereux en typographie et le plus etroit en colonne :
    // c'est donc lui qui deborde en premier. Si ces trois verdicts devenaient
    // identiques, c'est que le format ne recompose plus rien.
    expect(new Set(verdicts).size).toBeGreaterThan(1);
  });
});

describe('textQualityEngine — marges de securite (§19)', () => {
  it('signale un texte trop pres du bord', () => {
    const result = engine.checkSafeArea({ edgeMm: 3, bindingMm: 30 });
    expect(result.ok).toBe(false);
    expect(result.problems.join(' ')).toMatch(/bord/);
  });

  it('signale un texte trop pres de la reliure, qui exige plus de marge que le bord', () => {
    const result = engine.checkSafeArea({ edgeMm: 20, bindingMm: 10 });
    expect(result.ok).toBe(false);
    expect(result.problems.join(' ')).toMatch(/reliure/);
    expect(engine.SAFE_BINDING_MM).toBeGreaterThan(engine.SAFE_EDGE_MM);
  });

  it('ne dit rien quand les distances sont confortables', () => {
    expect(engine.checkSafeArea({ edgeMm: 20, bindingMm: 30 }).ok).toBe(true);
  });
});

describe('textQualityEngine — annotation d\'une page', () => {
  const layouts = [{ id: 'L1', slug: 'TITLE_TEXT' }];
  const items = [
    { id: 'i-titre', kind: 'texte', text: 'Notre histoire' },
    { id: 'i-corps', kind: 'texte', text: 'Un texte de longueur raisonnable pour cette page.' },
    { id: 'i-photo', kind: 'photo', url: 'http://exemple/p.jpg' }
  ];

  it('annote chaque texte de la page et ignore les photos', () => {
    const page = { layout_id: 'L1', content: { itemIds: ['i-titre', 'i-corps', 'i-photo'] } };
    const [annotated] = engine.annotatePagesWithTextFit({
      pages: [page], items, layouts, formatId: 'standard'
    });

    expect(Object.keys(annotated.content.textFit).sort()).toEqual(['i-corps', 'i-titre']);
    expect(annotated.content.textFit['i-titre'].role).toBe('title');
    expect(annotated.content.textFit['i-corps'].role).toBe('body');
  });

  it('preserve le reste de content (annotation jamais destructive)', () => {
    const page = {
      layout_id: 'L1',
      content: { itemIds: ['i-titre'], photoFit: { garde: true }, blocks: [{ kind: 'mixte' }] }
    };
    const [annotated] = engine.annotatePagesWithTextFit({
      pages: [page], items, layouts, formatId: 'standard'
    });

    expect(annotated.content.photoFit).toEqual({ garde: true });
    expect(annotated.content.blocks).toEqual([{ kind: 'mixte' }]);
  });

  it("respecte le role choisi par l'utilisateur quand il y en a un", () => {
    const page = {
      layout_id: 'L1',
      content: { itemIds: ['i-titre'], textRoles: { 'i-titre': 'quote' } }
    };
    const [annotated] = engine.annotatePagesWithTextFit({
      pages: [page], items, layouts, formatId: 'standard'
    });
    expect(annotated.content.textFit['i-titre'].role).toBe('quote');
  });

  it('un emplacement vide (itemId null) ne produit aucune annotation', () => {
    const page = { layout_id: 'L1', content: { itemIds: [null, 'i-corps'] } };
    const [annotated] = engine.annotatePagesWithTextFit({
      pages: [page], items, layouts, formatId: 'standard'
    });
    expect(Object.keys(annotated.content.textFit)).toEqual(['i-corps']);
  });
});
