import React, { useEffect, useState } from 'react';
import { ATELIER_CATEGORIES, ATELIER_LAYOUTS, layoutsByCategory, slotAcceptsItem } from './atelierLayouts';
import { makeSlotHandlers } from './atelierSlotInteractions';
import { getOverlayGeometry, OVERLAY_CONTENT_INSET_PCT } from './atelierLayoutGeometry';

// Colonne droite de l'atelier : "Mise en page" — jamais de positionnement
// libre (cahier des charges §4). Page vide -> "Que souhaitez-vous mettre
// sur cette page ?" + les 5 categories, qui filtrent simplement la meme
// galerie de formats (jamais un second mecanisme de choix). Format choisi
// -> les emplacements apparaissent, cibles de glisser-deposer ou de clic
// (si un element est deja selectionne cote gauche).

const SLOT_LABELS = { photo: 'Photo', text: 'Texte', title: 'Titre' };

// TWO_TESTIMONIES/THREE_TESTIMONIES sont les seules mises en page ou
// plusieurs emplacements 'text' sont reellement cote a cote dans le rendu
// final (cartes de temoignages, voir pageRenderer.js: .testimony-stack) —
// partout ailleurs (TITLE_TEXT notamment), un emplacement 'text' est un
// paragraphe pleine largeur. Sans cette distinction, la mini-vignette
// affichait TOUJOURS les emplacements texte empiles verticalement (largeur
// 100% par defaut), y compris pour ces deux mises en page ou le vrai rendu
// les place cote a cote — laissant croire a tort que le format est
// "vertical" alors que la page reelle est bien horizontale.
const INLINE_TEXT_LAYOUTS = new Set(['TWO_TESTIMONIES', 'THREE_TESTIMONIES']);

function LayoutMiniPreview({ slug, slots }) {
  const inlineText = INLINE_TEXT_LAYOUTS.has(slug);
  return (
    <div className="atelier-layout-mini">
      {slots.map((type, index) => {
        const className = type === 'text' && inlineText
          ? 'atelier-layout-mini-text atelier-layout-mini-text-inline'
          : `atelier-layout-mini-${type}`;
        return <span key={index} className={className} />;
      })}
    </div>
  );
}

function FormatGallery({ layouts, selectedSlug, onChoose }) {
  return (
    <div className="atelier-format-grid">
      {layouts.map((layout) => (
        <button
          key={layout.slug}
          type="button"
          className={`atelier-format-option ${selectedSlug === layout.slug ? 'is-selected' : ''}`}
          onClick={() => onChoose(layout.slug)}
        >
          <LayoutMiniPreview slug={layout.slug} slots={layout.slots} />
          <span className="atelier-format-label">{layout.label}</span>
        </button>
      ))}
    </div>
  );
}

// Alignees sur backend/services/composition/coverFormat.js (COVER_FORMATS)
// — meme constante deja dupliquee a la main dans AtelierBookView.js/
// AtelierPageFilmstrip.js/BookPreviewFinalLuxe.js (convention deja etablie
// dans ce projet pour ces petites tables format -> dimensions, plutot qu'un
// import partage). 2026-09-09 : realignees sur le catalogue reel Gelato,
// voir l'en-tete de coverFormat.js.
const FORMAT_DIMENSIONS_MM = {
  livret: { widthMm: 200, heightMm: 200 },
  standard: { widthMm: 210, heightMm: 280 },
  luxe: { widthMm: 210, heightMm: 280 }
};

