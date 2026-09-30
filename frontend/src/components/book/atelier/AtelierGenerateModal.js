import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ATELIER_MOODS, getMoodLabel, getMoodDescription } from './atelierMoods';
import { formatPriceCents as formatEuro } from '../../../utils/orderWorkflow';

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
  // { pagesPrevues, pagesActuelles, prixActuelCents, prixPrevuCents } quand
  // le contenu demande plus de pages que le livre n'en compte. Null sinon.
  debordement,
  loadingEstimate,
  // Repli seulement : l'appelant passe toujours MIN_AUTO_PAGES
  // (BookAtelierLuxe.js), aligne sur layoutEngine.PAGE_COUNT_TIERS[0].
  minPages = 30,
  // Nombre de pages deja composees A LA MAIN — sert uniquement a dire a
  // l utilisateur ce qui leur arrivera (rien).
  manualPagesCount = 0
}) {
  const { t } = useTranslation('atelier');
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
          <h2 className="atelier-modal-title">{t('generateModal.title')}</h2>
          <button type="button" className="atelier-modal-close" onClick={onClose} disabled={isGenerating} aria-label={t('generateModal.close')}>×</button>
        </div>
        <p className="atelier-hint">
          {t('generateModal.intro')}
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
            {t('generateModal.manualKept', { count: manualPagesCount })}
          </p>
        )}

        {/* CE QUI SE PASSE, SANS DRAMATISER (2026-09-21).

            Ce texte annoncait « il n'y a pas de retour en arriere ». Deux
            problemes : c'etait intimidant au moment ou l'on demande juste
            d'essayer une ambiance, et c'etait devenu FAUX — un point de
            restauration est pose avant chaque generation (phase19), et
            l'atelier propose « revenir a mon livre d'avant ».

            On dit donc simplement ce qui change, et ce qui ne change pas. */}
        <p className="atelier-hint atelier-hint-warning">
          {t('generateModal.replaceWarning')}
        </p>

        {loadingEstimate && <p className="atelier-hint">{t('generateModal.checkingContent')}</p>}

        {/* LE LIVRE VA GRANDIR, ET LE PRIX AVEC (2026-09-21).
            Le moteur ne tronque jamais : tout le contenu est place, et le
            livre est redimensionne pour le contenir. Ca se faisait en
            silence — on choisissait 30 pages et on decouvrait 46 a la
            commande. On l'annonce donc AVANT, chiffres a l'appui, et on
            laisse decider : composer ainsi, ou revenir retirer des photos. */}
        {debordement && (
          <p className="atelier-hint atelier-hint-warning">
            {t('generateModal.overflow.prefix')}<strong>{t('generateModal.overflow.pagesBold', { count: debordement.pagesPrevues })}</strong>
            {t('generateModal.overflow.middle', { current: debordement.pagesActuelles, next: debordement.pagesPrevues })}
            {debordement.prixActuelCents != null && debordement.prixPrevuCents != null && (
              <>{t('generateModal.overflow.priceChangePrefix')}<strong>{formatEuro(debordement.prixActuelCents)}</strong>{t('generateModal.overflow.priceChangeSeparator')}
              <strong>{formatEuro(debordement.prixPrevuCents)}</strong></>
            )}
            {t('generateModal.overflow.suffix', { current: debordement.pagesActuelles })}
          </p>
        )}

        {pagesRestantes > 0 && (
          <p className="atelier-hint atelier-hint-warning">
            {t('generateModal.remaining.main', {
              count: pagesRestantes,
              estimated: estimatedPages,
              estimatedPlural: estimatedPages > 1 ? 's' : '',
              min: minPages
            })}
            {' '}{t('generateModal.remaining.note')}
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
              <span className="atelier-mood-card-label">{getMoodLabel(mood.id, t)}</span>
              <span className="atelier-mood-card-description">{getMoodDescription(mood.id, t)}</span>
            </button>
          ))}
        </div>

        {error && <div className="wizard-error">{error}</div>}

        <div className="atelier-modal-actions">
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={isGenerating}>
            {t('generateModal.cancel')}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => onGenerate(selectedMood)}
            disabled={isGenerating || loadingEstimate}
            title={debordement ? t('generateModal.willGrowTo', { pages: debordement.pagesPrevues }) : undefined}
          >
            {isGenerating ? t('generateModal.generating') : t('generateModal.generate')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default AtelierGenerateModal;
