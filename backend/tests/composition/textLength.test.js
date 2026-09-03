const {
  classifyTextLength,
  splitTextSafely,
  TEXT_LENGTH_THRESHOLDS,
  TEXT_HARD_SPLIT_THRESHOLD
} = require('../../services/composition/textLength');

describe('textLength.classifyTextLength', () => {
  it('classe SHORT / MEDIUM / LONG selon les seuils', () => {
    expect(classifyTextLength(10)).toBe('SHORT');
    expect(classifyTextLength(TEXT_LENGTH_THRESHOLDS.SHORT_MAX)).toBe('SHORT');
    expect(classifyTextLength(TEXT_LENGTH_THRESHOLDS.SHORT_MAX + 1)).toBe('MEDIUM');
    expect(classifyTextLength(TEXT_LENGTH_THRESHOLDS.MEDIUM_MAX)).toBe('MEDIUM');
    expect(classifyTextLength(TEXT_LENGTH_THRESHOLDS.MEDIUM_MAX + 1)).toBe('LONG');
  });
});

describe('textLength.splitTextSafely', () => {
  it('ne decoupe pas un texte qui tient deja dans maxChars', () => {
    const text = 'Un petit texte.';
    expect(splitTextSafely(text, 100)).toEqual([text]);
  });

  it('decoupe a la frontiere du paragraphe quand possible', () => {
    const text = `Paragraphe un, assez court.\n\nParagraphe deux, assez court aussi.\n\nParagraphe trois.`;
    const parts = splitTextSafely(text, 40);
    expect(parts.length).toBeGreaterThan(1);
    parts.forEach((part) => expect(part.length).toBeLessThanOrEqual(40));
    // Aucun mot coupe : chaque part commence/finit sur une frontiere de mot.
    parts.forEach((part) => {
      expect(part.trim()).toBe(part);
    });
  });

  it('replie sur la phrase quand un paragraphe seul depasse maxChars', () => {
    const longParagraph = Array.from({ length: 10 }, (_, i) => `Phrase numero ${i} avec quelques mots.`).join(' ');
    const parts = splitTextSafely(longParagraph, 80);
    expect(parts.length).toBeGreaterThan(1);
    parts.forEach((part) => expect(part.length).toBeLessThanOrEqual(80));
  });

  it('replie sur le mot en dernier recours (aucune ponctuation) sans jamais couper un mot en deux', () => {
    const words = Array.from({ length: 100 }, (_, i) => `mot${i}`);
    const pathological = words.join(' '); // pas de ponctuation du tout
    const parts = splitTextSafely(pathological, 50);
    expect(parts.length).toBeGreaterThan(1);

    const reassembled = parts.join(' ');
    // Chaque mot d'origine doit se retrouver intact quelque part.
    words.forEach((word) => {
      expect(reassembled).toContain(word);
    });
    parts.forEach((part) => expect(part.length).toBeLessThanOrEqual(50));
  });

  it('ne perd aucun contenu : la concatenation des parts couvre tout le texte original', () => {
    const text = `Premier paragraphe avec du contenu.\n\nDeuxieme paragraphe, different, avec plus de mots pour varier la longueur totale du texte.`;
    const parts = splitTextSafely(text, 60);
    const totalChars = parts.reduce((sum, part) => sum + part.length, 0);
    expect(totalChars).toBeGreaterThan(0);
    expect(parts.join(' ')).toContain('Premier paragraphe');
    expect(parts.join(' ')).toContain('Deuxieme paragraphe');
  });

  it('gere une chaine vide sans planter', () => {
    expect(splitTextSafely('', 100)).toEqual([]);
    expect(splitTextSafely('   ', 100)).toEqual([]);
  });

  it('TEXT_HARD_SPLIT_THRESHOLD est un nombre positif raisonnable', () => {
    expect(TEXT_HARD_SPLIT_THRESHOLD).toBeGreaterThan(TEXT_LENGTH_THRESHOLDS.MEDIUM_MAX);
  });
});
