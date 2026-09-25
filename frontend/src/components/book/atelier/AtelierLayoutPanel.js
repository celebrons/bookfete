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

// Repere "photo" dessine dans les emplacements image de la vignette. A cette
// taille (une case fait parfois 12 px de haut) un pictogramme detaille
// deviendrait une tache : deux formes pleines seulement, une colline et un
// soleil, qui restent lisibles tres petit.
function MiniPhotoGlyph() {
  return (
    <svg className="atelier-layout-mini-glyph" viewBox="0 0 16 12" aria-hidden="true" focusable="false">
      <circle cx="11.6" cy="3.4" r="1.7" />
      <path d="M0 12 L5 4.6 L8.7 9.4 L11.2 6.6 L16 12 Z" />
    </svg>
  );
}

// Vignette d'une mise en page dans la galerie de choix.
//
// REECRITE le 2026-09-13 (retour utilisateur, capture a l'appui : "on dirait
// deux emplacements photos identiques"). Elle avait deux defauts, et le
// second etait le plus trompeur :
//
//  1. photo et texte ne differaient que par une nuance de beige (#d3c6a6 vs
//     #cbbfa5) — indiscernable. Ils se distinguent maintenant par la FORME :
//     un aplat avec un repere photo, contre un bloc clair raye de lignes de
//     texte. C'est le contraste qui porte l'information, pas la teinte.
//  2. surtout, elle n'utilisait PAS la geometrie reelle : les emplacements
//     etaient empiles en flex a des tailles a peu pres egales. "Grande photo,
//     petite legende" (82% / 14% dans le rendu reel) s'affichait donc en deux
//     blocs de meme taille, ce qui decrivait une autre mise en page que celle
//     qu'on allait obtenir. Elle lit desormais LAYOUT_GEOMETRY, exactement
//     comme l'incrustation posee sur la page et comme LayoutFormatMiniature
//     plus bas — une seule source de verite sur la disposition.
//
// Effet de bord : la table INLINE_TEXT_LAYOUTS a disparu. Elle corrigeait a la
// main le cas des temoignages cote a cote ; la geometrie reelle le decrit
// deja (TWO_TESTIMONIES/THREE_TESTIMONIES sont en colonnes), donc la
// rustine n'a plus lieu d'etre.
function LayoutMiniPreview({ slug, slots, printFormat, spread }) {
  const geometry = getOverlayGeometry(slug);
  const dims = FORMAT_DIMENSIONS_MM[printFormat] || FORMAT_DIMENSIONS_MM.standard;

  // Double page : la vignette doit montrer ce qu'on obtient, c'est-a-dire UNE
  // image a cheval sur DEUX pages. La montrer comme une page seule
  // decrirait une autre mise en page (retour utilisateur 2026-09-14) — le
  // meme defaut que celui corrige sur "Grande photo, petite legende".
  // Deux pages cote a cote, l'image par-dessus (fond perdu, comme au rendu),
  // et un trait de pli au milieu pour que la double page se lise d'un coup.
  if (spread) {
    return (
      <div
        className="atelier-layout-mini is-spread"
        style={{ aspectRatio: `${dims.widthMm * 2} / ${dims.heightMm}` }}
      >
        <span className="atelier-layout-mini-slot is-photo atelier-layout-mini-bleed">
          <MiniPhotoGlyph />
        </span>
        <span className="atelier-layout-mini-fold" aria-hidden="true" />
      </div>
    );
  }

  // Repli pour un slug sans geometrie : un empilement regulier. Aucun cas
  // aujourd'hui, mais une vignette vide serait pire qu'une vignette
  // approximative.
  const fallbackRect = (index) => {
    const h = 100 / slots.length;
    return { top: index * h, left: 0, width: 100, height: h - 2 };
  };

  return (
    <div className="atelier-layout-mini" style={{ aspectRatio: `${dims.widthMm} / ${dims.heightMm}` }}>
      <div
        className="atelier-layout-mini-inset"
        style={{
          top: `${OVERLAY_CONTENT_INSET_PCT.top}%`,
          left: `${OVERLAY_CONTENT_INSET_PCT.left}%`,
          right: `${OVERLAY_CONTENT_INSET_PCT.right}%`,
          bottom: `${OVERLAY_CONTENT_INSET_PCT.bottom}%`
        }}
      >
        {slots.map((type, index) => {
          const rect = (geometry && geometry[index]) || fallbackRect(index);
          return (
            <span
              key={index}
              className={`atelier-layout-mini-slot is-${type}`}
              style={{
                top: `${rect.top}%`,
                left: `${rect.left}%`,
                width: `${rect.width}%`,
                height: `${rect.height}%`
              }}
            >
              {type === 'photo' ? <MiniPhotoGlyph /> : null}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function FormatGallery({ layouts, selectedSlug, onChoose, printFormat }) {
  return (
    <div className="atelier-format-grid">
      {layouts.map((layout) => (
        <button
          key={layout.slug}
          type="button"
          className={`atelier-format-option ${selectedSlug === layout.slug ? 'is-selected' : ''}`}
          onClick={() => onChoose(layout.slug)}
        >
          <LayoutMiniPreview
            slug={layout.slug}
            slots={layout.slots}
            printFormat={printFormat}
            spread={layout.spread}
          />
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
              onDrop={(event) => handleDrop(event, index, slotType)}
              onClick={() => handleClick(index, item, slotType)}
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
  saveStatus,
  saveError,
  printFormat,
  currentPageIndex,
  // Slugs REELLEMENT presents dans layout_definitions (charges par
  // BookAtelierLuxe depuis /api/catalog/layouts). ATELIER_LAYOUTS est un
  // catalogue statique : proposer une mise en page que la base ne connait pas
  // affiche un bouton qui echoue a l'enregistrement ("mise en page
  // introuvable"), sans que rien n'explique pourquoi. C'est exactement ce qui
  // arrive entre l'ajout d'un layout et l'execution de sa migration SQL
  // (2026-09-13, TWO_PHOTOS_STACKED). Non fourni -> aucun filtre, comportement
  // d'avant.
  availableSlugs,
  // Une double page exige une page EN FACE. La page 1 est seule a droite et
  // la derniere page peut tomber a gauche : dans ces deux cas le format
  // "1 photo sur double page" n'a aucun sens, et le proposer produisait une
  // demi-photo orpheline — defaut constate sur le premier livre imprime
  // (2026-09-25). Non fourni -> on le propose, comportement d'avant.
  doublePagePossible = true
}) {
  const isAvailable = (slug) => (
    (!availableSlugs || availableSlugs.has(slug))
    && (doublePagePossible || !ATELIER_LAYOUTS.find((layout) => layout.slug === slug)?.spread)
  );
  const draftLayout = ATELIER_LAYOUTS.find((layout) => layout.slug === draftLayoutSlug) || null;
  const galleryLayouts = (activeCategory ? layoutsByCategory(activeCategory) : ATELIER_LAYOUTS)
    .filter((layout) => isAvailable(layout.slug));

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
          <FormatGallery
            layouts={galleryLayouts}
            selectedSlug={draftLayoutSlug}
            onChoose={onChooseLayout}
            printFormat={printFormat}
          />
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

          {/* "Vider cette page" et "Position dans le livre" ne sont plus ici :
              ils sont passes en pictogrammes au coin bas droit de la page
              elle-meme (AtelierPageActions, 2026-09-13). Ce panneau sert a
              COMPOSER ; ce qui AGIT SUR la page vit sur la page, comme l'oeil
              "voir a l'echelle" deja pose a son coin haut droit. */}
        </>
      )}
    </aside>
  );
}

export default AtelierLayoutPanel;
