const { detectContentProfile, weightOfItem } = require('../../services/composition/contentProfile');

function photo(id) {
  return { id, kind: 'photo' };
}

function texte(id, length = 100) {
  return { id, kind: 'texte', text: 'x'.repeat(length) };
}

describe('contentProfile.weightOfItem', () => {
  it('une photo vaut toujours 1', () => {
    expect(weightOfItem(photo('p1'))).toBe(1);
  });

  it('un texte vaut au moins 1, et grandit avec la longueur', () => {
    expect(weightOfItem(texte('t1', 10))).toBe(1);
    expect(weightOfItem(texte('t2', 900))).toBeGreaterThan(1);
  });
});

describe('contentProfile.detectContentProfile', () => {
  it('classe un livre a forte majorite de photos comme PHOTO', () => {
    const items = Array.from({ length: 12 }, (_, i) => photo(`p${i}`));
    const { profile } = detectContentProfile(items);
    expect(profile).toBe('PHOTO');
  });

  it('classe un livre a forte majorite de textes comme TEXTE', () => {
    const items = Array.from({ length: 20 }, (_, i) => texte(`t${i}`, 500));
    const { profile } = detectContentProfile(items);
    expect(profile).toBe('TEXTE');
  });

  it('classe un melange equilibre comme EQUILIBRE', () => {
    const items = [
      ...Array.from({ length: 5 }, (_, i) => photo(`p${i}`)),
      ...Array.from({ length: 5 }, (_, i) => texte(`t${i}`, 100))
    ];
    const { profile } = detectContentProfile(items);
    expect(profile).toBe('EQUILIBRE');
  });

  it('classe par poids, pas par nombre brut (30 textes courts + 2 photos = toujours equilibre-ish, pas force PHOTO)', () => {
    const items = [
      photo('p1'),
      photo('p2'),
      ...Array.from({ length: 30 }, (_, i) => texte(`t${i}`, 50))
    ];
    const { profile } = detectContentProfile(items);
    expect(profile).toBe('TEXTE');
  });

  it('ne plante pas sur un livre vide', () => {
    const { profile, ratio } = detectContentProfile([]);
    expect(profile).toBe('EQUILIBRE');
    expect(ratio).toBe(0.5);
  });
});
