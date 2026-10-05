// Premiere vraie commande vers le Canada (2026-10-05) : rejetee par Gelato
// ("Field is required") — leur API exige le champ `state` pour US/CA/AU
// specifiquement (verifie aupres de leur documentation), jamais pour les
// autres pays.

const { resolveCountryIso2, exigeUnEtat } = require('../../services/printing/countryCodes');

describe('countryCodes.exigeUnEtat', () => {
  it.each([
    ['Canada', true],
    ['canada', true],
    ['Québec', true],
    ['CA', true],
    ['United States', true],
    ['usa', true],
    ['US', true],
    ['Australie', true],
    ['Australia', true],
    ['AU', true],
    ['France', false],
    ['Belgique', false],
    ['', false]
  ])('%s -> exige un etat : %s', (pays, attendu) => {
    expect(exigeUnEtat(pays)).toBe(attendu);
  });
});

describe('countryCodes.resolveCountryIso2 — Australie (nouvellement ajoutee)', () => {
  it('reconnait Australie/Australia -> AU', () => {
    expect(resolveCountryIso2('Australie')).toBe('AU');
    expect(resolveCountryIso2('Australia')).toBe('AU');
  });
});
