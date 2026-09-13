import React, { useEffect, useRef, useState } from 'react';
import { resolveSlotSizeMm, checkImageFit, suggestLayoutsForPhotoRatio } from './photoQuality';
import { ATELIER_LAYOUTS } from './atelierLayouts';
import PhotoFitBadge from '../../common/PhotoFitBadge';

// Repositionnement/zoom d'une photo DANS son cadre (cahier des charges v2 :
// "L'utilisateur doit toujours pouvoir repositionner/zoomer l'image dans son
// cadre apres le recadrage automatique"). Le cadre ne bouge jamais, c'est la
// photo qui se deplace derriere lui.
//
// Rendu avec EXACTEMENT la meme formule CSS que le rendu serveur
// (pageRenderer.js : object-fit:cover + object-position + transform:scale,
// memes bornes de zoom que le backend) : ce que l'utilisateur voit ici est
// ce qu'il aura dans l'apercu ET dans le PDF final, jamais un second moteur
// de rendu qui pourrait diverger.
//
// Historique : cette modale avait ete construite le 2026-09-10, retiree le
// 2026-09-11 sur retour utilisateur ("ne sert a rien"), puis explicitement
// redemandee par le cahier des charges v2 (confirme avec l'utilisateur).
// L'ouverture se fait desormais AU CLIC SUR LA PHOTO (la croix gere le
// retrait, l'oeil la taille reelle) — plus de bouton "Ajuster" separe.
const PHOTO_ZOOM_MIN = 1;
const PHOTO_ZOOM_MAX = 2.5;
const ZOOM_STEP = 0.05;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function AtelierPhotoAdjustModal({
  isOpen,
  item,
  layoutSlug,
  slotIndex,
  printFormat,
  adjustment,
  onSave,
  onReset,
  onClose,
  onChooseSuggestedLayout
}) {
  const [focalX, setFocalX] = useState(0.5);
  const [focalY, setFocalY] = useState(0.5);
  const [zoom, setZoom] = useState(1);
  // 'cover' (defaut historique) : la photo remplit le cadre, quitte a etre
  // rognee. 'contain' : elle y tient ENTIEREMENT, avec des marges.
  //
  // C'est la reponse au besoin "pouvoir dezoomer un peu pour que la photo
  // rentre dans le cadre" (2026-09-13). Un zoom inferieur a 1 en mode `cover`
  // n'aurait rien donne : il retrecit l'image DEJA rognee, sans jamais
  // reveler ce qui a ete coupe. Seul `contain` change ce qui est visible.
  const [fitMode, setFitMode] = useState('cover');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const dragRef = useRef(null);
  const boxRef = useRef(null);

  // Reinitialise le brouillon local a chaque OUVERTURE sur un nouvel item.
  // Delibere : ne doit PAS se redeclencher parce que `adjustment` change de
  // reference sans que isOpen/item?.id changent (un re-render du parent
  // ecraserait ce que l'utilisateur est en train de deplacer).
  useEffect(() => {
    setFocalX(adjustment?.focalX ?? 0.5);
    setFocalY(adjustment?.focalY ?? 0.5);
    setZoom(adjustment?.zoom ?? 1);
    setFitMode(adjustment?.fitMode === 'contain' ? 'contain' : 'cover');
    setShowSuggestions(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, item?.id]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const handleKeyDown = (event) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !item) return null;

  const frame = resolveSlotSizeMm(layoutSlug, slotIndex, printFormat);
  const ratio = frame ? frame.widthMm / frame.heightMm : 1;
  const imageUrl = item.metadata?.previewUrl || item.url;
  const photoRatio = item.metadata?.width && item.metadata?.height
    ? item.metadata.width / item.metadata.height
    : null;

  // Qualite recalculee EN DIRECT pendant que l'utilisateur zoome : zoomer
  // etale moins de pixels sur la meme surface imprimee, donc le statut peut
  // basculer sous ses yeux (§1b).
  const fit = frame && item.metadata?.width && item.metadata?.height
    ? checkImageFit({
      imageWidthPx: item.metadata.width,
      imageHeightPx: item.metadata.height,
      frameWidthMm: frame.widthMm,
      frameHeightMm: frame.heightMm,
      zoom,
      fitMode
    })
    : null;

  const suggestions = showSuggestions && photoRatio
    ? suggestLayoutsForPhotoRatio({ photoRatio, layouts: ATELIER_LAYOUTS, printFormat })
    : [];

  function handlePointerDown(event) {
    const box = boxRef.current;
    if (!box) return;
    const rect = box.getBoundingClientRect();
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      startFocalX: focalX,
      startFocalY: focalY,
      boxWidth: rect.width,
      boxHeight: rect.height
    };
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  }

  // Sensibilite proportionnelle a la marge de manoeuvre reelle (zoom - 1) :
  // a zoom 1, seul l'axe deja en debordement naturel de object-fit:cover
  // (ratio photo != ratio cadre) bouge visiblement — l'autre est deja pile
  // ajuste, deplacer le point focal dessus n'a alors aucun effet, ce qui est
  // correct (il n'y a rien de plus a reveler sur cet axe).
  function handlePointerMove(event) {
    const drag = dragRef.current;
    if (!drag) return;
    const sensitivity = Math.max(zoom - 1, 0.3);
    const dxFrac = (event.clientX - drag.startX) / drag.boxWidth / sensitivity;
    const dyFrac = (event.clientY - drag.startY) / drag.boxHeight / sensitivity;
    setFocalX(clamp(drag.startFocalX - dxFrac, 0, 1));
    setFocalY(clamp(drag.startFocalY - dyFrac, 0, 1));
  }

  function handlePointerUp() {
    dragRef.current = null;
    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('pointerup', handlePointerUp);
  }

  return (
    <div className="atelier-modal-backdrop" onClick={onClose}>
      <div className="atelier-modal atelier-adjust-modal" onClick={(event) => event.stopPropagation()}>
        <div className="atelier-modal-head">
          <h2 className="atelier-modal-title">Ajuster le cadrage</h2>
          <button type="button" className="atelier-modal-close" onClick={onClose} aria-label="Fermer">×</button>
        </div>

        <p className="atelier-adjust-hint">
          {fitMode === 'contain'
            ? 'La photo entiere tient dans le cadre. Zoomez pour la faire remplir davantage.'
            : 'Faites glisser la photo pour la repositionner, zoomez si besoin.'}
        </p>

        {/* Choix du mode. Deux options nommees par ce qu'elles FONT, jamais
            par le terme technique (cover/contain). */}
        <div className="atelier-adjust-mode" role="group" aria-label="Cadrage dans l'emplacement">
          {[
            { value: 'cover', label: 'Remplir le cadre' },
            { value: 'contain', label: 'Photo entiere' }
          ].map((mode) => (
            <button
              key={mode.value}
              type="button"
              className={`atelier-adjust-mode-btn ${fitMode === mode.value ? 'is-active' : ''}`}
              // Repartir de 1 en changeant de mode : le zoom n'a pas la meme
              // signification de part et d'autre (a partir du cadre rempli
              // d'un cote, de la photo entiere de l'autre). Conserver la
              // valeur donnerait un saut incomprehensible.
              onClick={() => { setFitMode(mode.value); setZoom(1); }}
              aria-pressed={fitMode === mode.value}
            >
              {mode.label}
            </button>
          ))}
        </div>

        <div
          ref={boxRef}
          className="atelier-adjust-box"
          // En mode "photo entiere", les marges sont VISIBLES : le fond de
          // l'apercu doit donc etre celui du papier (#fffdf8, voir
          // typographySystem.PAGE_PAPER_HEX), sinon la modale montrerait des
          // bandes noires la ou le livre imprimera de l'ivoire — et cette
          // modale promet "ce que vous voyez est ce que vous aurez".
          style={{ aspectRatio: ratio, ...(fitMode === 'contain' ? { background: '#fffdf8' } : null) }}
          onPointerDown={handlePointerDown}
        >
          <img
            src={imageUrl}
            alt=""
            draggable={false}
            style={{
              objectFit: fitMode,
              objectPosition: `${focalX * 100}% ${focalY * 100}%`,
              transform: `scale(${zoom})`,
              transformOrigin: `${focalX * 100}% ${focalY * 100}%`
            }}
          />
        </div>

        <label className="atelier-adjust-zoom-row">
          <span>Zoom</span>
          <input
            type="range"
            min={PHOTO_ZOOM_MIN}
            max={PHOTO_ZOOM_MAX}
            step={ZOOM_STEP}
            value={zoom}
            onChange={(event) => setZoom(clamp(Number(event.target.value), PHOTO_ZOOM_MIN, PHOTO_ZOOM_MAX))}
          />
        </label>

        {fit?.severity && (
          <p className="atelier-adjust-quality">
            <PhotoFitBadge fit={fit} size="sm" /> {fit.label}
          </p>
        )}

        {/* Ecart de ratio important (§2) : le recadrage automatique reste
            applique, mais une mise en page dont un cadre a une forme proche
            de la photo donnerait un meilleur resultat sans rien couper. */}
        {fit?.ratioGap && onChooseSuggestedLayout && (
          <div className="atelier-adjust-suggest">
            <p className="atelier-adjust-suggest-text">
              Cette photo a une forme très différente de son cadre : une partie est coupée.
              Vous pouvez aussi choisir « Photo entière » ci-dessus pour ne rien couper.
            </p>
            {!showSuggestions ? (
              <button type="button" className="atelier-adjust-suggest-btn" onClick={() => setShowSuggestions(true)}>
                Voir d'autres mises en page adaptées
              </button>
            ) : suggestions.length > 0 ? (
              <div className="atelier-adjust-suggest-list">
                {suggestions.map(({ layout }) => (
                  <button
                    key={layout.slug}
                    type="button"
                    className="atelier-adjust-suggest-option"
                    onClick={() => onChooseSuggestedLayout(layout.slug)}
                  >
                    {layout.label}
                  </button>
                ))}
              </div>
            ) : (
              <p className="atelier-adjust-suggest-text">
                Aucune mise en page du catalogue n'épouse mieux la forme de cette photo — le recadrage reste la meilleure option ici.
              </p>
            )}
          </div>
        )}

        <div className="atelier-modal-actions">
          <button type="button" className="btn btn-outline" onClick={() => onReset(item.id)}>
            Réinitialiser le cadrage
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => onSave(item.id, { focalX, focalY, zoom, fitMode })}
          >
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}

export default AtelierPhotoAdjustModal;
