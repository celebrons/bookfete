// frontend/src/components/book/atelier/atelierSlotInteractions.js
//
// Glue de glisser-deposer / clic-pour-placer partagee entre les DEUX
// surfaces qui remplissent les memes emplacements (draftSlotItemIds, voir
// BookAtelierLuxe.js) : la liste abstraite du panneau "Mise en page"
// (AtelierLayoutPanel) et l'incrustation directe sur la page
// (AtelierPageOverlay). Extrait ici pour que les deux ecrivent avec
// exactement la meme logique — jamais deux implementations qui pourraient
// diverger silencieusement.

export function parseDroppedItemId(event) {
  try {
    const data = JSON.parse(event.dataTransfer.getData('application/json'));
    return data?.itemId || null;
  } catch (_error) {
    // Charge utile de drag invalide/etrangere : ignoree, jamais un plantage.
    return null;
  }
}

// Retrait a deux temps (retour utilisateur : jamais de retrait direct au
// clic, il faut une confirmation) : pendingRemoveIndex/onRequestRemove/
// onCancelRemove sont optionnels — un appelant qui ne les fournit pas garde
// l'ancien comportement (retrait immediat), mais les DEUX surfaces qui
// utilisent ce module (AtelierLayoutPanel, AtelierPageOverlay) les
// fournissent desormais toutes les deux, pour ne jamais diverger. Premier
// clic sur un emplacement rempli -> arme la confirmation (onRequestRemove) ;
// second clic sur CE MEME emplacement -> retire pour de bon. Deposer/
// assigner ailleurs desarme automatiquement (onCancelRemove), un seul
// emplacement peut etre "en attente de confirmation" a la fois.
export function makeSlotHandlers({
  onAssignSlot,
  onRemoveSlot,
  selectedSidebarItem,
  pendingRemoveIndex,
  onRequestRemove,
  onCancelRemove
}) {
  return {
    handleDrop(event, slotIndex) {
      event.preventDefault();
      const itemId = parseDroppedItemId(event);
      if (itemId) {
        onAssignSlot(slotIndex, itemId);
        onCancelRemove?.();
      }
    },
    handleClick(slotIndex, currentItem) {
      if (selectedSidebarItem) {
        onAssignSlot(slotIndex, selectedSidebarItem.id);
        onCancelRemove?.();
      } else if (currentItem) {
        if (pendingRemoveIndex === slotIndex) {
          onRemoveSlot(slotIndex);
          onCancelRemove?.();
        } else if (onRequestRemove) {
          onRequestRemove(slotIndex);
        } else {
          onRemoveSlot(slotIndex);
        }
      }
    }
  };
}
