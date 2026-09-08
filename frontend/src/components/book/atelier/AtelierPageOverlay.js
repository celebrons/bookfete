import React, { useState } from 'react';
import { getOverlayGeometry, OVERLAY_CONTENT_INSET_PCT } from './atelierLayoutGeometry';
import { makeSlotHandlers } from './atelierSlotInteractions';
import { slotAcceptsItem } from './atelierLayouts';

// Incrustation directe sur la page centrale ("tester un truc" — variante
// demandee en plus du panneau "Mise en page" existant, pas a sa place) :
// mêmes emplacements, même etat (draftSlotItemIds), même glue de
// glisser-deposer (atelierSlotInteractions) que le panneau de droite —
// seulement positionnes par-dessus le vrai rendu (l'iframe de la page) pour
// pouvoir deposer directement au bon endroit visuel plutot que sur une liste
// abstraite a cote. Approximatif par construction (voir
// atelierLayoutGeometry.js) : le panneau de droite reste utilisable en
// parallele, cette incrustation n'est qu'un raccourci visuel.
//
// L'iframe en dessous a pointer-events:none (voir BookAtelierLuxe.css) : les
// clics/drops passent donc naturellement a travers jusqu'a ces emplacements,
// sans qu'il soit necessaire de communiquer avec le contenu de l'iframe.
const SLOT_LABELS = { photo: 'Photo', text: 'Texte', title: 'Titre' };

function AtelierPageOverlay({ slug, slotTypes, slotItems, onAssignSlot, onRemoveSlot, selectedSidebarItem }) {
  // Retrait a deux temps (retour utilisateur : jamais de retrait direct au
  // clic, il faut une confirmation) — meme mecanisme que le panneau "Mise
  // en page" (AtelierLayoutPanel.js), voir atelierSlotInteractions.js pour
  // la logique partagee. Reinitialise par le `key` pose par l'appelant
  // (BookAtelierLuxe.js) a chaque changement de page/cote, pas par un effet
  // qui observerait slotItems (nouvelle reference a chaque rendu du parent).
  const [pendingRemoveIndex, setPendingRemoveIndex] = useState(null);

  const geometry = getOverlayGeometry(slug);
  if (!geometry) return null;

  const { handleDrop, handleClick } = makeSlotHandlers({
    onAssignSlot,
    onRemoveSlot,
    selectedSidebarItem,
    pendingRemoveIndex,
    onRequestRemove: setPendingRemoveIndex,
    onCancelRemove: () => setPendingRemoveIndex(null)
  });

  return (
    <div
      className="atelier-page-overlay"
      style={{
        top: `${OVERLAY_CONTENT_INSET_PCT.top}%`,
        left: `${OVERLAY_CONTENT_INSET_PCT.left}%`,
        right: `${OVERLAY_CONTENT_INSET_PCT.right}%`,
        bottom: `${OVERLAY_CONTENT_INSET_PCT.bottom}%`
      }}
    >
      {geometry.map((rect, index) => {
        const slotType = slotTypes[index];
        const item = slotItems[index] || null;
        const rejects = Boolean(selectedSidebarItem && !slotAcceptsItem(slotType, selectedSidebarItem));
        const isPending = pendingRemoveIndex === index;
        return (
          <div
            key={index}
            className={`atelier-overlay-slot ${item ? 'is-filled' : ''} ${rejects ? 'is-rejecting' : ''} ${isPending ? 'is-pending-remove' : ''}`}
            style={{ top: `${rect.top}%`, left: `${rect.left}%`, width: `${rect.width}%`, height: `${rect.height}%` }}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => { event.stopPropagation(); handleDrop(event, index); }}
            onClick={(event) => { event.stopPropagation(); handleClick(index, item); }}
            title={item ? (isPending ? 'Cliquer a nouveau pour confirmer le retrait' : 'Cliquer pour retirer') : undefined}
          >
            {!item && <span className="atelier-overlay-slot-label">{SLOT_LABELS[slotType] || 'Emplacement'}</span>}
            {item && isPending && <span className="atelier-overlay-slot-confirm">Confirmer le retrait ?</span>}
            {item && !isPending && <span className="atelier-overlay-slot-remove" aria-hidden="true">Retirer</span>}
          </div>
        );
      })}
    </div>
  );
}

export default AtelierPageOverlay;
