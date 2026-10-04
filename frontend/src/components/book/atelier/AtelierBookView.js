import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageZoomStage, ZoomControls } from '../../common/PageZoomStage';
import FadeInFrame from '../../common/FadeInFrame';

// Colonne centrale de l'atelier : le livre sous forme de vraies pages, en
// double-page — feuilletage COUVERTURE -> pages interieures -> 4E DE
// COUVERTURE (cahier des charges §11 : les couvertures restent gerees par
// leur systeme dedie, jamais traitees comme des pages ordinaires, mais on
// peut les feuilleter ici comme le reste du livre).
//
// Chaque page affichee est un iframe pointant sur le rendu serveur reel
// (meme moteur que le PDF final, voir compositionApi.fetchInteriorPagePreviewHtml/
// fetchCoverPreviewHtml) : jamais une maquette cote client — l'utilisateur
// voit exactement ce qu'il obtiendra. Le plateau de travail, lui, affiche
// les pages retassees pour tenir dans l'espace disponible (partage avec les
// colonnes gauche/droite) — pas a l'echelle reelle d'impression. Le bouton
// "Prévisualiser" (barre de navigation, toujours visible) ouvre le meme
// contenu (meme srcDoc, aucun nouvel appel reseau) dans un calque plein
// ecran base sur PageZoomStage (voir common/PageZoomStage.js) : le livre
// garde TOUJOURS ses vraies proportions, mis a l'echelle automatiquement
// pour remplir l'espace disponible (jamais de scrollbar, jamais deforme),
// avec un zoom/panoramique libre par-dessus cet ajustement — refonte
// complete du 2026-09-09 ("cahier des charges REFONTE UX DES APERCUS"), qui
// remplace l'ancienne mecanique "taille reelle stricte + defilement" (voir
// l'historique detaille dans PageZoomStage.js et la memoire du projet).

function ExpandIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 9V4h5" />
      <path d="M20 9V4h-5" />
      <path d="M4 15v5h5" />
      <path d="M20 15v5h-5" />
    </svg>
  );
}

