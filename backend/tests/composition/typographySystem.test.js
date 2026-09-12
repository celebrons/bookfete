// Tests du systeme typographique (cahier des charges "Systeme typographique
// et gestion des textes", §20 — la liste des cas a couvrir y est explicite :
// titre court, titre tres long, texte court, texte long, citation, changement
// de format/taille/couleur/alignement, texte sur fond clair et sombre,
// debordement, coherence Preview/PDF).
//
// Ces tests portent sur des fonctions PURES : c'est precisement ce qui rend
// la coherence apercu/PDF verifiable, puisque les deux consomment ces memes
// fonctions (§18).

const typography = require('../../services/composition/typographySystem');

const FORMATS = ['livret', 'standard', 'luxe'];

describe('typographySystem — roles (§3)', () => {
  it('expose exactement les 5 roles du cahier des charges', () => {
    expect(typography.TEXT_ROLES).toEqual(['title', 'subtitle', 'body', 'caption', 'quote']);
  });

  it('un role inconnu retombe sur body plutot que de casser le rendu', () => {
    expect(typography.normalizeRole('h1')).toBe('body');
    expect(typography.normalizeRole(null)).toBe('body');
    expect(typography.normalizeRole('TITLE')).toBe('title');
  });

  it('chaque role determine police, graisse, interligne et couleur (§3)', () => {
    typography.TEXT_ROLES.forEach((role) => {
      const style = typography.resolveRoleStyle(role, 'standard');
      expect(style.fontFamily).toBeTruthy();
      expect(style.fontWeight).toBeGreaterThan(0);
      expect(style.lineHeight).toBeGreaterThan(1);
      expect(style.color).toMatch(/^#[0-9a-f]{6}$/i);
    });
  });
});

describe('typographySystem — echelles (§10)', () => {
  // Les bornes sont donnees noir sur blanc dans le cahier des charges :
  // les figer ici evite qu'un ajustement les fasse deriver sans decision.
  const EXPECTED_RANGES = {
    title: [28, 36],
    subtitle: [12, 16],
    body: [10, 12],
    caption: [8, 10],
    quote: [18, 26]
  };

  Object.entries(EXPECTED_RANGES).forEach(([role, [min, max]]) => {
    it(`${role} reste dans sa plage ${min}-${max} pt sur les 3 formats`, () => {
      FORMATS.forEach((formatId) => {
        const style = typography.resolveRoleStyle(role, formatId);
        expect(style.fontSizePt).toBeGreaterThanOrEqual(min);
        expect(style.fontSizePt).toBeLessThanOrEqual(max);
      });
    });
  });

  it('une taille demandee hors plage est ramenee dans les bornes, jamais refusee', () => {
    const tooBig = typography.resolveRoleStyle('body', 'standard', { sizePt: 40 });
    const tooSmall = typography.resolveRoleStyle('body', 'standard', { sizePt: 2 });
    expect(tooBig.fontSizePt).toBe(12);
    expect(tooSmall.fontSizePt).toBe(10);
  });
});

describe('typographySystem — le format recompose, il ne met pas a l\'echelle (§15)', () => {
  it('les 3 formats donnent 3 tailles DIFFERENTES pour chaque role', () => {
    typography.TEXT_ROLES.forEach((role) => {
      const sizes = FORMATS.map((f) => typography.resolveRoleStyle(role, f).fontSizePt);
      expect(new Set(sizes).size).toBe(3);
    });
  });

  it('livret est le plus compact, luxe le plus genereux', () => {
    typography.TEXT_ROLES.forEach((role) => {
      const [livret, standard, luxe] = FORMATS.map((f) => typography.resolveRoleStyle(role, f));
      expect(livret.fontSizePt).toBeLessThan(standard.fontSizePt);
      expect(standard.fontSizePt).toBeLessThan(luxe.fontSizePt);
      expect(livret.lineHeight).toBeLessThan(luxe.lineHeight);
    });
  });

  it("le format change AUSSI la largeur de colonne, pas seulement la taille — c'est ce qui distingue une recomposition d'un simple zoom", () => {
    const measures = FORMATS.map((f) => typography.resolveRoleStyle('body', f).measureRatio);
    expect(new Set(measures).size).toBe(3);
    // Luxe resserre la colonne pour gagner du blanc (§12).
    expect(measures[2]).toBeLessThan(measures[0]);
  });

  it('un titre n\'est PAS soumis a la mesure de lecture (il occupe toute la largeur)', () => {
    FORMATS.forEach((f) => {
      expect(typography.resolveRoleStyle('title', f).measureRatio).toBe(1);
    });
  });
});

describe('typographySystem — adaptation automatique du texte (§9)', () => {
  const SLOT = { slotWidthMm: 180, slotHeightMm: 60 };

  it('un titre court tient a la taille naturelle du format', () => {
    FORMATS.forEach((formatId) => {
      const fit = typography.fitTextToSlot({ text: 'Notre mariage', role: 'title', formatId, ...SLOT });
      expect(fit.status).toBe('ok');
      expect(fit.fontSizePt).toBe(typography.baseSizePt('title', formatId));
    });
  });

  it("le titre tres long de l'exemple du cahier des charges tient encore, quitte a etre reduit", () => {
    const long = 'Le jour ou nous avons celebre notre amour avec toutes les personnes qui comptent pour nous';
    FORMATS.forEach((formatId) => {
      const fit = typography.fitTextToSlot({ text: long, role: 'title', formatId, ...SLOT });
      expect(['ok', 'reduced']).toContain(fit.status);
      // Jamais en dessous de la borne du role : reduire a l'infini
      // produirait un titre illisible plutot qu'une alerte.
      expect(fit.fontSizePt).toBeGreaterThanOrEqual(28);
    });
  });

  it('la reduction se fait DANS la plage du role, jamais en dessous', () => {
    const enorme = 'mot '.repeat(400);
    const fit = typography.fitTextToSlot({ text: enorme, role: 'title', formatId: 'standard', ...SLOT });
    expect(fit.status).toBe('overflow');
    expect(fit.fontSizePt).toBe(28);
  });

  it('un debordement est SIGNALE, jamais tronque silencieusement', () => {
    const enorme = 'mot '.repeat(400);
    const fit = typography.fitTextToSlot({ text: enorme, role: 'body', formatId: 'standard', slotWidthMm: 80, slotHeightMm: 30 });
    expect(fit.status).toBe('overflow');
    expect(fit.overflowMm).toBeGreaterThan(0);
    // Le texte reste entierement rendu : rien dans le resultat ne coupe le
    // contenu, c'est l'alerte qui porte le probleme.
    expect(fit).not.toHaveProperty('truncatedText');
  });

  it('un texte vide ne declenche aucune alerte', () => {
    const fit = typography.fitTextToSlot({ text: '   ', role: 'body', formatId: 'standard', ...SLOT });
    expect(fit.status).toBe('ok');
    expect(fit.lines).toBe(0);
  });

  it('chaque paragraphe est habille separement (deux lignes courtes ne fusionnent pas)', () => {
    const lines = typography.estimateLineCount('court\nautre court', 200, 10, 'sans');
    expect(lines).toBe(2);
  });

  it('une citation dispose de sa propre plage, plus grande que le corps de texte', () => {
    const quote = typography.resolveRoleStyle('quote', 'standard');
    const body = typography.resolveRoleStyle('body', 'standard');
    expect(quote.fontSizePt).toBeGreaterThan(body.fontSizePt);
    expect(quote.fontStyle).toBe('italic');
  });
});

describe('typographySystem — palette controlee (§5)', () => {
  it("n'expose qu'une liste fermee de couleurs, jamais un choix libre", () => {
    const tokens = Object.keys(typography.TEXT_COLORS);
    expect(tokens).toEqual(
      expect.arrayContaining(['ink', 'graphite', 'softGrey', 'white', 'ivory', 'beige', 'taupe', 'accent'])
    );
    expect(tokens).toHaveLength(8);
  });

  it("l'or n'est proposable que pour un detail, jamais pour un titre ou un corps de texte", () => {
    const forTitle = typography.selectableColorsForRole('title').map((c) => c.token);
    const forBody = typography.selectableColorsForRole('body').map((c) => c.token);
    const forCaption = typography.selectableColorsForRole('caption').map((c) => c.token);

    expect(forTitle).not.toContain('accent');
    expect(forBody).not.toContain('accent');
    expect(forCaption).toContain('accent');
  });

  // Retour utilisateur 2026-09-11 : "les couleurs proches du blanc
  // n'apparaissent pas". Elles ne doivent PAS apparaitre sur le papier :
  // proposer un texte blanc sur une page ivoire, c'est laisser ecrire un
  // texte invisible a l'impression.
  it('ecarte les couleurs illisibles sur le papier (blanc, ivoire, beige)', () => {
    const proposees = typography.selectableColorsForRole('body').map((c) => c.token);
    expect(proposees).not.toContain('white');
    expect(proposees).not.toContain('ivory');
    expect(proposees).not.toContain('beige');
    expect(proposees).toEqual(expect.arrayContaining(['ink', 'graphite', 'softGrey']));
  });

  it('ces memes couleurs claires REDEVIENNENT proposees sur un fond sombre (texte sur photo)', () => {
    const surPhoto = typography.selectableColorsForRole('body', { backgroundHex: '#2a2a2a' }).map((c) => c.token);
    expect(surPhoto).toEqual(expect.arrayContaining(['white', 'ivory', 'beige']));
    // ... et les teintes sombres disparaissent, symetriquement.
    expect(surPhoto).not.toContain('ink');
  });

  it("l'or de TEXTE est assez sombre pour rester lisible sur le papier", () => {
    // L'or decoratif du theme (#c9a35f) tombe a 2.3:1 en texte : superbe en
    // aplat, illisible en lettres. Cette garantie evite de le reintroduire.
    const ratio = typography.contrastRatio(typography.TEXT_COLORS.accent.hex, typography.PAGE_PAPER_HEX);
    expect(ratio).toBeGreaterThanOrEqual(typography.PALETTE_MIN_CONTRAST);
    expect(typography.selectableColorsForRole('caption').map((c) => c.token)).toContain('accent');
  });

  it('une couleur inconnue retombe sur la couleur par defaut', () => {
    expect(typography.resolveTextColor('rose-fluo')).toBe(typography.TEXT_COLORS.ink.hex);
  });

  it('un changement de couleur dans la palette est respecte', () => {
    const style = typography.resolveRoleStyle('body', 'standard', { color: 'taupe' });
    expect(style.color).toBe(typography.TEXT_COLORS.taupe.hex);
  });

  it('une couleur hors palette est ignoree au profit de celle du role', () => {
    const style = typography.resolveRoleStyle('body', 'standard', { color: '#ff00ff' });
    expect(style.color).toBe(typography.TEXT_COLORS.ink.hex);
  });
});

describe('typographySystem — alignement (§6)', () => {
  it('accepte les 4 alignements et refuse le reste', () => {
    ['left', 'center', 'right', 'justify'].forEach((align) => {
      expect(typography.resolveRoleStyle('body', 'standard', { align }).align).toBe(align);
    });
    expect(typography.resolveRoleStyle('body', 'standard', { align: 'diagonal' }).align).toBe('justify');
  });
});

describe('typographySystem — contraste texte sur photo (§16)', () => {
  it('texte sombre sur fond clair : lisible', () => {
    const result = typography.checkTextContrast({
      colorHex: typography.TEXT_COLORS.ink.hex, backgroundHex: '#ffffff', sizePt: 11
    });
    expect(result.ok).toBe(true);
    expect(result.needsScrim).toBe(false);
  });

  it('texte sombre sur fond sombre : signale et reclame un voile', () => {
    const result = typography.checkTextContrast({
      colorHex: typography.TEXT_COLORS.ink.hex, backgroundHex: '#2a2a2a', sizePt: 11
    });
    expect(result.ok).toBe(false);
    expect(result.needsScrim).toBe(true);
  });

  it('texte clair sur fond sombre : lisible', () => {
    const result = typography.checkTextContrast({
      colorHex: typography.TEXT_COLORS.white.hex, backgroundHex: '#2a2a2a', sizePt: 11
    });
    expect(result.ok).toBe(true);
  });

  it('un grand texte a un seuil plus permissif (3:1 au lieu de 4.5:1)', () => {
    const small = typography.checkTextContrast({ colorHex: '#767676', backgroundHex: '#ffffff', sizePt: 11 });
    const large = typography.checkTextContrast({ colorHex: '#767676', backgroundHex: '#ffffff', sizePt: 24 });
    expect(small.required).toBe(4.5);
    expect(large.required).toBe(3);
  });
});

describe('typographySystem — CSS genere (§18, coherence apercu/PDF)', () => {
  it('declare une variable par role et par format', () => {
    FORMATS.forEach((formatId) => {
      const css = typography.typographyCssVariables(formatId);
      typography.TEXT_ROLES.forEach((role) => {
        expect(css).toContain(`--type-${role}-size:`);
        expect(css).toContain(`--type-${role}-lh:`);
        expect(css).toContain(`--type-${role}-color:`);
      });
    });
  });

  it('les variables refletent exactement resolveRoleStyle (aucune valeur en double)', () => {
    const css = typography.typographyCssVariables('luxe');
    typography.TEXT_ROLES.forEach((role) => {
      const style = typography.resolveRoleStyle(role, 'luxe');
      expect(css).toContain(`--type-${role}-size: ${style.fontSizePt}pt;`);
    });
  });

  it('les regles couvrent les classes de role ET le markup historique', () => {
    const rules = typography.typographyCssRules();
    typography.TEXT_ROLES.forEach((role) => {
      expect(rules).toContain(`.text-role-${role}`);
    });
    // Sans ce rattachement, les pages deja composees perdraient toute
    // typographie : le markup existant n'a pas de classe de role.
    expect(rules).toContain('.page-title');
    expect(rules).toContain('.texte-citation p');
  });

  it('aucune police hors des 2 familles autorisees (§4)', () => {
    const css = typography.typographyCssVariables('standard');
    const families = [...css.matchAll(/--type-\w+-family: ([^;]+);/g)].map((m) => m[1]);
    families.forEach((family) => {
      expect([typography.FONT_STACKS.serif, typography.FONT_STACKS.sans]).toContain(family);
    });
  });
});

// Retours a la ligne saisis par l'utilisateur (bug signale 2026-09-11 :
// "lorsqu'il y'a un retour a la ligne (entree), il n'est pas pris en
// compte"). Le \n etait bien enregistre et bien present dans le HTML, mais
// aucune regle white-space n'etait declaree : le navigateur le reduisait a
// une espace, a l'ecran comme a l'impression.
describe('typographySystem — retours a la ligne (§9)', () => {
  it('chaque role conserve les retours a la ligne', () => {
    const rules = typography.typographyCssRules();
    const occurrences = (rules.match(/white-space: pre-line/g) || []).length;
    expect(occurrences).toBe(typography.TEXT_ROLES.length);
  });

  it("utilise pre-line et non pre : l'habillage automatique doit continuer de fonctionner", () => {
    const rules = typography.typographyCssRules();
    expect(rules).not.toMatch(/white-space: pre;/);
    expect(rules).not.toMatch(/white-space: nowrap/);
  });

  it('le calcul de debordement compte AUSSI chaque ligne separement (coherent avec le rendu)', () => {
    const uneLigne = typography.estimateLineCount('court', 200, 10, 'sans');
    const troisLignes = typography.estimateLineCount('court\ncourt\ncourt', 200, 10, 'sans');
    expect(uneLigne).toBe(1);
    expect(troisLignes).toBe(3);
  });
});
