import React, { useEffect, useMemo, useRef, useState } from 'react';
import AtelierPhotoLightbox from './AtelierPhotoLightbox';

// Colonne gauche de l'atelier : "Mes souvenirs" — photos et souvenirs
// (textes) disponibles. Deux facons de placer un element dans un
// emplacement (cahier des charges §9) : glisser-deposer (draggable natif,
// aucune librairie necessaire pour une interaction aussi simple), ou
// cliquer pour le selectionner puis cliquer sur un emplacement disponible
// (alternative pour les appareils ou le drag & drop est peu pratique).
//
// Ajout direct (photos + textes) et suppression : reprend exactement les
// memes appels (uploadPhoto/addTextItem/deleteContentItem) que l'ancien
// assistant /composer (etape "Contenu") — l'atelier n'a plus besoin d'un
// detour par cet assistant pour un livre qui a deja son nombre de pages.
//
// Les miniatures utilisent toujours metadata.thumbnailUrl quand disponible
// (jamais l'original) — repli silencieux sur `url` pour les photos
// uploadees avant l'introduction des miniatures (voir storageService.js).

// Apercu AGRANDI d'une photo, au survol de sa vignette.
//
// Les vignettes de la bibliotheque font ~70 px : impossible d'y reconnaitre
// une photo avant de la glisser dans une page (retour utilisateur 2026-09-15 :
// « il faut pouvoir avoir un apercu des photos dans la bibliotheque pour voir
// la photo avant de la glisser »).
//
// Position FIXE calculee a partir de la vignette survolee, pas un simple
// positionnement relatif : la bibliotheque defile et rogne son contenu
// (overflow), un apercu pose dedans serait coupe. Il est donc rendu par-dessus
// tout, a droite de la vignette — et bascule a gauche quand il n'y a plus la
// place, pour ne jamais sortir de l'ecran.
//
// Survol SEULEMENT : sur telephone il n'existe pas, d'ou le bouton loupe qui
// l'accompagne — les deux repondent au meme besoin par deux chemins.
const APERCU_LARGEUR = 260;
const APERCU_MARGE = 12;

function PhotoHoverPreview({ apercu }) {
  if (!apercu) return null;
  const placeADroite = apercu.rect.right + APERCU_MARGE + APERCU_LARGEUR <= window.innerWidth;
  const left = placeADroite
    ? apercu.rect.right + APERCU_MARGE
    : Math.max(APERCU_MARGE, apercu.rect.left - APERCU_MARGE - APERCU_LARGEUR);
  // Centre verticalement sur la vignette, sans jamais deborder en haut ni en bas.
  const top = Math.min(
    Math.max(APERCU_MARGE, apercu.rect.top + apercu.rect.height / 2 - APERCU_LARGEUR / 2),
    Math.max(APERCU_MARGE, window.innerHeight - APERCU_LARGEUR - APERCU_MARGE)
  );
  return (
    <div className="atelier-sidebar-hover-preview" style={{ left, top, width: APERCU_LARGEUR }}>
      <img src={apercu.url} alt="" />
    </div>
  );
}

