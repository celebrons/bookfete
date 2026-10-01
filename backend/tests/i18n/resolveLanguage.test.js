const { resolveLanguage } = require('../../services/i18n/resolveLanguage');

describe('resolveLanguage', () => {
  it('utilise la preference du compte quand elle existe', () => {
    const req = { user: { user_metadata: { language: 'en' } } };
    expect(resolveLanguage(req)).toBe('en');
  });

  it('retombe sur Accept-Language si le compte n a pas de preference', () => {
    const req = { user: { user_metadata: {} }, headers: { 'accept-language': 'en-US,en;q=0.9,fr;q=0.8' } };
    expect(resolveLanguage(req)).toBe('en');
  });

  it('ne lit que la PREMIERE langue annoncee par Accept-Language', () => {
    const req = { headers: { 'accept-language': 'fr-FR,fr;q=0.9,en;q=0.8' } };
    expect(resolveLanguage(req)).toBe('fr');
  });

  it('repli sur le francais sans compte ni en-tete', () => {
    expect(resolveLanguage({})).toBe('fr');
    expect(resolveLanguage(undefined)).toBe('fr');
  });

  it('repli sur le francais pour une langue non supportee (ni compte ni en-tete valides)', () => {
    const req = { user: { user_metadata: { language: 'de' } }, headers: { 'accept-language': 'ja-JP' } };
    expect(resolveLanguage(req)).toBe('fr');
  });

  it('la preference du compte l emporte meme si Accept-Language dit autre chose', () => {
    const req = { user: { user_metadata: { language: 'fr' } }, headers: { 'accept-language': 'en-US' } };
    expect(resolveLanguage(req)).toBe('fr');
  });

  it('X-App-Language (choix explicite dans l app) l emporte sur Accept-Language', () => {
    const req = { headers: { 'x-app-language': 'en', 'accept-language': 'fr-FR,fr;q=0.9' } };
    expect(resolveLanguage(req)).toBe('en');
  });

  it('la preference du compte l emporte sur X-App-Language', () => {
    const req = { user: { user_metadata: { language: 'fr' } }, headers: { 'x-app-language': 'en' } };
    expect(resolveLanguage(req)).toBe('fr');
  });

  it('repli sur Accept-Language si X-App-Language est absent ou non supporte', () => {
    const req = { headers: { 'x-app-language': 'de', 'accept-language': 'en-US' } };
    expect(resolveLanguage(req)).toBe('en');
  });
});
