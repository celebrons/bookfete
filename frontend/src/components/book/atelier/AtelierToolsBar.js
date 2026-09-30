import React from 'react';
import { useTranslation } from 'react-i18next';

// BARRE D'OUTILS CONTEXTUELLE (refonte visuelle 2026-09-25, polie 2026-09-26
// §5 : retour utilisateur "trois gros boutons d'application" — les pastilles
// pleines a icone/fond/bordure sont devenues trois libelles textuels, separes
// par un simple trait fin, actifs par un soulignement dore plutot qu'un
// remplissage. Meme principe qu'avant (cliquer sur ce dont on a besoin, le
// reste reste range), presentation plus editoriale, moins "boutons d'appli".
function AtelierToolsBar({ activeDrawer, onToggle, photosCount, totalPages }) {
  const { t } = useTranslation('atelier');
  return (
    <div className="atelier-tools-bar" role="toolbar" aria-label={t('toolsBar.ariaLabel')}>
      <button
        type="button"
        className={`atelier-tool-btn ${activeDrawer === 'photos' ? 'is-active' : ''}`}
        onClick={() => onToggle('photos')}
        aria-pressed={activeDrawer === 'photos'}
      >
        {t('toolsBar.photos')}
        {photosCount > 0 && <span className="atelier-tool-count">{photosCount}</span>}
      </button>
      <span className="atelier-tools-bar-sep" aria-hidden="true" />
      <button
        type="button"
        className={`atelier-tool-btn ${activeDrawer === 'layout' ? 'is-active' : ''}`}
        onClick={() => onToggle('layout')}
        aria-pressed={activeDrawer === 'layout'}
      >
        {t('toolsBar.layout')}
      </button>
      <span className="atelier-tools-bar-sep" aria-hidden="true" />
      <button
        type="button"
        className={`atelier-tool-btn ${activeDrawer === 'pages' ? 'is-active' : ''}`}
        onClick={() => onToggle('pages')}
        aria-pressed={activeDrawer === 'pages'}
      >
        {t('toolsBar.pages')}
        {totalPages > 0 && <span className="atelier-tool-count">{totalPages}</span>}
      </button>
    </div>
  );
}

export default AtelierToolsBar;
