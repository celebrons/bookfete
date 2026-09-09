import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import './PageZoomStage.css';

// Visualiseur generique "ajuster a l'ecran + zoom + panoramique", partage
// par l'atelier ("Voir a l'echelle") et l'Apercu final (plein ecran) — voir
// leurs propres fichiers pour l'integration. Cahier des charges du
// 2026-09-09 ("REFONTE UX DES APERCUS") : fit-to-viewport (scale = min des
// deux ratios, jamais de deformation), jamais de scrollbar native, zoom
// libre (paliers + molette/trackpad) avec panoramique a la Figma/Google
// Maps une fois zoome au-dela de l'ajustement.
//
// Le contenu (`children`) est mesure UNE SEULE FOIS par l'appelant
// (contentWidthPx/contentHeightPx — une page seule, ou un duo de pages +
// interstice pour une double-page) et rendu a cette taille NATURELLE dans
// `.page-zoom-stage-content` ; un seul transform:scale()+translate() est
// applique GLOBALEMENT sur ce conteneur — jamais une iframe individuelle
// redimensionnee directement (meme piege deja rencontre et corrige ailleurs
// cette session, voir ScaledPageFrame dans BookPreviewFinalLuxe.js : ca
// ecrase la mise en page interne, dimensionnee en mm/pt). Ici, un seul
// wrapper scale tout son contenu ensemble (les 2 pages ET l'interstice
// entre elles), donc pas besoin de ResizeObserver individuel par page.
//
// zoom est CONTROLE (fourni par le parent, jamais d'etat interne a ce
// composant) : les deux appelants affichent leurs propres boutons de zoom
// (ZoomControls plus bas) dans leur propre barre du bas — jamais flottants
// par-dessus le livre (cahier des charges : "reduire fortement les
// elements d'interface").
export const ZOOM_PRESETS = [
  { id: 'fit', label: 'Ajuster' },
  { id: 0.75, label: '75%' },
  { id: 1, label: '100%' },
  { id: 1.25, label: '125%' },
  { id: 1.5, label: '150%' }
];
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2;
const WHEEL_SENSITIVITY = 0.0015;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function PageZoomStage({
  contentWidthPx,
  contentHeightPx,
  zoom,
  onZoomChange,
  // Change de valeur -> reinitialise le panoramique (ex. l'index de la page
  // affichee). Le ZOOM, lui, est deliberement CONSERVE d'une page a l'autre
  // (attendu naturel d'une visionneuse : rester zoome en tournant les
  // pages) — seul le panoramique perd son sens sur un nouveau contenu.
  resetPanKey,
  children,
  className
}) {
  const stageRef = useRef(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStateRef = useRef(null);
  // Un clic qui suit un panoramique (relachement de souris/doigt apres avoir
  // deplace le livre) declenche quand meme un evenement `click` natif,
  // meme si le pointeur a bouge entre-temps — sans garde, ce clic
  // remonterait jusqu'a un eventuel gestionnaire "fermer au clic exterieur"
  // du calque parent (atelier/Apercu final) et fermerait la fenetre juste
  // apres un panoramique, ce qui serait tres genant. Suivi via un ref (pas
  // un state, inutile de re-render pour ca) et avale par onClick ci-dessous
  // uniquement quand un vrai deplacement a eu lieu (au-dela d'un seuil de
  // quelques pixels, pour ne jamais gener un simple clic).
  const didDragRef = useRef(false);

  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return undefined;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      setContainerSize({ width: rect.width, height: rect.height });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const fitScale = containerSize.width > 0 && containerSize.height > 0 && contentWidthPx > 0 && contentHeightPx > 0
    ? Math.min(containerSize.width / contentWidthPx, containerSize.height / contentHeightPx)
    : 1;
  const activeScale = zoom === 'fit' ? fitScale : zoom;

  const scaledWidth = contentWidthPx * activeScale;
  const scaledHeight = contentHeightPx * activeScale;
  const maxPanX = Math.max(0, (scaledWidth - containerSize.width) / 2);
  const maxPanY = Math.max(0, (scaledHeight - containerSize.height) / 2);
  const canPan = maxPanX > 0.5 || maxPanY > 0.5;

  useEffect(() => { setPan({ x: 0, y: 0 }); }, [resetPanKey]);

  // Recadre le panoramique existant des que l'echelle/la taille du
  // conteneur changent (zoom modifie, fenetre redimensionnee) — sans ca, un
  // panoramique valide a un zoom donne pourrait laisser le livre hors-cadre
  // une fois revenu a un zoom plus faible (ou la fenetre retrecie).
  useEffect(() => {
    setPan((previous) => {
      const nextX = clamp(previous.x, -maxPanX, maxPanX);
      const nextY = clamp(previous.y, -maxPanY, maxPanY);
      return nextX === previous.x && nextY === previous.y ? previous : { x: nextX, y: nextY };
    });
  }, [maxPanX, maxPanY]);

  const handlePointerDown = (event) => {
    if (!canPan) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStateRef.current = { startX: event.clientX, startY: event.clientY, panStart: pan };
    didDragRef.current = false;
    setIsDragging(true);
  };
  const handlePointerMove = (event) => {
    if (!dragStateRef.current) return;
    const { startX, startY, panStart } = dragStateRef.current;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) didDragRef.current = true;
    setPan({
      x: clamp(panStart.x + dx, -maxPanX, maxPanX),
      y: clamp(panStart.y + dy, -maxPanY, maxPanY)
    });
  };
  const handleClick = (event) => {
    // Deux cas a avaler : un clic qui vient de suivre un vrai panoramique
    // (didDragRef), ET tout clic pendant que le panoramique est POSSIBLE
    // (canPan) — les iframes de page sont pointer-events:none dans cet
    // etat (voir le CSS), donc un simple clic sur le livre lui-meme finit
    // par cibler ce conteneur plutot que d'etre avale par l'iframe comme
    // d'habitude ; sans cette garde, cliquer sur le livre zoome fermerait
    // le calque parent au lieu de ne rien faire.
    if (canPan || didDragRef.current) {
      event.stopPropagation();
      didDragRef.current = false;
    }
  };
  const stopDragging = (event) => {
    if (!dragStateRef.current) return;
    dragStateRef.current = null;
    setIsDragging(false);
    if (event?.currentTarget?.releasePointerCapture && event.pointerId != null) {
      try { event.currentTarget.releasePointerCapture(event.pointerId); } catch (_err) { /* deja relachee */ }
    }
  };

  // Molette/trackpad : zoome autour du centre (pas du curseur — simplifie
  // volontairement, un zoom ancre au curseur demanderait de recalculer le
  // panoramique en meme temps que l'echelle pour un gain d'usage marginal
  // ici). Capture aussi le pincement trackpad : la plupart des navigateurs
  // le remontent comme un evenement wheel avec ctrlKey a true, deja pris en
  // charge sans code supplementaire.
  const handleWheel = (event) => {
    event.preventDefault();
    const current = zoom === 'fit' ? fitScale : zoom;
    onZoomChange(clamp(current - event.deltaY * WHEEL_SENSITIVITY, MIN_ZOOM, MAX_ZOOM));
  };

  return (
    <div
      ref={stageRef}
      className={`page-zoom-stage ${className || ''} ${canPan ? 'is-pannable' : ''} ${isDragging ? 'is-dragging' : ''}`}
      onWheel={handleWheel}
      onClick={handleClick}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={stopDragging}
      onPointerLeave={stopDragging}
      onPointerCancel={stopDragging}
    >
      <div
        className="page-zoom-stage-content"
        style={{
          width: `${contentWidthPx}px`,
          height: `${contentHeightPx}px`,
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${activeScale})`,
          transition: isDragging ? 'none' : 'transform 200ms ease'
        }}
      >
        {children}
      </div>
    </div>
  );
}

// Boutons -/+ + selection rapide (Ajuster/75/100/125/150). `zoom` peut etre
// une valeur "libre" issue de la molette (ne correspondant a aucun palier) :
// geree comme un etat intermediaire (select affiche le pourcentage exact en
// option desactivee, +/- rejoignent le palier suivant dans la bonne
// direction) plutot que de forcer un arrondi silencieux.
export function ZoomControls({ zoom, onZoomChange, className }) {
  const activeIndex = ZOOM_PRESETS.findIndex((preset) => preset.id === zoom);
  const isFreeValue = activeIndex === -1;
  const canDecrease = isFreeValue || activeIndex > 0;
  const canIncrease = isFreeValue || activeIndex < ZOOM_PRESETS.length - 1;

  const stepTo = (direction) => {
    if (isFreeValue) {
      const current = typeof zoom === 'number' ? zoom : 1;
      const numericPresets = ZOOM_PRESETS.filter((preset) => typeof preset.id === 'number');
      const next = direction > 0
        ? numericPresets.find((preset) => preset.id > current)
        : [...numericPresets].reverse().find((preset) => preset.id < current);
      onZoomChange(next ? next.id : clamp(current + direction * 0.25, MIN_ZOOM, MAX_ZOOM));
      return;
    }
    onZoomChange(ZOOM_PRESETS[clamp(activeIndex + direction, 0, ZOOM_PRESETS.length - 1)].id);
  };

  return (
    <div className={`page-zoom-controls ${className || ''}`}>
      <button type="button" className="page-zoom-btn" onClick={() => stepTo(-1)} disabled={!canDecrease} aria-label="Réduire le zoom">
        −
      </button>
      <select
        className="page-zoom-select"
        value={isFreeValue ? '' : zoom}
        onChange={(event) => onZoomChange(event.target.value === 'fit' ? 'fit' : Number(event.target.value))}
        aria-label="Niveau de zoom"
      >
        {isFreeValue && (
          <option value="" disabled>{Math.round((typeof zoom === 'number' ? zoom : 1) * 100)}%</option>
        )}
        {ZOOM_PRESETS.map((preset) => (
          <option key={preset.id} value={preset.id}>{preset.label}</option>
        ))}
      </select>
      <button type="button" className="page-zoom-btn" onClick={() => stepTo(1)} disabled={!canIncrease} aria-label="Augmenter le zoom">
        +
      </button>
    </div>
  );
}
