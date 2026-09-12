import React, { useEffect, useRef } from 'react';

// Bande de vignettes en bas de l'atelier — navigation directe vers
// n'importe quelle page sans repasser par precedente/suivante (retour
// utilisateur : gain d'ergonomie important sur un livre de 16+ pages, ou
// atteindre la page 14 depuis la page 2 demandait 12 clics). Vignettes
// SCHEMATIQUES (numero + statut), pas de vrai rendu miniature — meme choix
// deja fait pour LayoutFormatMiniature (AtelierLayoutPanel.js) suite a un
// retour utilisateur explicite ("je ne sais pas s'il est pertinent
// d'afficher les images ici") : la vraie page s'affiche deja au centre,
// dupliquer son contenu en dizaines de miniatures visuelles n'apporterait
// rien de plus qu'un cout de performance (autant d'iframes que de pages).
//
// Toujours visible (pleine largeur, sous les 3 colonnes de travail), donc
// accessible depuis n'importe quelle vue (couverture/interieur/4e) —
// contrairement a la navigation precedente/suivante qui vit dans la colonne
// centrale et change de forme selon viewKind.

// Alignees sur les memes constantes que AtelierBookView.js/AtelierLayoutPanel.js
// (convention deja etablie dans ce projet pour ces petites tables format ->
// dimensions plutot qu'un import partage). 2026-09-09 : realignees sur le
// catalogue reel Gelato, voir l'en-tete de coverFormat.js.
const FORMAT_DIMENSIONS_MM = {
  livret: { widthMm: 200, heightMm: 200 },
  standard: { widthMm: 210, heightMm: 280 },
  luxe: { widthMm: 210, heightMm: 280 }
};

const STATUS_LABEL = { complete: 'Page complete', partial: 'Page en cours', empty: 'Page vide', cover: '' };

function FilmstripCell({ target, label, status, isActive, aspectRatio, onSelect }) {
  const ref = useRef(null);

  // Fait defiler la bande pour garder la vignette active visible, y compris
  // quand la navigation se fait via precedente/suivante (pas seulement un
  // clic direct dans le filmstrip) — sinon la selection "invisible" hors
  // champ romprait la coherence entre le filmstrip et la vue centrale.
  useEffect(() => {
    if (isActive) ref.current?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [isActive]);

  return (
    <button
      ref={ref}
      type="button"
      className={`atelier-filmstrip-cell is-${status} ${isActive ? 'is-active' : ''}`}
      style={{ aspectRatio }}
      onClick={() => onSelect(target)}
      title={STATUS_LABEL[status] ? `${label} — ${STATUS_LABEL[status]}` : `${label}`}
    >
      <span className="atelier-filmstrip-cell-label">{label}</span>
      {status === 'complete' && <span className="atelier-filmstrip-cell-check" aria-hidden="true">✓</span>}
    </button>
  );
}

function AtelierPageFilmstrip({
  pageStatuses,
  activeTarget,
  printFormat,
  onSelect,
  onAddPages,
  addingPages,
  onRemovePages,
  removingPages,
  canRemovePages,
  minPages
}) {
  const dims = FORMAT_DIMENSIONS_MM[printFormat] || FORMAT_DIMENSIONS_MM.standard;
  const aspectRatio = `${dims.widthMm} / ${dims.heightMm}`;

  return (
    <div className="atelier-filmstrip">
      {/* Couvertures : ni "complete" ni "vide" au meme sens qu'une page
          interieure (toujours un contenu par defaut) — classe neutre
          dediee plutot qu'un statut trompeur. */}
      <FilmstripCell
        target="cover"
        label="Cvr"
        status="cover"
        isActive={activeTarget === 'cover'}
        aspectRatio={aspectRatio}
        onSelect={onSelect}
      />
      <div className="atelier-filmstrip-sep" aria-hidden="true" />
      {pageStatuses.map(({ pageIndex, status }) => (
        <FilmstripCell
          key={pageIndex}
          target={pageIndex}
          label={pageIndex + 1}
          status={status}
          isActive={activeTarget === pageIndex}
          aspectRatio={aspectRatio}
          onSelect={onSelect}
        />
      ))}
      {/* Agrandir ou reduire volontairement le livre (jamais automatique —
          voir routes/composition.js: POST /pages/extend et /pages/shrink) :
          2 pages a la fois, meme palier que le catalogue imprimeur (Gelato
          n'accepte que des nombres pairs de pages). Le retrait se fait par la
          FIN et se desactive des qu'on atteint le minimum imprimable — le
          bouton reste visible (grise, avec l'explication en infobulle)
          plutot que de disparaitre sans dire pourquoi. */}
      {onRemovePages && (
        <button
          type="button"
          className="atelier-filmstrip-add is-remove"
          style={{ aspectRatio }}
          onClick={onRemovePages}
          disabled={removingPages || !canRemovePages}
          title={canRemovePages
            ? 'Retirer les 2 dernieres pages du livre'
            : `Minimum ${minPages} pages : impossible d'en retirer davantage`}
        >
          {removingPages ? '…' : '−2'}
        </button>
      )}
      {onAddPages && (
        <button
          type="button"
          className="atelier-filmstrip-add"
          style={{ aspectRatio }}
          onClick={onAddPages}
          disabled={addingPages}
          title="Ajouter 2 pages vides a la fin du livre"
        >
          {addingPages ? '…' : '+2'}
        </button>
      )}
      <div className="atelier-filmstrip-sep" aria-hidden="true" />
      <FilmstripCell
        target="back-cover"
        label="4e"
        status="cover"
        isActive={activeTarget === 'back-cover'}
        aspectRatio={aspectRatio}
        onSelect={onSelect}
      />
    </div>
  );
}

export default AtelierPageFilmstrip;
