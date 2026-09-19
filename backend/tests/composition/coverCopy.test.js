const { pickClosingPhrase, formatStatsLine, CLOSING_PHRASES } = require('../../services/composition/coverCopy');

describe('coverCopy.pickClosingPhrase', () => {
  it('est deterministe : le meme book.id donne toujours la meme phrase', () => {
    const book = { id: 'book-123' };
    expect(pickClosingPhrase(book)).toBe(pickClosingPhrase(book));
  });

  it('reste dans le pool statique (jamais generee a la volee)', () => {
    const phrase = pickClosingPhrase({ id: 'book-abc' });
    expect(CLOSING_PHRASES).toContain(phrase);
  });

  it('ne plante jamais meme sans book.id', () => {
    expect(() => pickClosingPhrase({})).not.toThrow();
    expect(() => pickClosingPhrase(null)).not.toThrow();
  });

  it('des id differents peuvent donner des phrases differentes (pas toujours la meme)', () => {
    const ids = Array.from({ length: 20 }, (_, i) => `book-${i}`);
    const phrases = new Set(ids.map((id) => pickClosingPhrase({ id })));
    expect(phrases.size).toBeGreaterThan(1);
  });
});

describe('coverCopy.formatStatsLine', () => {
  it('formate les trois statistiques dans l\'ordre fixe contributeurs -> souvenirs -> photos', () => {
    expect(formatStatsLine({ contributeurs: 32, souvenirs: 47, photos: 18 }))
      .toBe('32 contributeurs · 47 souvenirs · 18 photos');
  });

  it('retire une statistique a 0 sans jamais l\'afficher (§10)', () => {
    expect(formatStatsLine({ contributeurs: 32, souvenirs: 47, photos: 0 }))
      .toBe('32 contributeurs · 47 souvenirs');
    expect(formatStatsLine({ contributeurs: 0, souvenirs: 47, photos: 18 }))
      .toBe('47 souvenirs · 18 photos');
    expect(formatStatsLine({ contributeurs: 32, souvenirs: 0, photos: 18 }))
      .toBe('32 contributeurs · 18 photos');
  });

  it('gere le singulier/pluriel', () => {
    expect(formatStatsLine({ contributeurs: 1, souvenirs: 1, photos: 1 }))
      .toBe('1 contributeur · 1 souvenir · 1 photo');
  });

  it('renvoie une chaine vide quand les trois compteurs sont a 0 (§10 : jamais de statistique vide affichee)', () => {
    expect(formatStatsLine({ contributeurs: 0, souvenirs: 0, photos: 0 })).toBe('');
    expect(formatStatsLine()).toBe('');
  });

  // Chiffres retires a la demande (cover_overrides.backStatsHidden, 2026-09-19).
  it('retire un chiffre explicitement masque', () => {
    expect(formatStatsLine({ contributeurs: 32, souvenirs: 47, photos: 18 }, ['photos']))
      .toBe('32 contributeurs · 47 souvenirs');
  });

  it('peut masquer plusieurs chiffres, et tous', () => {
    expect(formatStatsLine({ contributeurs: 32, souvenirs: 47, photos: 18 }, ['contributeurs', 'souvenirs']))
      .toBe('18 photos');
    expect(formatStatsLine({ contributeurs: 32, souvenirs: 47, photos: 18 }, ['contributeurs', 'souvenirs', 'photos']))
      .toBe('');
  });

  it('ignore une liste absente, vide ou invalide plutot que de tout masquer', () => {
    const compteurs = { contributeurs: 2, souvenirs: 3, photos: 4 };
    const attendu = '2 contributeurs · 3 souvenirs · 4 photos';
    expect(formatStatsLine(compteurs, [])).toBe(attendu);
    expect(formatStatsLine(compteurs, null)).toBe(attendu);
    expect(formatStatsLine(compteurs, 'photos')).toBe(attendu);
    expect(formatStatsLine(compteurs, ['inconnu'])).toBe(attendu);
  });
});