// Miniature FIDELE AU FORMAT choisi (retour utilisateur : les vignettes
// photo dans les emplacements faisaient doublon avec la vraie page au
// centre — plutot une miniature qui montre la VRAIE FORME de la mise en
// page, avec une coche verte sur les emplacements remplis et un pointille
// sur ceux encore vides). Reutilise EXACTEMENT la meme geometrie que
// l'incrustation posee directement sur la page (voir AtelierPageOverlay.js)
// — jamais une deuxieme source de verite sur la disposition — et le meme
// ratio d'affichage par format que le reste de l'atelier/l'Apercu final
// (FORMAT_DIMENSIONS_MM). Reste le vrai plateau interactif : glisser-
// deposer/clic fonctionnent ici exactement comme avant, seule la forme et
// le contenu affiche par emplacement changent.
function LayoutFormatMiniature({ layout, slotItems, printFormat, selectedSidebarItem, onAssignSlot, onRemoveSlot }) {
  const geometry = getOverlayGeometry(layout.slug);
  const dims = FORMAT_DIMENSIONS_MM[printFormat] || FORMAT_DIMENSIONS_MM.standard;

  // Retrait a deux temps (jamais direct au clic — retour utilisateur) : voir
  // atelierSlotInteractions.js. Reinitialise automatiquement en changeant de
  // page/mise en page grace a `key` (voir l'appelant, AtelierLayoutPanel) —
  // jamais un effet qui observerait slotItems (nouvelle reference a CHAQUE
  // rendu du parent, meme sans changement reel : aurait desarme la
  // confirmation en permanence, avant meme le second clic).
  const [pendingRemoveIndex, setPendingRemoveIndex] = useState(null);

  // Meme correction que AtelierPageOverlay.js (retour utilisateur : "il doit
  // disparaitre quand je clique ailleurs meme en dehors du livre") — un clic
  // dont la cible n'est pas a l'interieur d'un emplacement de CETTE
  // miniature annule la confirmation en attente.
  useEffect(() => {
    if (pendingRemoveIndex == null) return undefined;
    function handleOutsideClick(event) {
      if (!event.target.closest('.atelier-format-slot')) setPendingRemoveIndex(null);
    }
    document.addEventListener('click', handleOutsideClick);
    return () => document.removeEventListener('click', handleOutsideClick);
  }, [pendingRemoveIndex]);

  const { handleDrop, handleClick } = makeSlotHandlers({
    onAssignSlot,
    onRemoveSlot,
    selectedSidebarItem,
    pendingRemoveIndex,
    onRequestRemove: setPendingRemoveIndex,
    onCancelRemove: () => setPendingRemoveIndex(null)
  });

  return (
    <div className="atelier-format-miniature" style={{ aspectRatio: `${dims.widthMm} / ${dims.heightMm}` }}>
      <div
        className="atelier-format-miniature-inset"
        style={{
          top: `${OVERLAY_CONTENT_INSET_PCT.top}%`,
          left: `${OVERLAY_CONTENT_INSET_PCT.left}%`,
          right: `${OVERLAY_CONTENT_INSET_PCT.right}%`,
          bottom: `${OVERLAY_CONTENT_INSET_PCT.bottom}%`
        }}
      >
        {layout.slots.map((slotType, index) => {
          const item = slotItems[index] || null;
          // Repli plein-cadre si jamais un slug manquait sa geometrie
          // (aujourd'hui aucun cas : les 14 mises en page de l'atelier ont
          // toutes une entree dans atelierLayoutGeometry.js) — jamais un
          // emplacement invisible/inutilisable pour autant.
          const rect = (geometry && geometry[index]) || { top: 0, left: 0, width: 100, height: 100 };
          const rejects = Boolean(selectedSidebarItem && !slotAcceptsItem(slotType, selectedSidebarItem));
          const isPending = pendingRemoveIndex === index;
          return (
            <div
              key={index}
              className={`atelier-format-slot ${item ? 'is-filled' : ''} ${rejects ? 'is-rejecting' : ''} ${isPending ? 'is-pending-remove' : ''}`}
              style={{ top: `${rect.top}%`, left: `${rect.left}%`, width: `${rect.width}%`, height: `${rect.height}%` }}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => handleDrop(event, index)}
              onClick={() => handleClick(index, item)}
              title={item ? (isPending ? 'Cliquer a nouveau pour confirmer le retrait' : 'Cliquer pour retirer') : undefined}
            >
              {item ? (
                isPending ? (
                  <span className="atelier-format-slot-confirm">Confirmer le retrait ?</span>
                ) : (
                  <>
                    <span className="atelier-format-slot-check" aria-hidden="true">✓</span>
                    <span className="atelier-format-slot-remove" aria-hidden="true">Retirer</span>
                  </>
                )
              ) : (
                <span className="atelier-format-slot-empty-label">{SLOT_LABELS[slotType] || 'Emplacement'}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AtelierLayoutPanel({
  activeCategory,
  onSelectCategory,
  draftLayoutSlug,
  onChooseLayout,
  slotItems,
  onAssignSlot,
  onRemoveSlot,
  onChangeFormat,
  selectedSidebarItem,
  onClearPage,
  hasContent,
  saveStatus,
  saveError,
  printFormat,
  currentPageIndex
}) {
  const draftLayout = ATELIER_LAYOUTS.find((layout) => layout.slug === draftLayoutSlug) || null;
  const galleryLayouts = activeCategory ? layoutsByCategory(activeCategory) : ATELIER_LAYOUTS;

  // Retrait a deux temps pour "Vider cette page" (retour utilisateur :
  // "ajouter une confirmation ou un undo visible" — meme principe deja
  // etabli pour le retrait d'un seul emplacement, voir LayoutFormatMiniature/
  // atelierSlotInteractions.js, applique ici a l'action globale de la page).
  // Reinitialise en changeant de page (currentPageIndex) pour ne jamais
  // laisser une confirmation armee "suivre" sur une autre page.
  const [pendingClear, setPendingClear] = useState(false);
  useEffect(() => { setPendingClear(false); }, [currentPageIndex]);

  return (
    <aside className="atelier-layout-panel">
      <div className="atelier-layout-panel-head">
        <span className="atelier-layout-panel-title">Mise en page</span>
        {saveStatus && saveStatus !== 'idle' && (
          <span className={`atelier-save-status is-${saveStatus}`}>
            {saveStatus === 'saving' ? 'Enregistrement...' : saveStatus === 'saved' ? '✓ Enregistre' : "Erreur d'enregistrement"}
          </span>
        )}
      </div>

      {!draftLayout ? (
        <>
          <p className="atelier-layout-question">Que souhaitez-vous mettre sur cette page ?</p>
          <div className="atelier-category-list">
            {ATELIER_CATEGORIES.map((category) => (
              <button
                key={category.id}
                type="button"
                className={`atelier-category-btn ${activeCategory === category.id ? 'is-active' : ''}`}
                onClick={() => onSelectCategory(activeCategory === category.id ? null : category.id)}
              >
                <span className="atelier-category-icon" aria-hidden="true">{category.icon}</span>
                {category.label}
              </button>
            ))}
          </div>
          <FormatGallery layouts={galleryLayouts} selectedSlug={draftLayoutSlug} onChoose={onChooseLayout} />
        </>
      ) : (
        <>
          <div className="atelier-layout-chosen">
            <p className="atelier-layout-chosen-label">{draftLayout.label}</p>
            <button type="button" className="atelier-layout-change-btn" onClick={() => onChangeFormat()}>
              Changer de mise en page
            </button>
          </div>

          <LayoutFormatMiniature
            key={`${currentPageIndex}-${draftLayout.slug}`}
            layout={draftLayout}
            slotItems={slotItems}
            printFormat={printFormat}
            selectedSidebarItem={selectedSidebarItem}
            onAssignSlot={onAssignSlot}
            onRemoveSlot={onRemoveSlot}
          />

          {saveError && <div className="wizard-error">{saveError}</div>}

          {hasContent && (
            pendingClear ? (
              <div className="atelier-clear-confirm">
                <button
                  type="button"
                  className="btn btn-outline atelier-clear-btn is-pending"
                  onClick={() => { setPendingClear(false); onClearPage(); }}
                >
                  Confirmer : vider la page ?
                </button>
                <button type="button" className="atelier-clear-cancel" onClick={() => setPendingClear(false)}>
                  Annuler
                </button>
              </div>
            ) : (
              <button type="button" className="btn btn-outline atelier-clear-btn" onClick={() => setPendingClear(true)}>
                Vider cette page
              </button>
            )
          )}
        </>
      )}
    </aside>
  );
}

export default AtelierLayoutPanel;
