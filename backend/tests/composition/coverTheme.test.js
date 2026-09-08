const { resolveCoverTheme, COVER_THEMES, DEFAULT_THEME_SLUG, applyFormatAccent } = require('../../services/composition/coverTheme');

describe('coverTheme.resolveCoverTheme', () => {
  it('renvoie le theme exact pour chacun des 3 templates connus', () => {
    ['elegance', 'editorial', 'minimal'].forEach((slug) => {
      const theme = resolveCoverTheme({ slug });
      expect(theme).toEqual(COVER_THEMES[slug]);
    });
  });

  it('replie sur le theme par defaut pour un template inconnu, sans jamais lever', () => {
    expect(() => resolveCoverTheme({ slug: 'inexistant' })).not.toThrow();
    expect(resolveCoverTheme({ slug: 'inexistant' })).toEqual(COVER_THEMES[DEFAULT_THEME_SLUG]);
  });

  it('replie sur le theme par defaut si le template est null/undefined', () => {
    expect(resolveCoverTheme(null)).toEqual(COVER_THEMES[DEFAULT_THEME_SLUG]);
    expect(resolveCoverTheme(undefined)).toEqual(COVER_THEMES[DEFAULT_THEME_SLUG]);
  });

  it('recto et verso du meme template partagent exactement le meme theme (coherence visuelle)', () => {
    const template = { slug: 'editorial' };
    expect(resolveCoverTheme(template)).toEqual(resolveCoverTheme(template));
  });

  it('chaque theme ne declare qu\'une police principale et une secondaire (§7)', () => {
    Object.values(COVER_THEMES).forEach((theme) => {
      expect(typeof theme.titleFont).toBe('string');
      expect(typeof theme.secondaryFont).toBe('string');
    });
  });
});

describe('coverTheme.applyFormatAccent', () => {
  it('luxe force le MEME accent dore + un cadre en surimpression, quel que soit le style de base', () => {
    ['elegance', 'editorial', 'minimal'].forEach((slug) => {
      const base = resolveCoverTheme({ slug });
      const result = applyFormatAccent(base, 'luxe');
      expect(result.ornament).toBe('gold-frame');
      expect(result.accent).toBe('#c19a3d');
      expect(typeof result.accentDeep).toBe('string');
      // Le reste du theme (police, encre) n'est PAS touche par le format.
      expect(result.titleFont).toBe(base.titleFont);
      expect(result.ink).toBe(base.ink);
    });
  });

  it('luxe force une matiere/teinte propre (ivoire + lin) et un embossage du titre, quel que soit le style de base', () => {
    ['elegance', 'editorial', 'minimal'].forEach((slug) => {
      const base = resolveCoverTheme({ slug });
      const result = applyFormatAccent(base, 'luxe');
      expect(result.paper).toBe('#ede6d6');
      expect(result.bg).toBe('#ede6d6');
      expect(result.texture).toBe('linen');
      expect(result.titleEffect).toBe('emboss');
    });
  });

  it('livret force une teinte neutre (jamais de dorure), meme si le style choisi en fournirait une (elegance)', () => {
    const base = resolveCoverTheme({ slug: 'elegance' }); // accent naturellement dore pale (#c9a35f)
    const result = applyFormatAccent(base, 'livret');
    expect(result.ornament).toBe('none');
    expect(result.accent).not.toBe(base.accent);
    expect(result.accent).toBe('#8f8a7c');
    // Aucune matiere/texture/embossage : reserves au Luxe uniquement.
    expect(result.texture).toBeUndefined();
    expect(result.titleEffect).toBeUndefined();
  });

  it('standard ne change ni la couleur du style choisi ni la matiere, et n\'ajoute pas de cadre', () => {
    const base = resolveCoverTheme({ slug: 'editorial' });
    ['standard', undefined, 'inconnu'].forEach((formatId) => {
      const result = applyFormatAccent(base, formatId);
      expect(result.ornament).toBe('none');
      expect(result.accent).toBe(base.accent);
      expect(result.ink).toBe(base.ink);
      expect(result.titleFont).toBe(base.titleFont);
      expect(result.texture).toBeUndefined();
    });
  });

  it('ne mute jamais le theme d\'origine (fonction pure)', () => {
    const base = resolveCoverTheme({ slug: 'elegance' });
    const snapshot = { ...base };
    applyFormatAccent(base, 'luxe');
    expect(base).toEqual(snapshot);
  });
});
