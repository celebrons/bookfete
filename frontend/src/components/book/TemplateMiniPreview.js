import React from 'react';
import './BookComposeLuxe.css';

// Palette approximative de chaque template (design_tokens.palette, voir
// backend/sql/phase04_layout_catalog_seed.sql) — pour un aperçu visuel
// immédiat sans dépendre de vraies photos. Extrait de BookComposeLuxe.js
// (etape "Style" du composeur) pour etre reutilise aussi par
// BookConfigLuxe.js (section "Style" de Configuration) — un seul mini-apercu
// de style dans tout le projet, jamais deux implementations qui pourraient
// diverger.
export const TEMPLATE_PALETTES = {
  'ivoire-or': { bg: '#f4f0e6', block: '#c9a35f', page: '#fffdf8' },
  'encre-papier': { bg: '#eceae4', block: '#2b2620', page: '#ffffff' },
  'noir-blanc': { bg: '#f2f2f2', block: '#1a1a1a', page: '#ffffff' }
};
export const DEFAULT_PALETTE = { bg: '#f4f0e6', block: '#c9a35f', page: '#fffdf8' };

// Mini gabarit de page reproduisant la densité du template (slotsPerPage)
// pour donner une vraie idée de "aéré" vs "dense" avant même d'avoir du contenu.
export default function TemplateMiniPreview({ template }) {
  const palette = TEMPLATE_PALETTES[template.design_tokens?.palette] || DEFAULT_PALETTE;
  const slotsPerPage = template.design_tokens?.slotsPerPage || 2;
  const blockCount = slotsPerPage >= 4 ? 4 : slotsPerPage === 1 ? 1 : 2;
  const layoutClass = blockCount === 4 ? 'is-grid' : blockCount === 1 ? 'is-single' : 'is-stack';

  return (
    <div className="template-mini-preview" style={{ backgroundColor: palette.bg }}>
      <div className={`template-mini-page ${layoutClass}`} style={{ backgroundColor: palette.page }}>
        {Array.from({ length: blockCount }).map((_, index) => (
          <span key={index} className="template-mini-block" style={{ backgroundColor: palette.block }} />
        ))}
      </div>
    </div>
  );
}