// Calque cliquable pose sur la couverture/4e de couverture (retour
// utilisateur, 2026-09-10 : "permettre de modifier la photo... en cliquant
// sur l'image... idealement modifier directement sur les pages") — meme
// principe que AtelierPageOverlay.js pour les pages interieures (selection
// dans "Mes souvenirs" puis clic pour assigner), mais un seul grand
// emplacement (toute la page), pas une grille de slots. L'iframe en dessous
// a pointer-events:none (BookAtelierLuxe.css), le clic passe donc
// naturellement a travers jusqu'ici.
// `hasPhotoSlot` : le gabarit choisi pour cette face contient-il seulement
// une photo (retour utilisateur, 2026-09-26 : "si le template contient une
// photo") ? Un texte-seul (COVER_MINIMAL/BACK_MINIMAL/BACK_STATS) n'a pas
// d'emplacement photo du tout — sans ce garde, le calque proposait quand
// meme "cliquer pour choisir une photo" sur un gabarit qui n'en affiche
// jamais aucune. Absent (undefined) -> true, pour ne rien casser d'un
// appelant qui ne le passerait pas.
function CoverPhotoOverlay({
  onAssign, selectedSidebarItem, onAdjust, hasPhoto, onOpenPicker, onRemove, hasPhotoSlot = true,
  // Retour utilisateur (2026-10-04) : un emplacement VIDE ne doit pas aller
  // directement choisir une photo — proposer d'abord "changer de mise en
  // page" (ce gabarit ne convient peut-etre pas), "choisir une photo" reste
  // juste en dessous. Facultatif : absent, seul "choisir une photo" reste
  // affiche (comportement d'avant).
  onOpenLayout
}) {
  const { t } = useTranslation('atelier');
  if (!onAssign || !hasPhotoSlot) return null;
  const isPhotoSelected = selectedSidebarItem?.kind === 'photo';
  const isEmptyIdle = !hasPhoto && !isPhotoSelected;
  // Meme mecanique qu'un emplacement de page interieure vide (retour
  // utilisateur, 2026-09-26 : "les photos seront gerees comme sur les
  // pages, en cliquant a l'interieur de la page couverture... cela va
  // ouvrir la fenetre directement pour choisir") — voir AtelierPageOverlay.js
  // et AtelierPhotoPickerModal.js, meme fenetre reutilisee ici.
  // « Quand je clique sur la photo en couverture il se passe rien » (retour
  // utilisateur, 2026-09-26) : ce calque ne reagissait qu'au clic PRECIS sur
  // le petit bouton "Ajuster le cadrage" (revele au survol) quand une photo
  // etait deja en place — le reste de l'image, la zone la plus evidente a
  // cliquer, ne faisait rien. Sur une page interieure, cliquer N'IMPORTE OU
  // sur une photo deja placee ouvre l'ajustement (voir AtelierPageOverlay.js,
  // meme priorite). Corrige pour la meme mecanique ici : le clic sur
  // l'ensemble du calque ouvre l'ajustement des qu'une photo est en place,
  // le bouton dedie reste EN PLUS (visible au survol), pas le seul chemin.
  // Pas de pastille de texte pour le cas "photo deja en place" : le bouton
  // "Ajuster le cadrage" (revele au survol, juste en dessous) porte deja ce
  // message — en afficher un second, superpose au meme endroit, ferait
  // double emploi plutot que d'aider.
  // Emplacement VIDE, rien de selectionne : l'ancien hint unique ("cliquer
  // pour choisir une photo") cede la place au menu a deux lignes ci-dessous
  // — plus de texte de hint ici, pour ne pas le doubler.
  const hint = isPhotoSelected
    ? t('bookView.coverPhotoOverlay.useThisPhoto')
    : null;
  return (
    <div
      className={`atelier-cover-photo-overlay ${isPhotoSelected ? 'is-armed' : ''}`}
      onClick={(event) => {
        event.stopPropagation();
        if (isPhotoSelected) { onAssign(selectedSidebarItem.id); return; }
        if (hasPhoto) { if (onAdjust) onAdjust(); return; }
        if (onOpenPicker) onOpenPicker();
      }}
      title={hint || undefined}
    >
      {hint && <span className="atelier-cover-photo-overlay-hint">{hint}</span>}
      {/* Menu a deux lignes sur un emplacement VIDE (retour utilisateur,
          2026-10-04 : "proposer choisir une mise en page, on garde choisir
          photo de couverture") — le clic sur le fond du calque ouvre quand
          meme directement le choix de photo (repli pratique, glisser-deposer
          inchange), ces deux boutons rendent le detour par "mise en page"
          visible sans avoir a deviner la barre d'outils. */}
      {isEmptyIdle && (
        <div className="atelier-cover-empty-menu">
          {onOpenLayout && (
            <button
              type="button"
              className="atelier-cover-empty-menu-btn"
              onClick={(event) => { event.stopPropagation(); onOpenLayout(); }}
            >
              {t('bookView.coverPhotoOverlay.chooseLayout')}
            </button>
          )}
          <button
            type="button"
            className="atelier-cover-empty-menu-btn is-primary"
            onClick={(event) => { event.stopPropagation(); if (onOpenPicker) onOpenPicker(); }}
          >
            {t('bookView.coverPhotoOverlay.clickToChoosePhoto')}
          </button>
        </div>
      )}
      {/* Deux actions distinctes sur une photo deja en place : la remplacer
          par une AUTRE, ou ajuster son cadrage — des BOUTONS a part, pas un
          clic sur l'image (qui ouvre deja l'ajustement, voir plus haut).
          "Changer la photo" manquait jusqu'ici (retour utilisateur,
          2026-09-26 : "comment je fais si je veux changer la photo ?") — le
          seul chemin restait indirect (choisir dans "Mes souvenirs" PUIS
          cliquer l'image, ou Retirer PUIS recliquer). Meme fenetre que pour
          un cadre vide (AtelierPhotoPickerModal via onOpenPicker), juste
          declenchee depuis un cadre DEJA rempli cette fois. */}
      {hasPhoto && !isPhotoSelected && (
        <div className="atelier-cover-photo-actions">
          {onOpenPicker && (
            <button
              type="button"
              className="atelier-cover-action-btn"
              onClick={(event) => { event.stopPropagation(); onOpenPicker(); }}
              title={t('bookView.coverPhotoOverlay.changePhotoTitle')}
            >
              <ChangeIcon />
              {t('bookView.coverPhotoOverlay.changePhoto')}
            </button>
          )}
          {onAdjust && (
            <button
              type="button"
              className="atelier-cover-action-btn"
              onClick={(event) => { event.stopPropagation(); onAdjust(); }}
              title={t('bookView.coverPhotoOverlay.adjustTitle')}
            >
              <CropIcon />
              {t('bookView.coverPhotoOverlay.adjust')}
            </button>
          )}
        </div>
      )}
      {/* Revenir a "Automatique" (laisser Bookipix choisir) — l'ancien
          panneau "Mise en page" offrait ce choix via une pastille dediee,
          disparue avec la galerie de photos qu'il portait (retour
          utilisateur, 2026-09-26). Sans cette croix, une photo choisie a la
          main serait impossible a "deselectionner" : on ne pourrait plus
          que la remplacer par une AUTRE photo precise, jamais revenir au
          choix automatique. Coin oppose au bouton d'ajustement pour ne
          jamais se chevaucher. */}
      {onRemove && hasPhoto && !isPhotoSelected && (
        <button
          type="button"
          className="atelier-cover-remove-btn"
          onClick={(event) => { event.stopPropagation(); onRemove(); }}
          title={t('bookView.coverPhotoOverlay.resetToAuto')}
          aria-label={t('bookView.coverPhotoOverlay.resetToAuto')}
        >
          <XIcon />
        </button>
      )}
    </div>
  );
}

function XIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
      <path d="M5 5L19 19M19 5L5 19" />
    </svg>
  );
}

function CropIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6.5 2v13.5A1.5 1.5 0 0 0 8 17h13.5" />
      <path d="M2.5 6.5H16A1.5 1.5 0 0 1 17.5 8v13.5" />
    </svg>
  );
}

function ChangeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="14" height="14" rx="2" />
      <path d="M8 12l2.5 2.5L15 10" />
      <path d="M21 8v6a2 2 0 0 1-2 2h-2" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1.5 12S5 5 12 5s10.5 7 10.5 7-3.5 7-10.5 7S1.5 12 1.5 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

// isSelected = "c'est la page en cours de modification" (celle que
// draftLayoutSlug/draftSlotItemIds decrivent). Differenciation forte
// deliberee (badge + assombrissement de l'autre page) pour qu'il soit
// impossible de deposer par erreur sur la mauvaise page d'un double-page.
function PagePane({ html, pageLabel, isSelected, onSelect, selectable, overlay, aspectRatio, onExpand, actions }) {
  const { t } = useTranslation('atelier');
  const isInactive = selectable && !isSelected;
  return (
    <div
      className={`atelier-page-pane ${selectable ? 'is-selectable' : ''} ${isSelected ? 'is-selected' : ''} ${isInactive ? 'is-inactive' : ''}`}
      onClick={selectable ? onSelect : undefined}
      title={isInactive ? t('bookView.clickToEditPage') : undefined}
      style={aspectRatio ? { aspectRatio } : undefined}
    >
      {html ? (
        <iframe title={pageLabel} srcDoc={html} className="atelier-page-frame" />
      ) : (
        <div className="atelier-page-placeholder" />
      )}
      {/* "Voir a l'echelle", pose sur LA PAGE et non sur le plateau.
          Auparavant il vivait au coin haut droit de .atelier-book-stage :
          en double-page, ce coin est celui de la page de DROITE, donc loin
          de la page qu'on est en train de modifier — et hors champ des que
          la colonne centrale rogne le plateau. L'utilisateur ne le trouvait
          plus ("l'oeil de l'apercu en haut de page n'apparait tjrs pas").
          Ici il est toujours sur la page regardee. */}
      {onExpand && html && (
        <button
          type="button"
          className="atelier-book-stage-eye"
          onClick={(event) => { event.stopPropagation(); onExpand(); }}
          title={t('bookView.previewTitle')}
          aria-label={t('bookView.preview')}
        >
          <EyeIcon />
        </button>
      )}
      {overlay}
      {/* Actions sur la page (deplacer / vider) — coin bas droit, en
          vis-a-vis de l'oeil. Uniquement sur la page en cours de
          modification : les poser sur les deux pages d'un double-page
          encombrerait pour rien et rendrait ambigu ce sur quoi elles
          agissent. */}
      {selectable && isSelected && actions}
      {/* Le badge "Vous modifiez cette page" a disparu (refonte 2026-09-26,
          §1 : "l'utilisateur sait qu'il est en train de modifier la page") —
          le fin contour or de .is-selected suffit desormais a le montrer,
          sans texte permanent superpose au livre. */}
      {isInactive && (
        <span className="atelier-page-pane-inactive-hint">{t('bookView.clickToEdit')}</span>
      )}
      <span className="atelier-page-pane-label">{pageLabel}</span>
    </div>
  );
}

