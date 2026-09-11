// frontend/src/components/book/atelier/atelierSlotInteractions.js
//
// Glue de glisser-deposer / clic-pour-placer partagee entre les DEUX
// surfaces qui remplissent les memes emplacements (draftSlotItemIds, voir
// BookAtelierLuxe.js) : la liste abstraite du panneau "Mise en page"
// (AtelierLayoutPanel) et l'incrustation directe sur la page
// (AtelierPageOverlay). Extrait ici pour que les deux ecrivent avec
// exactement la meme logique — jamais deux implementations qui pourraient
// diverger silencieusement.

import { slotAcceptsItem } from './atelierLayouts';

export function parseDroppedItem(event) {
  try {
    const data = JSON.parse(event.dataTransfer.getData('application/json'));
    return data?.itemId ? { itemId: data.itemId, kind: data.kind || null } : null;
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
    // `slotType` (optionnel, retour utilisateur 2026-09-11) : un depot dont
    // le kind ne correspond pas a l'emplacement (photo -> texte, ou
    // l'inverse) est refuse ICI, avant meme d'atteindre onAssignSlot —
    // jusque-la, seul un indice visuel (.is-rejecting) signalait
    // l'incompatibilite mais le depot etait quand meme accepte, provoquant
    // ensuite un rejet cote serveur avec un message brut au moment de la
    // sauvegarde ("Le contenu choisi ne correspond pas aux emplacements...").
    // Omis (undefined) -> aucune verification, comportement inchange (ex.
    // un appelant qui ne connait pas encore le type de l'emplacement).
    handleDrop(event, slotIndex, slotType) {
      event.preventDefault();
      const dropped = parseDroppedItem(event);
      if (dropped && (!slotType || slotAcceptsItem(slotType, { kind: dropped.kind }))) {
        onAssignSlot(slotIndex, dropped.itemId);
        onCancelRemove?.();
      }
    },
    handleClick(slotIndex, currentItem, slotType) {
      if (selectedSidebarItem) {
        if (!slotType || slotAcceptsItem(slotType, selectedSidebarItem)) {
          onAssignSlot(slotIndex, selectedSidebarItem.id);
          onCancelRemove?.();
        }
        // Sinon : rien ne se passe, le hint visuel (.is-rejecting) explique
        // deja pourquoi avant meme le clic.
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
