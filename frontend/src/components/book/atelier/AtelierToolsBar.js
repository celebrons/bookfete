import React from 'react';

// BARRE D'OUTILS CONTEXTUELLE (refonte visuelle 2026-09-25, polie 2026-09-26
// §5 : retour utilisateur "trois gros boutons d'application" — les pastilles
// pleines a icone/fond/bordure sont devenues trois libelles textuels, separes
// par un simple trait fin, actifs par un soulignement dore plutot qu'un
// remplissage. Meme principe qu'avant (cliquer sur ce dont on a besoin, le
// reste reste range), presentation plus editoriale, moins "boutons d'appli".
function AtelierToolsBar({ activeDrawer, onToggle, photosCount, totalPages, pagesAlert }) {
  return (
    <div className="atelier-tools-bar" role="toolbar" aria-label="Outils de composition">
      <button
        type="button"
        className={`atelier-tool-btn ${activeDrawer === 'photos' ? 'is-active' : ''}`}
        onClick={() => onToggle('photos')}
        aria-pressed={activeDrawer === 'photos'}
      >
        Photos
        {photosCount > 0 && <span className="atelier-tool-count">{photosCount}</span>}
      </button>
      <span className="atelier-tools-bar-sep" aria-hidden="true" />
      <button
        type="button"
        className={`atelier-tool-btn ${activeDrawer === 'layout' ? 'is-active' : ''}`}
        onClick={() => onToggle('layout')}
        aria-pressed={activeDrawer === 'layout'}
      >
        Mise en page
      </button>
      <span className="atelier-tools-bar-sep" aria-hidden="true" />
      <button
        type="button"
        className={`atelier-tool-btn ${activeDrawer === 'pages' ? 'is-active' : ''}`}
        onClick={() => onToggle('pages')}
        aria-pressed={activeDrawer === 'pages'}
      >
        Pages
        {totalPages > 0 && <span className="atelier-tool-count">{totalPages}</span>}
        {/* Resume regroupe (§7 de la demande) : "Pages · 32   2 pages a
            completer" plutot que des pastilles d'alerte disseminees. Absent
            tant qu'il n'y a rien a signaler. */}
        {pagesAlert && <span className="atelier-tool-alert">{pagesAlert}</span>}
      </button>
    </div>
  );
}

export default AtelierToolsBar;