// Alignees sur backend/services/composition/coverFormat.js (COVER_FORMATS)
// — a garder synchronisees a la main si l'un des deux change. "Voir a
// l'echelle" n'a de sens que si les PROPORTIONS affichees sont celles du
// format choisi — un livret affiche avec les proportions d'un standard
// serait trompeur, pas juste approximatif.
// 2026-09-09 : realigne sur le catalogue reel Gelato — voir le commentaire
// d'en-tete de backend/services/composition/coverFormat.js (source de
// verite) pour le detail. Luxe partage desormais le meme gabarit que
// Standard (21x28cm) — seule la couverture (rigide) differe.
const FORMAT_DIMENSIONS_MM = {
  livret: { widthMm: 200, heightMm: 200 }, // carre, voir coverFormat.js
  standard: { widthMm: 210, heightMm: 280 },
  luxe: { widthMm: 210, heightMm: 280 }
};

// Conversion physique standard (96dpi de reference) — sert uniquement a
// donner a PageZoomStage des dimensions de CONTENU coherentes entre elles
// (le rapport largeur/hauteur compte, pas la justesse physique a l'ecran :
// voir le renommage "Voir a l'echelle", cahier des charges §3 — "22cm CSS
// ne correspond pas forcement a 22cm physiques selon le DPI de l'ecran").
const PX_PER_MM = 96 / 25.4;

// Interstice entre les deux pages d'une double-page — sert aussi de largeur
// a la "tranche" decorative (.atelier-zoom-spine) qui simule la reliure.
const SPREAD_GAP_PX = 16;

