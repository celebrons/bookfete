import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

// Bande de vignettes en bas de l'atelier — navigation directe vers
// n'importe quelle page sans repasser par precedente/suivante (retour
// utilisateur : gain d'ergonomie important sur un livre de 16+ pages, ou
// atteindre la page 14 depuis la page 2 demandait 12 clics).
//
// 2026-10-09 : vraies miniatures visuelles (retour utilisateur), remplacant
// les vignettes purement schematiques d'avant (numero + statut seulement —
// ce choix avait ete fait suite a un retour anterieur, "je ne sais pas s'il
// est pertinent d'afficher les images ici", et pour eviter un cout de rendu
// HTML/iframe par page). La nouvelle version ne reouvre PAS ce cout : aucun
// rendu HTML serveur ni PDF ici, uniquement un pavage CSS reconstruit a
// partir de donnees deja en memoire — voir `preview` dans
// BookAtelierLuxe.js:finishStats (geometrie en % de atelierLayoutGeometry.js
// + metadata.thumbnailUrl des items, le JPEG 480px deja genere a l'upload).
// Zero appel reseau supplementaire ; les images elles-memes profitent du
// chargement differe natif (`loading="lazy"`) et d'un repli silencieux vers
// la cellule neutre en cas d'echec (onError plus bas).
//
// Vit dans le tiroir "Pages" (voir BookAtelierLuxe.js, AtelierDrawer) depuis
// la refonte en tiroirs contextuels du 2026-09-26 — plus "toujours visible"
// comme a l'origine, mais accessible depuis n'importe quelle vue
// (couverture/interieur/4e) via cet onglet, contrairement a la navigation
// precedente/suivante qui vit dans la colonne centrale et change de forme
// selon viewKind.

// Alignees sur les memes constantes que AtelierBookView.js/AtelierLayoutPanel.js
// (convention deja etablie dans ce projet pour ces petites tables format ->
// dimensions plutot qu'un import partage). 2026-09-09 : realignees sur le
// catalogue reel Gelato, voir l'en-tete de coverFormat.js.
const FORMAT_DIMENSIONS_MM = {
  livret: { widthMm: 200, heightMm: 200 },
  standard: { widthMm: 210, heightMm: 280 },
  luxe: { widthMm: 210, heightMm: 280 }
};

// Type de donnee PROPRE au deplacement de page. Volontairement distinct de
// l'`application/json` utilise par la barre laterale pour glisser un souvenir
// (AtelierSidebar) : sans ca, lacher une photo sur le filmstrip aurait ete
// interprete comme un deplacement de page.
const PAGE_DRAG_TYPE = 'application/x-bookipix-page';

// Une case par emplacement de la mise en page, positionnee en % (meme
// geometrie que l'incrustation de glisser-deposer sur la vraie page — jamais
// une deuxieme source de verite sur les proportions). Composant a part pour
// pouvoir garder un etat d'echec PAR IMAGE (useState) sans alourdir
// FilmstripCell.
function FilmstripSlot({ slot, spreadSide }) {
  const [failed, setFailed] = useState(false);
  const { rect, kind, thumbnailUrl } = slot;
  const style = {
    position: 'absolute',
    top: `${rect.top}%`,
    left: `${rect.left}%`,
    width: `${rect.width}%`,
    height: `${rect.height}%`,
    overflow: spreadSide ? 'hidden' : undefined
  };
  if (kind === 'photo' && thumbnailUrl && !failed) {
    // Double page : meme recadrage que le rendu serveur
    // (pageRenderer.js: .photo-spread .photo-frame) — une image deux fois
    // plus large que la case, ancree a gauche ou a droite selon la moitie.
    // Jamais la photo entiere deux fois identique : ca se lirait comme une
    // erreur plutot que comme une seule image continue.
    const imgStyle = spreadSide
      ? {
        position: 'absolute', top: 0, height: '100%', width: '200%',
        objectFit: 'cover', [spreadSide === 'left' ? 'left' : 'right']: 0
      }
      : undefined;
    return (
      <span className="atelier-filmstrip-slot" style={style}>
        <img
          src={thumbnailUrl}
          alt=""
          loading="lazy"
          draggable={false}
          style={imgStyle}
          onError={() => setFailed(true)}
        />
      </span>
    );
  }
  if (kind === 'text' || kind === 'title') {
    // Illisible a cette taille (cellule de 46px de haut) : un simple repere
    // d'identification ("c'est du texte"), jamais une tentative de rendu
    // fidele du contenu.
    return (
      <span className="atelier-filmstrip-slot atelier-filmstrip-slot-text" style={style} aria-hidden="true">✍️</span>
    );
  }
  return null;
}