function AtelierSidebar({
  photos,
  souvenirs,
  selectedItem,
  onSelectItem,
  onUploadPhotos,
  onDeleteItem,
  uploadingPhotos,
  uploadProgress,
  onDeleteAll,
  deletingAll,
  addError,
  // Pre-selection de l'onglet depuis le dashboard ("Ajouter mes photos"/
  // "Ajouter mes souvenirs" -> /atelier?tab=photos|souvenirs, voir
  // BookAtelierLuxe.js) — 'photos' par defaut sinon, comportement inchange.
  initialTab,
  // Set des item id deja places sur une page interieure quelconque du livre
  // (voir BookAtelierLuxe.js: usedItemIds) — affiche un badge "utilisee" +
  // assombrit legerement la vignette, pour eviter un doublon accidentel.
  // Purement informatif : reste cliquable/glissable normalement, une
  // reutilisation deliberee (ex. meme photo en debut et fin de livre) n'est
  // jamais bloquee.
  usedItemIds,
  // Un livre solo n a pas de contributeurs : pas d onglet « Recues ».
  estSolo = false
}) {
  // { url, rect } de la photo survolee, null sinon. `rect` est fige au moment
  // du survol : l'apercu ne suit pas la souris, il reste ancre a sa vignette.
  const [apercu, setApercu] = useState(null);
  // Photo ouverte en grand (bouton loupe). Chemin tactile, ou simplement pour
  // regarder la photo a sa vraie resolution.
  const [photoOuverte, setPhotoOuverte] = useState(null);
  const apercuTimer = useRef(null);

  // Petit delai avant d'afficher : sans lui, balayer la grille du regard fait
  // clignoter une dizaine d'apercus.
  const survoler = (event, item) => {
    if (item.kind !== 'photo') return;
    const rect = event.currentTarget.getBoundingClientRect();
    const url = item.metadata?.previewUrl || item.url;
    clearTimeout(apercuTimer.current);
    apercuTimer.current = setTimeout(() => {
      setApercu({ url, rect: { top: rect.top, left: rect.left, right: rect.right, height: rect.height } });
    }, 220);
  };

  const quitter = () => {
    clearTimeout(apercuTimer.current);
    setApercu(null);
  };

  // TROIS FAMILLES, PAS DEUX (2026-09-22).
  //
  // L'onglet « Souvenirs » melangeait deux choses qui n'ont rien a voir :
  // les textes qu'on ecrit soi-meme, et ce que les proches envoient. Et les
  // PHOTOS des proches, elles, atterrissaient parmi les siennes — « on ne
  // peut pas savoir qui a envoye quelle photo ».
  //
  //   « Mes photos » : les siennes.
  //   « Reçues »     : tout ce qui arrive par le lien de partage, photos ET
  //                    mots, avec le nom de qui les a envoyes. C'est le
  //                    coeur d'un album collectif, ca meritait sa place.
  //   « Souvenirs »  : les textes ecrits depuis la bibliotheque. N'apparait
  //                    QUE si le livre en contient deja.
  //
  // Le champ « Ecrire un souvenir... » disparait : on ecrit desormais
  // directement dans l'emplacement, sur la page (AtelierTextEditor). Ecrire
  // un texte sans savoir ou il ira produisait des souvenirs orphelins.
  // L'onglet reste pour ceux qui existent — 24 en base au moment du
  // changement, dont 8 deja poses : les faire disparaitre les rendrait
  // introuvables.
  const estContribution = (item) => item?.source === 'contribution';
  const mesPhotos = useMemo(() => photos.filter((item) => !estContribution(item)), [photos]);
  const recues = useMemo(
    () => [...photos.filter(estContribution), ...souvenirs.filter(estContribution)],
    [photos, souvenirs]
  );
  const mesSouvenirs = useMemo(() => souvenirs.filter((item) => !estContribution(item)), [souvenirs]);

  const ongletRecuesDisponible = !estSolo && recues.length > 0;
  const ongletSouvenirsDisponible = mesSouvenirs.length > 0;

  const [activeTab, setActiveTab] = useState(initialTab === 'souvenirs' ? 'souvenirs' : 'photos');

  // Un onglet qui disparait (dernier element retire, passage en solo) ne
  // doit pas laisser la colonne sur du vide.
  useEffect(() => {
    if (activeTab === 'recues' && !ongletRecuesDisponible) setActiveTab('photos');
    if (activeTab === 'souvenirs' && !ongletSouvenirsDisponible) setActiveTab('photos');
  }, [activeTab, ongletRecuesDisponible, ongletSouvenirsDisponible]);

  // CE QUI RESTE A PLACER D'ABORD, CE QUI EST DEJA PLACE EN BAS (2026-09-19).
  //
  // La bibliotheque d'un livre de 60 photos melange celles qu'on a deja
  // posees et celles qu'on cherche encore : le badge « utilisee » le disait
  // deja, mais il fallait balayer toute la grille pour trouver les
  // restantes. Le travail en cours est en haut, l'archive en bas.
  //
  // Tri STABLE (deux filtres, pas un sort) : a l'interieur de chaque groupe
  // l'ordre d'origine — celui du livre — est conserve tel quel, et poser une
  // photo ne fait donc que la deplacer en fin de liste, sans rebattre le
  // reste. Vaut aussi pour les souvenirs : meme badge, meme besoin.
  const items = useMemo(() => {
    const base = activeTab === 'recues'
      ? recues
      : (activeTab === 'souvenirs' ? mesSouvenirs : mesPhotos);
    if (!usedItemIds || usedItemIds.size === 0) return base;
    return [
      ...base.filter((item) => !usedItemIds.has(item.id)),
      ...base.filter((item) => usedItemIds.has(item.id))
    ];
  }, [activeTab, mesPhotos, recues, mesSouvenirs, usedItemIds]);

  const nombreUtilises = useMemo(
    () => (usedItemIds ? items.filter((item) => usedItemIds.has(item.id)).length : 0),
    [items, usedItemIds]
  );

  const handleDragStart = (event, item) => {
    event.dataTransfer.effectAllowed = 'copy';
    // `kind` inclus (retour utilisateur, 2026-09-11 : une photo deposee sur
    // un emplacement texte — ou l'inverse — n'etait bloquee nulle part cote
    // client, seulement signalee visuellement via .is-rejecting ; le
    // backend rejetait la sauvegarde ensuite avec un message brut) —
    // permet a atelierSlotInteractions.js de refuser reellement le depot
    // sans avoir besoin de re-resoudre l'item par son id.
    event.dataTransfer.setData('application/json', JSON.stringify({ itemId: item.id, kind: item.kind }));
  };

  const handlePhotoInputChange = (event) => {
    const files = Array.from(event.target.files || []);
    if (files.length > 0) onUploadPhotos(files);
    event.target.value = '';
  };

  return (
    <aside className="atelier-sidebar">
      <div className="atelier-sidebar-tabs">
        <button
          type="button"
          className={`atelier-sidebar-tab ${activeTab === 'photos' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('photos')}
        >
          {estSolo ? 'Photos' : 'Mes photos'} ({mesPhotos.length})
        </button>
        {ongletRecuesDisponible && (
          <button
            type="button"
            className={`atelier-sidebar-tab ${activeTab === 'recues' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('recues')}
          >
            Reçues ({recues.length})
          </button>
        )}
        {ongletSouvenirsDisponible && (
          <button
            type="button"
            className={`atelier-sidebar-tab ${activeTab === 'souvenirs' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('souvenirs')}
          >
            Souvenirs ({mesSouvenirs.length})
          </button>
        )}
      </div>

      <p className="atelier-sidebar-hint">
        Glissez un element dans un emplacement, ou cliquez dessus puis cliquez sur un emplacement.
      </p>

      <div className="atelier-sidebar-add">
        {activeTab === 'photos' ? (
          <>
            <label className={`atelier-sidebar-add-btn ${uploadingPhotos ? 'is-disabled' : ''}`}>
              {uploadingPhotos ? 'Ajout en cours...' : '+ Ajouter des photos'}
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={handlePhotoInputChange}
                disabled={uploadingPhotos}
                hidden
              />
            </label>
            {/* Avancement REEL (photos envoyees / total). Un lot de 40 photos
                prend plusieurs minutes : sans ce retour, rien ne distingue
                "ca travaille" de "c'est plante" (retour utilisateur
                2026-09-12). Les echecs eventuels sont comptes a part — le lot
                continue malgre eux. */}
            {uploadProgress && (
              <div className="atelier-upload-progress">
                <div className="atelier-upload-progress-head">
                  <span>{uploadProgress.done} / {uploadProgress.total} photos</span>
                  {uploadProgress.failed > 0 && (
                    <span className="atelier-upload-progress-failed">{uploadProgress.failed} échec{uploadProgress.failed > 1 ? 's' : ''}</span>
                  )}
                </div>
                <div className="atelier-upload-progress-bar">
                  <div
                    className="atelier-upload-progress-fill"
                    style={{ width: `${Math.round((uploadProgress.done / uploadProgress.total) * 100)}%` }}
                  />
                </div>
              </div>
            )}
          </>
        ) : null}
        {addError && <p className="atelier-sidebar-add-error">{addError}</p>}

        {/* Vider l'onglet courant. Volontairement DISCRET et en retrait (petit
            lien, pas un bouton), et jamais affiche quand il n'y a rien a
            supprimer : c'est une sortie de secours, pas une action courante.
            La confirmation, elle, est explicite (voir handleDeleteAll). */}
        {onDeleteAll && items.length > 0 && (
          <button
            type="button"
            className="atelier-sidebar-delete-all"
            onClick={() => onDeleteAll(activeTab === 'photos' ? 'photo' : 'texte')}
            disabled={deletingAll || uploadingPhotos}
          >
            {deletingAll
              ? 'Suppression...'
              : `Tout supprimer (${items.length} ${activeTab === 'photos' ? 'photos' : 'souvenirs'})`}
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <p className="atelier-sidebar-empty">
          {activeTab === 'photos' ? 'Aucune photo pour le moment.' : 'Aucun souvenir pour le moment.'}
        </p>
      ) : (
        <>
        {nombreUtilises > 0 && nombreUtilises < items.length && (
          <p className="atelier-sidebar-sorthint">
            {activeTab === 'photos' ? 'Photos' : 'Souvenirs'} deja place{activeTab === 'photos' ? 'es' : 's'} regroupe{activeTab === 'photos' ? 'es' : 's'} en bas ({nombreUtilises}).
          </p>
        )}
        <div className="atelier-sidebar-grid">
          {items.map((item) => {
            const isUsed = usedItemIds?.has(item.id);
            // RECONNAITRE CE QU'ON A RECU (2026-09-22).
            //
            // Une photo envoyee par un proche arrivait dans la bibliotheque
            // exactement comme les siennes : « je n'ai pas recu la photo
            // partagee — ou elle s'est peut-etre mise dans les autres
            // photos ». Elle etait bien la, indiscernable parmi 75.
            //
            // Le nom du contributeur n'est pas toujours connu (le lien de
            // partage ne l'exige pas) : on marque alors l'origine sans le
            // nommer, plutot que d'afficher un « de ? » qui n'apprend rien.
            const estRecue = item.source === 'contribution';
            const auteur = item.metadata?.contributor_name || null;
            return (
              // UN TEXTE N EST PAS UNE VIGNETTE (2026-09-22).
              //
              // Un souvenir etait pose dans le meme carre de 70 px qu une
              // photo, en corps 10, coupe apres quatre lignes : illisible,
              // donc inexploitable — « ca s'affiche en photo et donc
              // inexploitable ». Il prend desormais toute la largeur de la
              // colonne et se lit.
              <div
                key={item.id}
                className={`atelier-sidebar-item-wrap ${item.kind === 'texte' ? 'is-texte' : ''}`}
              >
                <button
                  type="button"
                  draggable
                  onDragStart={(event) => { quitter(); handleDragStart(event, item); }}
                  onClick={() => onSelectItem(selectedItem?.id === item.id ? null : item)}
                  onMouseEnter={(event) => survoler(event, item)}
                  onMouseLeave={quitter}
                  className={`atelier-sidebar-item ${selectedItem?.id === item.id ? 'is-selected' : ''} ${isUsed ? 'is-used' : ''}`}
                  title={[
                    item.kind === 'photo' ? 'Photo' : item.text,
                    estRecue ? (auteur ? `Envoyee par ${auteur}` : 'Recue par le lien de partage') : null,
                    isUsed ? 'Deja utilisee sur une page' : null
                  ].filter(Boolean).join(' — ')}
                >
                  {item.kind === 'photo' ? (
                    <img src={item.metadata?.thumbnailUrl || item.url} alt="" loading="lazy" />
                  ) : (
                    <span className="atelier-sidebar-text-preview">{item.text}</span>
                  )}
                  {estRecue && (
                    <span className="atelier-sidebar-item-recue-badge">
                      {auteur ? `♥ ${auteur}` : '♥ reçue'}
                    </span>
                  )}
                  {isUsed && <span className="atelier-sidebar-item-used-badge">✓ utilisee</span>}
                </button>
                {/* Loupe : voir la photo en grand AVANT de la placer. Double
                    emploi assume avec l'apercu au survol — celui-ci n'existe
                    pas sur telephone, et regarder une photo a sa vraie
                    resolution reste utile meme a la souris. */}
                {item.kind === 'photo' && (
                  <button
                    type="button"
                    className="atelier-sidebar-item-zoom"
                    onClick={(event) => {
                      event.stopPropagation();
                      quitter();
                      // Version d'ecran (1600 px) et non l'original : sur un
                      // ecran courant la difference ne se voit pas, et
                      // l'original pese cinq fois plus (2026-09-20).
                      setPhotoOuverte(item.metadata?.previewUrl || item.url);
                    }}
                    aria-label="Voir la photo en grand"
                    title="Voir la photo en grand"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                      <circle cx="10.5" cy="10.5" r="6.5" />
                      <path d="M15.5 15.5 21 21" />
                      <path d="M10.5 7.5v6M7.5 10.5h6" />
                    </svg>
                  </button>
                )}
                <button
                  type="button"
                  className="atelier-sidebar-item-remove"
                  onClick={(event) => { event.stopPropagation(); onDeleteItem(item.id); }}
                  aria-label="Supprimer"
                  title="Supprimer"
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
        </>
      )}

      {/* Rendus en DERNIER et en position fixe : la bibliotheque defile et
          rogne son contenu, un apercu pose dedans serait coupe. */}
      <PhotoHoverPreview apercu={apercu} />
      <AtelierPhotoLightbox url={photoOuverte} onClose={() => setPhotoOuverte(null)} />
    </aside>
  );
}

export default AtelierSidebar;
