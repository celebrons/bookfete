import React, { useState } from 'react';
import './AdminSection.css';

// Section depliante de l'espace d'administration (demande du 2026-10-03) :
// avant, "Livres" et "Exploitation" s'affichaient toutes les deux en
// entier, en permanence — une page de plus en plus longue a mesure que les
// sous-sections (sante, travaux, journal) s'accumulaient. Repliee par
// defaut sauf celle passee en `defaultOpen`.
function AdminSection({ title, badge, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className={`admin-section${open ? ' is-open' : ''}`}>
      <button
        type="button"
        className="admin-section-toggle"
        onClick={() => setOpen((previous) => !previous)}
        aria-expanded={open}
      >
        <span className="admin-section-chevron" aria-hidden="true">{open ? '▾' : '▸'}</span>
        <span className="admin-section-title-text">{title}</span>
        {badge != null && <span className="admin-section-badge">{badge}</span>}
      </button>
      {open && <div className="admin-section-body">{children}</div>}
    </section>
  );
}

export default AdminSection;
