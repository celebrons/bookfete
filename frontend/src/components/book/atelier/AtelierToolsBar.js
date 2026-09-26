import React from 'react';

// BARRE D'OUTILS CONTEXTUELLE (refonte visuelle 2026-09-25).
//
// Trois pastilles, chacune ouvre/ferme le tiroir correspondant (voir
// AtelierDrawer.js) — jamais plus d'un a la fois. Libelles et pictogrammes
// choisis pour Celebrons, pas une reprise de ceux d'un concurrent : seul le
// PRINCIPE (cliquer sur ce dont on a besoin, le reste reste range) est
// repris.
function AtelierToolsBar({ activeDrawer, onToggle, photosCount, totalPages, pagesAlert }) {
  return (
    <div className="atelier-tools-bar" role="toolbar" aria-label="Outils de composition">
      <button
        type="button"
        className={`atelier-tool-btn ${activeDrawer === 'photos' ? 'is-active' : ''}`}
        onClick={() => onToggle('photos')}
        aria-pressed={activeDrawer === 'photos'}
      >
        <span className="atelier-tool-icon" aria-hidden="true">📷</span>
        Photos
        {photosCount > 0 && <span className="atelier-tool-count">{photosCount}</span>}
      </button>
      <button
        type="button"
        className={`atelier-tool-btn ${activeDrawer === 'layout' ? 'is-active' : ''}`}
        onClick={() => onToggle('layout')}
        aria-pressed={activeDrawer === 'layout'}
      >
        <span className="atelier-tool-icon" aria-hidden="true">✦</span>
        Mise en page
      </button>
      <button
        type="button"
        className={`atelier-tool-btn ${activeDrawer === 'pages' ? 'is-active' : ''}`}
        onClick={() => onToggle('pages')}
        aria-pressed={activeDrawer === 'pages'}
      >
        <span className="atelier-tool-icon" aria-hidden="true">▦</span>
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