function FilmstripCell({
  target, label, status, isActive, aspectRatio, onSelect,
  // Nombre de photos signalees sur CETTE page (0 = rien a signaler).
  qualityWarnings = 0,
  // Deplacement : seules les pages interieures sont concernees (une
  // couverture ne se deplace pas), d'ou `onMove` absent sur les autres.
  onMove, dropSide, onDragOverCell, onDragLeaveCell, isDragging,
  // { slots: [{rect, kind, thumbnailUrl}], isSpread, spreadSide } — absent
  // sur la couverture/4e (restent schematiques, voir BookAtelierLuxe.js) et
  // sur une page sans mise en page choisie (reste la cellule neutre actuelle).
  preview
}) {
  const { t } = useTranslation('atelier');
  const ref = useRef(null);

  // Fait defiler la bande pour garder la vignette active visible, y compris
  // quand la navigation se fait via precedente/suivante (pas seulement un
  // clic direct dans le filmstrip) — sinon la selection "invisible" hors
  // champ romprait la coherence entre le filmstrip et la vue centrale.
  //
  // On deplace NOUS-MEMES le defilement horizontal de la bande, au lieu
  // d'appeler scrollIntoView. Celui-ci fait defiler TOUS les ancetres
  // scrollables, document compris : des que la bande n'etait pas entierement
  // visible, chaque "page suivante" faisait descendre la fenetre jusqu'a
  // elle, et le livre sortait du champ (signale le 2026-09-13 : "on est
  // renvoyes vers les pages timeline"). `block: 'nearest'` ne protege pas de
  // ca — il evite le defilement vertical seulement quand l'element est DEJA
  // entierement visible.
  useEffect(() => {
    if (!isActive) return;
    const cell = ref.current;
    const strip = cell?.parentElement;
    if (!cell || !strip) return;
    // Calcul par rectangles plutot que par offsetLeft : la bande n'est pas
    // positionnee (pas de position:relative), offsetLeft se rapporterait donc
    // a un ancetre quelconque et le centrage serait faux.
    const cellRect = cell.getBoundingClientRect();
    const stripRect = strip.getBoundingClientRect();
    const delta = (cellRect.left - stripRect.left) - (strip.clientWidth - cellRect.width) / 2;
    const maxLeft = strip.scrollWidth - strip.clientWidth;
    strip.scrollTo({ left: Math.max(0, Math.min(strip.scrollLeft + delta, maxLeft)), behavior: 'smooth' });
  }, [isActive]);

  const movable = Boolean(onMove);
  // Le numero (regle : toujours visible) a besoin d'un fond pour rester
  // lisible une fois qu'une vraie photo passe derriere lui — inutile (et
  // visuellement different d'avant sans raison) sur les pages qui restent
  // sans aucune image, d'ou cette classe conditionnelle plutot qu'un style
  // permanent.
  const hasVisual = Boolean(preview?.slots?.some((slot) => slot.kind === 'photo' && slot.thumbnailUrl));
  const statusText = status ? t(`pageFilmstrip.status.${status}`) : '';
  // L'avertissement passe AVANT le reste dans l'infobulle : c'est la seule
  // information qui demande une action.
  const alerte = qualityWarnings > 0
    ? ` — ⚠️ ${t('pageFilmstrip.qualityWarning', { count: qualityWarnings })}`
    : '';
  const base = movable ? t('pageFilmstrip.pagePrefix', { label }) : String(label);
  const title = movable
    ? `${base}${statusText ? ` — ${statusText}` : ''}${alerte} — ${t('pageFilmstrip.dragToMove')}`
    : (statusText ? `${base} — ${statusText}${alerte}` : `${base}${alerte}`);

  return (
    <button
      ref={ref}
      type="button"
      className={[
        'atelier-filmstrip-cell',
        `is-${status}`,
        isActive ? 'is-active' : '',
        movable ? 'is-movable' : '',
        qualityWarnings > 0 ? 'has-quality-warning' : '',
        isDragging ? 'is-dragging' : '',
        dropSide ? `is-drop-${dropSide}` : '',
        hasVisual ? 'has-visual' : '',
        // Fusion visuelle d'une double page : les deux vignettes voisines
        // perdent la bordure/l'arrondi de leur bord commun pour se lire
        // comme une seule image continue (choix retenu plutot qu'une icone
        // dediee — voir AtelierPageFilmstrip, commentaire de tete).
        preview?.isSpread ? `is-spread-${preview.spreadSide}` : ''
      ].filter(Boolean).join(' ')}
      style={{ aspectRatio }}
      draggable={movable}
      onDragStart={movable ? (event) => {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData(PAGE_DRAG_TYPE, String(target));
        onMove.start(target);
      } : undefined}
      onDragEnd={movable ? () => onMove.end() : undefined}
      onDragOver={movable ? (event) => {
        if (!event.dataTransfer.types.includes(PAGE_DRAG_TYPE)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        // Cote survole : on depose AVANT ou APRES cette page selon que le
        // pointeur est dans sa moitie gauche ou droite. Sans ca, deposer sur
        // la derniere page ne permettrait jamais de placer quelque chose
        // apres elle.
        const rect = event.currentTarget.getBoundingClientRect();
        onDragOverCell(target, event.clientX < rect.left + rect.width / 2 ? 'before' : 'after');
      } : undefined}
      onDragLeave={movable ? () => onDragLeaveCell(target) : undefined}
      onDrop={movable ? (event) => {
        if (!event.dataTransfer.types.includes(PAGE_DRAG_TYPE)) return;
        event.preventDefault();
        onMove.drop(Number(event.dataTransfer.getData(PAGE_DRAG_TYPE)), target);
      } : undefined}
      onClick={() => onSelect(target)}
      title={title}
    >
      {/* Couche purement visuelle : jamais de `draggable`/gestionnaire
          propre (voir FilmstripSlot : draggable={false} sur chaque <img>,
          sinon le navigateur demarre son propre glisser-image natif a la
          place du deplacement de page gere par ce bouton — risque identifie
          a l'audit, pas une hypothese). */}
      {preview?.slots && (
        <span className="atelier-filmstrip-cell-thumb" aria-hidden="true">
          {preview.slots.map((slot, slotIndex) => (
            <FilmstripSlot
              key={slotIndex}
              slot={slot}
              spreadSide={preview.isSpread ? preview.spreadSide : null}
            />
          ))}
        </span>
      )}
      <span className="atelier-filmstrip-cell-label">{label}</span>
      {/* Le ⚠️ REMPLACE le ✓ : une page peut etre complete ET porter une photo
          trop peu definie — afficher les deux cote a cote donnerait un signal
          contradictoire sur une vignette de 40 px. L'alerte prime. */}
      {qualityWarnings > 0 ? (
        <span className="atelier-filmstrip-cell-warning" aria-hidden="true">⚠️</span>
      ) : (
        status === 'complete' && <span className="atelier-filmstrip-cell-check" aria-hidden="true">✓</span>
      )}
    </button>
  );
}

function AtelierPageFilmstrip({
  pageStatuses,
  // { [pageIndex]: nombre } — photos signalees par page (voir
  // GET /print-quality-check). Absent = aucune pastille, comportement
  // d'avant inchange.
  qualityWarningsByPage = {},
  activeTarget,
  printFormat,
  onSelect,
  onAddPages,
  addingPages,
  onRemovePages,
  removingPages,
  canRemovePages,
  minPages,
  // Deplacement de page (facultatif : sans lui, le filmstrip se comporte
  // exactement comme avant).
  onMovePage,
  movingPage
}) {
  const { t } = useTranslation('atelier');
  const dims = FORMAT_DIMENSIONS_MM[printFormat] || FORMAT_DIMENSIONS_MM.standard;
  const aspectRatio = `${dims.widthMm} / ${dims.heightMm}`;

  const [draggedIndex, setDraggedIndex] = useState(null);
  const [dropTarget, setDropTarget] = useState(null); // { index, side }

  const move = onMovePage ? {
    start: (index) => { setDraggedIndex(index); setDropTarget(null); },
    end: () => { setDraggedIndex(null); setDropTarget(null); },
    drop: (from, over) => {
      setDraggedIndex(null);
      const side = dropTarget?.index === over ? dropTarget.side : 'before';
      // Position d'insertion vue comme un "entre-deux", puis ramenee a un
      // index de destination. Retirer d'abord la page decale d'un cran tout
      // ce qui la suit : sans cette correction, deplacer une page vers la
      // droite la posait systematiquement une position trop loin.
      const insertAt = side === 'after' ? over + 1 : over;
      const to = insertAt > from ? insertAt - 1 : insertAt;
      setDropTarget(null);
      if (to !== from) onMovePage(from, to);
    }
  } : null;

  const cellMoveProps = (pageIndex) => (move ? {
    onMove: move,
    isDragging: draggedIndex === pageIndex,
    dropSide: draggedIndex != null && dropTarget?.index === pageIndex ? dropTarget.side : null,
    onDragOverCell: (index, side) => setDropTarget((previous) => (
      previous?.index === index && previous?.side === side ? previous : { index, side }
    )),
    onDragLeaveCell: (index) => setDropTarget((previous) => (previous?.index === index ? null : previous))
  } : {});

  return (
    <div className={`atelier-filmstrip ${movingPage ? 'is-moving' : ''}`}>
      {/* Couvertures : ni "complete" ni "vide" au meme sens qu'une page
          interieure (toujours un contenu par defaut) — classe neutre
          dediee plutot qu'un statut trompeur. */}
      <FilmstripCell
        target="cover"
        label={t('pageFilmstrip.coverLabel')}
        status="cover"
        isActive={activeTarget === 'cover'}
        aspectRatio={aspectRatio}
        onSelect={onSelect}
      />
      <div className="atelier-filmstrip-sep" aria-hidden="true" />
      {pageStatuses.map(({ pageIndex, status, preview }) => (
        <FilmstripCell
          key={pageIndex}
          target={pageIndex}
          label={pageIndex + 1}
          status={status}
          isActive={activeTarget === pageIndex}
          aspectRatio={aspectRatio}
          onSelect={onSelect}
          qualityWarnings={qualityWarningsByPage[pageIndex] || 0}
          preview={preview}
          {...cellMoveProps(pageIndex)}
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
            ? t('pageFilmstrip.removeTitleEnabled')
            : t('pageFilmstrip.removeTitleDisabled', { min: minPages })}
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
          title={t('pageFilmstrip.addTitle')}
        >
          {addingPages ? '…' : '+2'}
        </button>
      )}
      <div className="atelier-filmstrip-sep" aria-hidden="true" />
      <FilmstripCell
        target="back-cover"
        label={t('pageFilmstrip.backCoverLabel')}
        status="cover"
        isActive={activeTarget === 'back-cover'}
        aspectRatio={aspectRatio}
        onSelect={onSelect}
      />
    </div>
  );
}

export default AtelierPageFilmstrip;
