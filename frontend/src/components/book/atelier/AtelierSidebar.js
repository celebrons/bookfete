import React, { useState } from 'react';

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

function AtelierSidebar({
  photos,
  souvenirs,
  selectedItem,
  onSelectItem,
  onUploadPhotos,
  onAddText,
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
  usedItemIds
}) {
  const [activeTab, setActiveTab] = useState(initialTab === 'souvenirs' ? 'souvenirs' : 'photos');
  const [newText, setNewText] = useState('');
  const items = activeTab === 'photos' ? photos : souvenirs;

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

  const handleAddTextClick = () => {
    const text = newText.trim();
    if (!text) return;
    onAddText(text);
    setNewText('');
  };

  return (
    <aside className="atelier-sidebar">
      <div className="atelier-sidebar-tabs">
        <button
          type="button"
          className={`atelier-sidebar-tab ${activeTab === 'photos' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('photos')}
        >
          Photos ({photos.length})
        </button>
        <button
          type="button"
          className={`atelier-sidebar-tab ${activeTab === 'souvenirs' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('souvenirs')}
        >
          Souvenirs ({souvenirs.length})
        </button>
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
        ) : (
          <div className="atelier-sidebar-add-text">
            <textarea
              className="input-luxe"
              rows={2}
              value={newText}
              onChange={(event) => setNewText(event.target.value)}
              placeholder="Ecrire un souvenir..."
              maxLength={4000}
            />
            <button
              type="button"
              className="btn btn-outline atelier-sidebar-add-btn"
              onClick={handleAddTextClick}
              disabled={!newText.trim()}
            >
              Ajouter
            </button>
          </div>
        )}
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
        <div className="atelier-sidebar-grid">
          {items.map((item) => {
            const isUsed = usedItemIds?.has(item.id);
            return (
              <div key={item.id} className="atelier-sidebar-item-wrap">
                <button
                  type="button"
                  draggable
                  onDragStart={(event) => handleDragStart(event, item)}
                  onClick={() => onSelectItem(selectedItem?.id === item.id ? null : item)}
                  className={`atelier-sidebar-item ${selectedItem?.id === item.id ? 'is-selected' : ''} ${isUsed ? 'is-used' : ''}`}
                  title={item.kind === 'photo' ? (isUsed ? 'Photo (deja utilisee sur une page)' : 'Photo') : item.text}
                >
                  {item.kind === 'photo' ? (
                    <img src={item.metadata?.thumbnailUrl || item.url} alt="" loading="lazy" />
                  ) : (
                    <span className="atelier-sidebar-text-preview">{item.text}</span>
                  )}
                  {isUsed && <span className="atelier-sidebar-item-used-badge">✓ utilisee</span>}
                </button>
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
      )}
    </aside>
  );
}

export default AtelierSidebar;