function AtelierBookView({
  viewKind, // 'cover' | 'spread' | 'back-cover'
  loading,
  singleHtml,
  leftHtml,
  rightHtml,
  leftPageNumber,
  rightPageNumber,
  totalPages,
  selectedSide,
  onSelectSide,
  onPrevious,
  onNext,
  canGoPrevious,
  canGoNext,
  navLabel,
  // Sauts directs couverture/4e (retour utilisateur, 2026-09-29) — facultatifs :
  // absents, les boutons ne s'affichent simplement pas (repli neutre, comme
  // partout ailleurs dans ce composant).
  onGoToCover,
  onGoToBackCover,
  // Incrustation de glisser-deposer directe (voir AtelierPageOverlay) —
  // n'affiche jamais que sur le cote actuellement selectionne : c'est lui
  // seul que draftLayoutSlug/draftSlotItemIds (BookAtelierLuxe.js)
  // decrivent, deposer sur l'autre cote modifierait la mauvaise page.
  overlay,
  // Actions posees sur la page en cours de modification (deplacer / vider) —
  // voir AtelierPageActions. Un noeud deja construit par l'appelant, comme
  // `overlay` : cette vue ne connait pas ces mecaniques, elle leur donne
  // seulement une place.
  pageActions,
  // Format d'impression choisi (book.print_format) : determine les vraies
  // proportions affichees par "Voir a l'echelle" — absent ou inconnu replie
  // sur "standard", jamais une erreur.
  printFormat,
  // Assignation directe de la photo de couverture/4e en cliquant sur l'image
  // (voir CoverPhotoOverlay ci-dessus) — absent -> aucun calque affiche
  // (repli neutre, ex. si jamais utilise sans cette fonctionnalite branchee).
  onAssignCoverPhoto,
  // Recadrage de la photo de couverture (facultatif : sans lui, aucun bouton
  // n'apparait et le comportement d'avant est inchange).
  onAdjustCoverPhoto,
  coverHasPhoto,
  // Ouvre la fenetre de choix (AtelierPhotoPickerModal, partagee avec les
  // pages interieures) au clic sur un cadre VIDE — retour utilisateur,
  // 2026-09-26. Facultatif : sans lui, un clic sur un cadre vide ne fait
  // rien (repli neutre).
  onOpenCoverPhotoPicker,
  // Le gabarit choisi contient-il une photo, pour CHAQUE face — voir
  // CoverPhotoOverlay. Absents -> true (repli neutre, le calque reste actif
  // comme avant pour un appelant qui ne les passerait pas).
  frontHasPhotoSlot,
  backHasPhotoSlot,
  selectedSidebarItem,
  // Ouvre le tiroir "Mise en page" (AtelierCoverPanel pour la couverture/4e)
  // — voir CoverPhotoOverlay. Facultatif : sans lui, seul "choisir une
  // photo" apparait sur un emplacement vide (repli neutre).
  onOpenLayoutDrawer
}) {
  const { t } = useTranslation('atelier');
  const [isFullscreenOpen, setIsFullscreenOpen] = useState(false);
  const [zoom, setZoom] = useState('fit');
  const formatDimensions = FORMAT_DIMENSIONS_MM[printFormat] || FORMAT_DIMENSIONS_MM.standard;
  // Meme ratio que "Voir a l'echelle", applique cette fois au plateau
  // reduit (.atelier-page-pane) : le rendu de la page (pageRenderer.js)
  // s'etire toujours en 100vw/100vh dans son iframe, donc c'est la forme de
  // CE conteneur qui doit porter le vrai ratio du format choisi, sinon le
  // plateau parait identique quel que soit le format (meme bug que l'Apercu
  // final, corrige ici pour rester coherent).
  const pageAspectRatio = `${formatDimensions.widthMm} / ${formatDimensions.heightMm}`;

  // Echap pour fermer + bloque le defilement de la page derriere, meme
  // principe deja etabli pour AtelierGenerateModal/l'ancienne loupe de
  // BookCoverDesignerLuxe.js. Masque aussi l'en-tete global (retour
  // utilisateur : "ça fait gagner de l'espace") via une classe sur <body>
  // (voir Layout.css : body.has-fullscreen-viewer .site-header) — l'en-tete
  // vit tout en haut de l'arbre (Layout.js, hors de portee directe d'ici),
  // c'est le seul point d'accroche simple sans faire remonter un etat React
  // jusque-la pour un besoin purement cosmetique.
  useEffect(() => {
    if (!isFullscreenOpen) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setIsFullscreenOpen(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.body.classList.add('has-fullscreen-viewer');
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      document.body.classList.remove('has-fullscreen-viewer');
    };
  }, [isFullscreenOpen]);

  const hasContentToExpand = viewKind === 'spread' ? Boolean(leftHtml || rightHtml) : Boolean(singleHtml);

  // Dimensions NATURELLES (mm -> px) transmises a PageZoomStage — c'est LUI
  // qui calcule l'echelle d'ajustement et l'applique globalement (voir
  // common/PageZoomStage.js). Une double-page complete additionne les deux
  // pages ET l'interstice entre elles : PageZoomStage doit connaitre la
  // largeur REELLE du duo pour calculer un ajustement correct, pas juste
  // celle d'une page.
  const pageWidthPx = formatDimensions.widthMm * PX_PER_MM;
  const pageHeightPx = formatDimensions.heightMm * PX_PER_MM;
  const isSpreadWithBothPages = viewKind === 'spread' && leftPageNumber != null && rightPageNumber != null;
  const contentWidthPx = isSpreadWithBothPages ? pageWidthPx * 2 + SPREAD_GAP_PX : pageWidthPx;
  const contentHeightPx = pageHeightPx;
  // Boite de REFERENCE pour l'ajustement "fit" — TOUJOURS celle d'une
  // double-page complete, meme sur la couverture/4e ou un premier/dernier
  // feuillet solitaire (retour utilisateur, 2026-09-26 : "une seule page est
  // affichee en tres grand, tres contrastant avec la double page"). Voir le
  // commentaire de PageZoomStage.js pour le calcul complet.
  const fitWidthPx = pageWidthPx * 2 + SPREAD_GAP_PX;
  const fitHeightPx = pageHeightPx;

  // Cle de remontage : change a chaque page/vue differente, pour (1)
  // reinitialiser le panoramique (PageZoomStage.resetPanKey, voir ce
  // fichier) et (2) rejouer la transition douce d'apparition
  // (.atelier-zoom-page-change, cahier des charges §7 "transition douce
  // lors du changement de page").
  const pageChangeKey = viewKind === 'spread' ? `spread-${leftPageNumber}-${rightPageNumber}` : viewKind;

  return (
    <div className="atelier-book-view">
      <div className="atelier-book-stage">
        {/* Le raccourci "Prévisualiser" (retour utilisateur : "un petit
            oeil sur le coin haut droit du livre") est desormais rendu DANS
            chaque page (voir PagePane) plutot qu'ici, au coin du plateau —
            voir le commentaire de PagePane pour la raison. Le bouton
            permanent de la barre de navigation ci-dessous reste inchange :
            deux acces au meme calque, l'un explicite en bas, l'un rapide et
            discret sur la page elle-meme. */}

        {loading && <p className="atelier-hint atelier-book-loading">{t('bookView.loadingPage')}</p>}

        {viewKind === 'cover' && (
          <PagePane
            html={singleHtml}
            pageLabel={t('bookView.coverLabel')}
            selectable={false}
            aspectRatio={pageAspectRatio}
            onExpand={() => setIsFullscreenOpen(true)}
            overlay={(
              <CoverPhotoOverlay
                onAssign={onAssignCoverPhoto ? (itemId) => onAssignCoverPhoto('front', itemId) : null}
                selectedSidebarItem={selectedSidebarItem}
                onAdjust={onAdjustCoverPhoto ? () => onAdjustCoverPhoto('front') : null}
                hasPhoto={coverHasPhoto}
                onOpenPicker={onOpenCoverPhotoPicker ? () => onOpenCoverPhotoPicker('front') : null}
                onRemove={onAssignCoverPhoto ? () => onAssignCoverPhoto('front', null) : null}
                hasPhotoSlot={frontHasPhotoSlot}
                onOpenLayout={onOpenLayoutDrawer}
              />
            )}
          />
        )}

        {viewKind === 'back-cover' && (
          <PagePane
            html={singleHtml}
            pageLabel={t('bookView.backCoverLabel')}
            selectable={false}
            aspectRatio={pageAspectRatio}
            onExpand={() => setIsFullscreenOpen(true)}
            overlay={(
              <CoverPhotoOverlay
                onAssign={onAssignCoverPhoto ? (itemId) => onAssignCoverPhoto('back', itemId) : null}
                selectedSidebarItem={selectedSidebarItem}
                onAdjust={onAdjustCoverPhoto ? () => onAdjustCoverPhoto('back') : null}
                hasPhoto={coverHasPhoto}
                onOpenPicker={onOpenCoverPhotoPicker ? () => onOpenCoverPhotoPicker('back') : null}
                onRemove={onAssignCoverPhoto ? () => onAssignCoverPhoto('back', null) : null}
                hasPhotoSlot={backHasPhotoSlot}
                onOpenLayout={onOpenLayoutDrawer}
              />
            )}
          />
        )}

        {viewKind === 'spread' && (
          <div className="atelier-spread">
            {/* La page de GAUCHE peut manquer : au tout premier vis-a-vis,
                la page 1 s'ouvre seule a DROITE, face au contre-plat de la
                couverture — comme dans n'importe quel livre relie (voir
                utils/pageParity.js).
                On occupe quand meme sa place, avec le contre-plat nomme :
                sans rien, la page 1 se retrouvait centree et on ne
                comprenait pas pourquoi elle etait seule. La nommer explique
                du meme coup POURQUOI le livre commence a droite. */}
            {leftPageNumber == null && (
              <div className="atelier-page-pane is-contreplat" style={pageAspectRatio ? { aspectRatio: pageAspectRatio } : undefined}>
                <span className="atelier-page-pane-label">{t('bookView.insideCoverLabel')}</span>
              </div>
            )}
            {leftPageNumber != null && (
              <PagePane
                html={leftHtml}
                pageLabel={t('bookView.pageLabel', { number: leftPageNumber })}
                selectable
                isSelected={selectedSide === 'left'}
                onSelect={() => onSelectSide('left')}
                overlay={selectedSide === 'left' ? overlay : null}
                actions={pageActions}
                aspectRatio={pageAspectRatio}
                onExpand={() => setIsFullscreenOpen(true)}
              />
            )}
            {rightPageNumber != null && (
              <PagePane
                html={rightHtml}
                pageLabel={t('bookView.pageLabel', { number: rightPageNumber })}
                selectable
                isSelected={selectedSide === 'right'}
                onSelect={() => onSelectSide('right')}
                overlay={selectedSide === 'right' ? overlay : null}
                actions={pageActions}
                aspectRatio={pageAspectRatio}
                onExpand={() => setIsFullscreenOpen(true)}
              />
            )}
            {/* Symetrique du contre-plat ci-dessus : la DERNIERE page peut
                elle aussi etre seule (livre a nombre de pages pair), face au
                contre-plat de la 4e de couverture cette fois. Retour
                utilisateur, 2026-10-04, capture a l'appui : sans cet
                emplacement, la page seule etait le SEUL enfant flex de
                .atelier-spread et s'etirait donc sur toute la largeur du
                plateau — deux fois plus grande qu'une page normale,
                exactement le meme defaut que celui deja corrige pour la
                premiere page avant l'ajout du bloc ci-dessus. Purement
                visuel : n'affecte ni le nombre de pages ni le PDF envoye a
                l'impression (ce bloc ne touche a aucune donnee du livre). */}
            {rightPageNumber == null && leftPageNumber != null && (
              <div className="atelier-page-pane is-contreplat" style={pageAspectRatio ? { aspectRatio: pageAspectRatio } : undefined}>
                <span className="atelier-page-pane-label">{t('bookView.insideBackCoverLabel')}</span>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="atelier-book-nav">
        <div className="atelier-book-nav-side" aria-hidden="true" />
        {/* NAVIGATION ALLEGEE (refonte 2026-09-26, §4) : deux fleches fines
            et un numero, plus de gros boutons rectangulaires. Les sauts
            directs vers la couverture/4e ont un temps vecu UNIQUEMENT dans
            le tiroir "Pages" (AtelierPageFilmstrip) ; retour utilisateur,
            2026-09-29 (a la suite de la meme harmonisation sur Apercu
            final, capture a l'appui) : rejoignent desormais aussi cette
            barre, en icone seule (libelle dans l'infobulle uniquement) —
            memes emplacements et memes classes qu'Apercu final
            (.atelier-book-nav-jump/.atelier-realsize-jump, memes valeurs
            que .preview-final-nav-jump/.preview-final-realsize-jump). */}
        <div className="atelier-book-nav-controls">
          {onGoToCover && (
            <button
              type="button"
              className="atelier-book-nav-jump"
              onClick={onGoToCover}
              disabled={!canGoPrevious}
              title={t('bookView.goToCover')}
              aria-label={t('bookView.goToCover')}
            >
              ⇤
            </button>
          )}
          <button
            type="button"
            className="atelier-book-nav-arrow"
            onClick={onPrevious}
            disabled={!canGoPrevious}
            aria-label={t('bookView.previousPage')}
          >
            ‹
          </button>
          <span className="atelier-book-nav-label">
            {navLabel}{totalPages ? ` / ${totalPages}` : ''}
          </span>
          <button
            type="button"
            className="atelier-book-nav-arrow"
            onClick={onNext}
            disabled={!canGoNext}
            aria-label={t('bookView.nextPage')}
          >
            ›
          </button>
          {onGoToBackCover && (
            <button
              type="button"
              className="atelier-book-nav-jump"
              onClick={onGoToBackCover}
              disabled={!canGoNext}
              title={t('bookView.goToBackCover')}
              aria-label={t('bookView.goToBackCover')}
            >
              ⇥
            </button>
          )}
        </div>
        {/* Deplace hors du coin de page (retour utilisateur : "le rendre
            plus visible/permanent renforcerait la confiance avant Terminer
            mon livre") — reste maintenant a la meme place quelle que soit
            la vue (couverture/interieur/4e), au lieu de flotter par-dessus
            le contenu d'une seule page. */}
        <div className="atelier-book-nav-side atelier-book-nav-side-end">
          <button
            type="button"
            className="atelier-realsize-toggle-btn"
            onClick={() => setIsFullscreenOpen(true)}
            disabled={!hasContentToExpand}
            title={t('bookView.previewTitle')}
          >
            <ExpandIcon />
            <span>{t('bookView.preview')}</span>
          </button>
        </div>
      </div>

      {isFullscreenOpen && hasContentToExpand && (
        // Fermeture au clic n'importe ou DANS le calque (retour utilisateur :
        // "il faut qu'il disparaisse... lorsque je clique a cote", jusqu'ici
        // impossible car .atelier-realsize-panel stoppait la propagation et
        // occupait 100% du calque — cliquer "a cote" de la page revenait donc
        // toujours a cliquer DANS le panneau). Plus de stopPropagation nulle
        // part : un clic sur la page reelle elle-meme ne ferme jamais quand
        // meme, car c'est un <iframe> — son contenu est un document separe,
        // un clic dedans ne remonte jamais jusqu'ici (et un clic qui suit un
        // panoramique est avale par PageZoomStage lui-meme). La croix reste
        // geree en plus (redondant avec le clic sur le calque, mais
        // explicite/accessible).
        <div className="atelier-realsize-backdrop" onClick={() => setIsFullscreenOpen(false)}>
          {/* Pas de stopPropagation ICI (deliberement — voir le commentaire
              plus haut) : un clic sur le calque en dehors du livre doit
              toujours fermer, y compris sur l'espace vide autour du livre
              a l'interieur du plateau de zoom. Seuls les CONTROLES
              cliquables du bas (nav/zoom, ci-dessous) stoppent la
              propagation individuellement — sans ca, cliquer sur "Suivante"
              ou "+" fermerait aussi le calque. */}
          <div className="atelier-realsize-panel">
            <div className="atelier-realsize-head">
              <span>
                {navLabel} — {t('bookView.preview')}
                {/* Cahier des charges §3 : "taille reelle" est trompeur sur
                    ecran (22cm CSS != 22cm physiques selon le DPI) — cette
                    formule remplace l'ancien affichage brut des mm. */}
                <span className="atelier-realsize-hint"> · {t('bookView.dimensionsRespectedHint')}</span>
              </span>
              <button
                type="button"
                className="atelier-modal-close"
                onClick={() => setIsFullscreenOpen(false)}
                aria-label={t('bookView.close')}
              >
                ×
              </button>
            </div>

            <div className="atelier-realsize-stage-wrap">
              <PageZoomStage
                contentWidthPx={contentWidthPx}
                contentHeightPx={contentHeightPx}
                fitWidthPx={fitWidthPx}
                fitHeightPx={fitHeightPx}
                zoom={zoom}
                onZoomChange={setZoom}
                resetPanKey={pageChangeKey}
              >
                {viewKind === 'spread' ? (
                  <div className="atelier-zoom-spread atelier-zoom-page-change" key={pageChangeKey}>
                    {leftPageNumber != null && (
                      leftHtml ? (
                        <FadeInFrame title={t('bookView.pageLabel', { number: leftPageNumber })} srcDoc={leftHtml} className="atelier-zoom-frame" />
                      ) : (
                        <div className="atelier-page-placeholder" />
                      )
                    )}
                    {isSpreadWithBothPages && <span className="atelier-zoom-spine" aria-hidden="true" />}
                    {rightPageNumber != null && (
                      rightHtml ? (
                        <FadeInFrame title={t('bookView.pageLabel', { number: rightPageNumber })} srcDoc={rightHtml} className="atelier-zoom-frame" />
                      ) : (
                        <div className="atelier-page-placeholder" />
                      )
                    )}
                  </div>
                ) : (
                  <div className="atelier-zoom-single atelier-zoom-page-change" key={pageChangeKey}>
                    {singleHtml ? (
                      <FadeInFrame
                        title={viewKind === 'cover' ? t('bookView.coverLabel') : t('bookView.backCoverLabel')}
                        srcDoc={singleHtml}
                        className="atelier-zoom-frame"
                      />
                    ) : (
                      <div className="atelier-page-placeholder" />
                    )}
                  </div>
                )}
              </PageZoomStage>
            </div>

            {/* Naviguer/zoomer sans quitter le calque (retour utilisateur :
                "il faut des fleches pour naviguer lorsque on est dessus") —
                memes onPrevious/onNext que la barre de navigation
                principale. stopPropagation sur tout le bloc (pas bouton par
                bouton) : sans lui, cliquer "Suivante" ou "+" fermerait
                aussi le calque (voir le commentaire plus haut sur la
                fermeture au clic exterieur).
                UNE SEULE RANGEE (retour utilisateur, 2026-09-27 : le calque
                "apparait plus petit que l'atelier lui-meme, pas top") —
                avant, deux rangees (gros boutons "‹ Précédente"/"Suivante ›"
                + une rangee de zoom separee) consommaient a elles seules
                pres de 90px de hauteur, au detriment de la place laissee a
                la page elle-meme. Fleches fines (memes .atelier-book-nav-
                arrow que la navigation principale, variante claire pour ce
                fond sombre) + zoom, cote a cote sur une seule ligne. */}
            <div className="atelier-realsize-footer" onClick={(event) => event.stopPropagation()}>
              {onGoToCover && (
                <button
                  type="button"
                  className="atelier-realsize-jump"
                  onClick={onGoToCover}
                  disabled={!canGoPrevious}
                  title={t('bookView.goToCover')}
                  aria-label={t('bookView.goToCover')}
                >
                  ⇤
                </button>
              )}
              <button
                type="button"
                className="atelier-realsize-nav-arrow"
                onClick={onPrevious}
                disabled={!canGoPrevious}
                aria-label={t('bookView.previousPage')}
              >
                ‹
              </button>
              <span className="atelier-realsize-nav-label">{navLabel}</span>
              <button
                type="button"
                className="atelier-realsize-nav-arrow"
                onClick={onNext}
                disabled={!canGoNext}
                aria-label={t('bookView.nextPage')}
              >
                ›
              </button>
              {onGoToBackCover && (
                <button
                  type="button"
                  className="atelier-realsize-jump"
                  onClick={onGoToBackCover}
                  disabled={!canGoNext}
                  title={t('bookView.goToBackCover')}
                  aria-label={t('bookView.goToBackCover')}
                >
                  ⇥
                </button>
              )}
              <span className="atelier-realsize-footer-divider" aria-hidden="true" />
              <ZoomControls zoom={zoom} onZoomChange={setZoom} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AtelierBookView;
