import React, { useEffect, useState } from 'react';
import { ATELIER_MOODS } from './atelierMoods';

// Point d'entree de la generation automatique depuis l'atelier (remplace le
// role de l'etape 4 de l'ancien assistant /composer) : choisir une ambiance
// puis generer — decision utilisateur actee, pas de comparaison cote-a-cote
// des 5 ambiances.
function AtelierGenerateModal({
  isOpen,
  onClose,
  onGenerate,
  isGenerating,
  error,
  estimatedPages,
  loadingEstimate,
  // Repli seulement : l'appelant passe toujours MIN_AUTO_PAGES
  // (BookAtelierLuxe.js), aligne sur layoutEngine.PAGE_COUNT_TIERS[0].
  minPages = 30,
  // Nombre de pages deja composees A LA MAIN — sert uniquement a dire a
  // l utilisateur ce qui leur arrivera (rien).
  manualPagesCount = 0
}) {
  const [selectedMood, setSelectedMood] = useState('classique');

  // `estimatedPages` porte ici le nombre de pages REELLEMENT remplies dans ce
  // livre (recommendPageCount.filledPages), pas la densite naturelle du
  // contenu — les deux divergent depuis que le moteur repartit le contenu sur
  // le livre entier au lieu de l'empiler (2026-09-15 : 47 photos tiennent en
  // 21 pages mais en remplissent 30).
  //
  // Il ne reste donc des pages blanches que lorsqu'il n'y a VRAIMENT pas assez
  // de contenu — et le moteur ne repete jamais une photo ni un souvenir pour
  // combler. Ce n'est pas un blocage : un livre de 30 pages dont 13 composees
  // reste parfaitement valide, c'est a l'utilisateur de decider.
  const pagesRestantes = estimatedPages != null && estimatedPages < minPages
    ? minPages - estimatedPages
    : 0;

  // Echap pour fermer + bloque le defilement derriere, meme principe que la
  // loupe plein ecran de BookCoverDesignerLuxe.js.
  useEffect(() => {
    if (!isOpen) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !isGenerating) onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen, isGenerating, onClose]);

  if (!isOpen) return null;

  return (
    <div className="atelier-modal-backdrop" onClick={() => !isGenerating && onClose()}>
      <div className="atelier-modal" onClick={(event) => event.stopPropagation()}>
        <div className="atelier-modal-head">
          <h2 className="atelier-modal-title">Generer automatiquement</h2>
          <button type="button" className="atelier-modal-close" onClick={onClose} disabled={isGenerating} aria-label="Fermer">×</button>
        </div>
        <p className="atelier-hint">
          Choisissez une ambiance : Celebrons compose tout le livre d'un coup a partir de vos souvenirs, chaque
          photo et chaque texte utilise une seule fois. Vous pourrez ensuite ajuster n'importe quelle page a la
          main, ou regenerer avec une autre ambiance.
        </p>

        {/* Dit noir sur blanc ce qui arrive aux pages deja faites a la main.
            La garantie est REELLE, pas rassurante : le serveur preserve les
            pages composees manuellement et retire leur contenu de la pioche
            (voir backend routes/composition.js POST /compose). Sans ce
            message, le bouton restait inutilisable par peur — "j'ai peur que
            ca foute tout ce que j'ai fait manuellement en l'air"
            (2026-09-14). */}
        {manualPagesCount > 0 && (
          <p className="atelier-hint atelier-hint-safe">
            Vos {manualPagesCount} page{manualPagesCount > 1 ? 's' : ''} composée{manualPagesCount > 1 ? 's' : ''} à
            la main {manualPagesCount > 1 ? 'sont conservées' : 'est conservée'} telle
            {manualPagesCount > 1 ? 's quelles' : ' quelle'} : la génération ne remplit que les pages restantes, et
            n'y replace jamais une photo ou un souvenir que vous y avez déjà posé.
          </p>
        )}

        {/* L'AUTRE moitie de la verite, aussi importante que la garantie
            ci-dessus : il n'existe aucun retour en arriere. Les pages
            composees automatiquement AVANT sont remplacees par la nouvelle
            generation (voir backend replaceBookPages : seules les pages
            verrouillees survivent). Le taire rendrait la garantie trompeuse
            — l'utilisateur a demande les deux : « je ne vais pas perdre ce
            que j'ai fait manuellement ? et je pourrais revenir sur mon livre
            d'avant ? » (2026-09-15). */}
        <p className="atelier-hint atelier-hint-warning">
          En revanche, il n'y a pas de retour en arrière : les pages déjà composées automatiquement seront
          remplacées par la nouvelle proposition. Vos photos et souvenirs, eux, ne sont jamais supprimés.
        </p>

        {loadingEstimate && <p className="atelier-hint">Verification du contenu...</p>}

        {pagesRestantes > 0 && (
          <p className="atelier-hint atelier-hint-warning">
            Votre contenu remplit environ {estimatedPages} page{estimatedPages > 1 ? 's' : ''} sur les {minPages} de
            votre livre : les {pagesRestantes} dernière{pagesRestantes > 1 ? 's' : ''} resteront blanche
            {pagesRestantes > 1 ? 's' : ''}. Celebrons ne répète jamais une photo ni un souvenir pour combler
            l'espace — vous pourrez les composer à la main, ou ajouter du contenu dans « Mes souvenirs ».
          </p>
        )}

        <div className="atelier-mood-grid">
          {ATELIER_MOODS.map((mood) => (
            <button
              key={mood.id}
              type="button"
              className={`atelier-mood-card ${selectedMood === mood.id ? 'is-selected' : ''}`}
              onClick={() => setSelectedMood(mood.id)}
              disabled={isGenerating}
            >
              <span className="atelier-mood-card-label">{mood.label}</span>
              <span className="atelier-mood-card-description">{mood.description}</span>
            </button>
          ))}
        </div>

        {error && <div className="wizard-error">{error}</div>}

        <div className="atelier-modal-actions">
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={isGenerating}>
            Annuler
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => onGenerate(selectedMood)}
            disabled={isGenerating || loadingEstimate}
          >
            {isGenerating ? 'Generation...' : 'Generer'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default AtelierGenerateModal;
