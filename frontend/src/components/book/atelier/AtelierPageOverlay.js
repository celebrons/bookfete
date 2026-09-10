import React, { useEffect, useState } from 'react';
import { getOverlayGeometry, OVERLAY_CONTENT_INSET_PCT } from './atelierLayoutGeometry';
import { makeSlotHandlers } from './atelierSlotInteractions';
import { slotAcceptsItem } from './atelierLayouts';
import { describeSlotPhotoQuality } from './photoQuality';
import AtelierPhotoLightbox from './AtelierPhotoLightbox';

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

function XIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
      <path d="M5 5L19 19M19 5L5 19" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1.5 12S5 5 12 5s10.5 7 10.5 7-3.5 7-10.5 7S1.5 12 1.5 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function AtelierPageOverlay({ slug, slotTypes, slotItems, onAssignSlot, onRemoveSlot, selectedSidebarItem, photoAdjustments, printFormat }) {
  // Retrait a deux temps (retour utilisateur : jamais de retrait direct au
  // clic, il faut une confirmation) — meme mecanisme que le panneau "Mise
  // en page" (AtelierLayoutPanel.js), voir atelierSlotInteractions.js pour
  // la logique partagee. Reinitialise par le `key` pose par l'appelant
  // (BookAtelierLuxe.js) a chaque changement de page/cote, pas par un effet
  // qui observerait slotItems (nouvelle reference a chaque rendu du parent).
  const [pendingRemoveIndex, setPendingRemoveIndex] = useState(null);
  // Apercu plein ecran d'une photo a sa vraie resolution (retour
  // utilisateur, 2026-09-11) — voir AtelierPhotoLightbox.js.
  const [viewingUrl, setViewingUrl] = useState(null);

  // Retour utilisateur (2026-09-10) : "confirmer le retrait" restait affiche
  // si on cliquait ailleurs QUE sur un autre emplacement (ex. la barre
  // laterale, le header, en dehors meme du livre) — seul un clic sur un
  // AUTRE emplacement l'annulait (via onCancelRemove ci-dessous, dans
  // handleDrop/handleClick). Ecoute globale : tout clic dont la cible n'est
  // PAS a l'interieur d'un emplacement de CETTE incrustation annule la
  // confirmation en attente. Un clic a l'interieur d'un emplacement (y
  // compris celui en attente, pour confirmer) n'est jamais intercepte ici —
  // c'est deja gere par l'onClick du emplacement lui-meme, dans le meme tour
  // d'evenement.
  useEffect(() => {
    if (pendingRemoveIndex == null) return undefined;
    function handleOutsideClick(event) {
      if (!event.target.closest('.atelier-overlay-slot')) setPendingRemoveIndex(null);
    }
    document.addEventListener('click', handleOutsideClick);
    return () => document.removeEventListener('click', handleOutsideClick);
  }, [pendingRemoveIndex]);

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

  // Retrait explicite via la croix (retour utilisateur, 2026-09-11 :
  // "afficher une x pour supprimer") — meme etat/meme confirmation a deux
  // temps que le clic sur l'emplacement (pendingRemoveIndex), mais
  // declenche par un bouton dedie plutot que par un clic ambigu n'importe
  // ou sur la photo (qui reste par ailleurs possible, comportement
  // inchange, voir handleClick ci-dessus/atelierSlotInteractions.js).
  function handleRequestRemove(event, index) {
    event.stopPropagation();
    if (pendingRemoveIndex === index) {
      onRemoveSlot(index);
      setPendingRemoveIndex(null);
    } else {
      setPendingRemoveIndex(index);
    }
  }

  return (
    <>
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
          // Badge qualite (§19, cahier des charges "PhotoSlot") : calcule
          // localement (aucun appel reseau, voir photoQuality.js), jamais le
          // mot "DPI" affiche — juste l'emoji + un texte au survol (title).
          const quality = item && slotType === 'photo'
            ? describeSlotPhotoQuality({ item, layoutSlug: slug, slotIndex: index, printFormat, zoom: photoAdjustments?.[item.id]?.zoom })
            : null;
          return (
            <div
              key={index}
              className={`atelier-overlay-slot ${item ? 'is-filled' : ''} ${rejects ? 'is-rejecting' : ''} ${isPending ? 'is-pending-remove' : ''}`}
              style={{ top: `${rect.top}%`, left: `${rect.left}%`, width: `${rect.width}%`, height: `${rect.height}%` }}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => { event.stopPropagation(); handleDrop(event, index); }}
              onClick={(event) => { event.stopPropagation(); handleClick(index, item); }}
              title={item ? (isPending ? 'Cliquer a nouveau pour confirmer le retrait' : undefined) : undefined}
            >
              {!item && <span className="atelier-overlay-slot-label">{SLOT_LABELS[slotType] || 'Emplacement'}</span>}
              {quality && !isPending && (
                <span className="atelier-overlay-slot-quality" title={quality.label} aria-label={quality.label}>
                  {quality.emoji}
                </span>
              )}
              {item && isPending && <span className="atelier-overlay-slot-confirm">Confirmer le retrait ?</span>}
              {item && !isPending && (
                <div className="atelier-overlay-slot-actions">
                  {slotType === 'photo' && (
                    <button
                      type="button"
                      className="atelier-overlay-slot-icon-btn atelier-overlay-slot-view-btn"
                      onClick={(event) => { event.stopPropagation(); setViewingUrl(item.url); }}
                      title="Voir la photo en taille réelle"
                      aria-label="Voir la photo en taille réelle"
                    >
                      <EyeIcon />
                    </button>
                  )}
                  <button
                    type="button"
                    className="atelier-overlay-slot-icon-btn atelier-overlay-slot-remove-btn"
                    onClick={(event) => handleRequestRemove(event, index)}
                    title="Retirer"
                    aria-label="Retirer"
                  >
                    <XIcon />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <AtelierPhotoLightbox url={viewingUrl} onClose={() => setViewingUrl(null)} />
    </>
  );
}

export default AtelierPageOverlay;
