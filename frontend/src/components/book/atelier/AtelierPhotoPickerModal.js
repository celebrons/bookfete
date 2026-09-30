import React from 'react';
import { useTranslation } from 'react-i18next';

// Emplacement PHOTO VIDE : que se passe-t-il au clic ?
//
// Jusqu'ici, rien — il fallait d'abord aller selectionner une photo dans
// "Mes photos" (colonne de gauche), PUIS revenir cliquer sur l'emplacement.
// Retour utilisateur (2026-09-25) : "il faudrait qu'on puisse acceder aux
// photos importees ou bien en importer une nouvelle directement via ses
// fichiers" — au clic, directement.
//
// Cette fenetre offre les deux chemins en un seul geste :
//   - choisir une photo DEJA importee (celles qu'aucun emplacement n'utilise
//     encore — proposer une photo deja placee ailleurs preterait a confusion,
//     glisser-deposer reste le chemin pour reutiliser une photo occupee) ;
//   - importer un NOUVEAU fichier depuis le disque, qui remplit directement
//     CET emplacement des que l'envoi est termine.
//
// Volontairement UN SEUL fichier a la fois (pas de selection multiple) :
// cette fenetre remplit UN emplacement precis, pas la bibliotheque entiere —
// l'ajout en lot reste le "+ Ajouter des photos" de la colonne de gauche.
//
// Reutilisee pour la couverture/4e (retour utilisateur, 2026-09-26 : "les
// photos seront gerees comme sur les pages") — MEME fenetre, mais la
// couverture n'exclut PAS les photos deja placees ailleurs dans le livre
// (contrairement a un emplacement de page interieure) : reutiliser la
// meilleure photo du livre en couverture est un usage courant, pas une
// confusion. `title`/`introHint`/`emptyHint` sont donc surchargeables par
// l'appelant plutot que fixes en dur — repli sur le texte "emplacement de
// page" d'origine si non fournis, aucun appelant existant n'est casse.
function AtelierPhotoPickerModal({
  isOpen,
  photosDisponibles = [],
  uploading,
  uploadError,
  onPick,
  onUploadFile,
  onClose,
  title = null,
  introHint = null,
  emptyHint = null
}) {
  const { t } = useTranslation('atelier');
  const resolvedTitle = title || t('photoPickerModal.defaultTitle');
  const resolvedIntroHint = introHint || t('photoPickerModal.defaultIntroHint');
  const resolvedEmptyHint = emptyHint || t('photoPickerModal.defaultEmptyHint');
  if (!isOpen) return null;

  const handleFileChange = (event) => {
    const [fichier] = Array.from(event.target.files || []);
    event.target.value = '';
    if (fichier) onUploadFile(fichier);
  };

  // Fermer PENDANT un import laisserait l'assignation finale s'appliquer a
  // un emplacement que l'utilisateur ne regarde plus forcement (il a pu, par
  // exemple, deja rouvrir ce choix sur un AUTRE emplacement) : on attend la
  // fin de l'envoi avant d'autoriser la fermeture.
  const requestClose = () => { if (!uploading) onClose(); };

  return (
    <div className="atelier-modal-backdrop" onClick={requestClose}>
      <div className="atelier-modal atelier-photo-picker-modal" onClick={(event) => event.stopPropagation()}>
        <div className="atelier-modal-head">
          <h2 className="atelier-modal-title">{resolvedTitle}</h2>
          <button type="button" className="atelier-modal-close" onClick={requestClose} disabled={uploading} aria-label={t('common.close')}>×</button>
        </div>

        {photosDisponibles.length > 0 ? (
          <>
            <p className="atelier-photo-picker-hint">{resolvedIntroHint}</p>
            <div className="atelier-photo-picker-grid">
              {photosDisponibles.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="atelier-photo-picker-thumb"
                  onClick={() => onPick(item.id)}
                  disabled={uploading}
                  title={t('photoPickerModal.useThisPhoto')}
                >
                  <img src={item.metadata?.thumbnailUrl || item.url} alt="" loading="lazy" />
                </button>
              ))}
            </div>
            <div className="atelier-photo-picker-divider"><span>{t('photoPickerModal.or')}</span></div>
          </>
        ) : (
          <p className="atelier-photo-picker-hint">
            {resolvedEmptyHint}
          </p>
        )}

        <label className={`atelier-photo-picker-upload ${uploading ? 'is-disabled' : ''}`}>
          {uploading ? t('photoPickerModal.uploading') : `+ ${t('photoPickerModal.uploadFromFiles')}`}
          <input
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            disabled={uploading}
            hidden
          />
        </label>

        {uploadError && <p className="atelier-photo-picker-error">{uploadError}</p>}
      </div>
    </div>
  );
}

export default AtelierPhotoPickerModal;
