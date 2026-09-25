// Le style de l'album : nu / filet / encadre, UN SEUL reglage par livre.

const { ALBUM_STYLES, ALBUM_STYLE_DEFAUT, resolveAlbumStyle, albumStyleClass } = require('../../services/composition/albumStyle');

describe('albumStyle — trois valeurs fermees', () => {
  it('propose exactement nu / filet / encadre', () => {
    expect(Object.keys(ALBUM_STYLES)).toEqual(['nu', 'filet', 'encadre']);
  });

  it('le defaut est "nu" : un livre existant ne doit pas changer d aspect', () => {
    expect(ALBUM_STYLE_DEFAUT).toBe('nu');
    expect(resolveAlbumStyle({})).toBe('nu');
    expect(resolveAlbumStyle({ cover_overrides: {} })).toBe('nu');
  });

  it('lit cover_overrides.albumStyle quand il est valide', () => {
    expect(resolveAlbumStyle({ cover_overrides: { albumStyle: 'filet' } })).toBe('filet');
    expect(resolveAlbumStyle({ cover_overrides: { albumStyle: 'encadre' } })).toBe('encadre');
  });

  it('un jeton inconnu retombe sur le defaut, jamais applique tel quel', () => {
    expect(resolveAlbumStyle({ cover_overrides: { albumStyle: 'arc-en-ciel' } })).toBe('nu');
  });

  it('cover_overrides absent ou de mauvaise forme ne casse rien', () => {
    expect(resolveAlbumStyle({ cover_overrides: null })).toBe('nu');
    expect(resolveAlbumStyle({ cover_overrides: 'texte' })).toBe('nu');
    expect(resolveAlbumStyle(null)).toBe('nu');
    expect(resolveAlbumStyle(undefined)).toBe('nu');
  });

  it('albumStyleClass pose la classe attendue sur le document', () => {
    expect(albumStyleClass({ cover_overrides: { albumStyle: 'filet' } })).toBe('album-filet');
    expect(albumStyleClass({})).toBe('album-nu');
  });
});
