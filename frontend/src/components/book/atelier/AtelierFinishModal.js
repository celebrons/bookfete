import React, { useEffect, useState } from 'react';
import { getPrintQualityCheck } from '../../../services/compositionApi';
import { acquitterAvertissementsQualite } from '../../../utils/qualityAcknowledgment';
import { RATIO_GAP_THRESHOLD } from './photoQuality';

// Verification automatique au clic sur "Terminer mon livre" — calculee a
// partir des donnees deja chargees dans l'atelier (voir BookAtelierLuxe.js:
// buildFinishStats), aucun nouvel appel reseau POUR CETTE PARTIE. Jamais
// bloquant : meme avec des emplacements vides, l'utilisateur peut choisir
// de voir son livre quand meme (voir cahier des charges : "Pas de blocage
// inutile").
//
// Qualite photo (cahier des charges "PhotoSlot", 2026-09-10, §20/21) :
// SEULE exception a "aucun nouvel appel reseau" — un unique appel a
// GET /print-quality-check, declenche a l'OUVERTURE de cette modale (pas a
// chaque rendu), pour la meme raison qu'elle n'est evaluee nulle part
// ailleurs sans donnees serveur fiables (mm reels par slot/format). Jamais
// bloquant non plus : n'affecte jamais `isReady`/le bouton "Voir mon
// livre" — juste une ligne d'information en plus, avec un lien pour aller
// directement corriger si souhaite.
function AtelierFinishModal({
  isOpen, onClose, stats, onContinue, bookId, onViewPage,
  // Avertissements deja charges par l'atelier (il en a besoin pour les
  // pastilles du filmstrip) : evite un second appel identique. Absent = on
  // retombe sur le chargement local ci-dessous.
  warnings: warningsFromParent,
  onRefreshQuality
}) {
  const [qualityCheck, setQualityCheck] = useState(null);
  // La liste des pages concernees est REPLIEE par defaut : sur un livre a 37
  // avertissements, la derouler d'office noierait le bouton "Voir mon livre".
  const [listeDepliee, setListeDepliee] = useState(false);

  useEffect(() => {
    if (!isOpen || !bookId) {
      setQualityCheck(null);
      setListeDepliee(false);
      return undefined;
    }
    // Le parent tient deja la liste a jour : on la reprend telle quelle, et on
    // lui demande simplement de la rafraichir — c'est le moment ou le chiffre
    // doit etre exact.
    if (Array.isArray(warningsFromParent)) {
      setQualityCheck({ warnings: warningsFromParent });
      if (onRefreshQuality) onRefreshQuality();
      return undefined;
    }
    let cancelled = false;
    getPrintQualityCheck(bookId)
      .then((result) => { if (!cancelled) setQualityCheck(result); })
      .catch(() => {}); // silencieux : jamais bloquant, juste pas de ligne qualite affichee
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, bookId, warningsFromParent]);

  if (!isOpen || !stats) return null;

  const isReady = stats.incompletePages === 0;
  // Contrat v2 : { warnings: [{pageIndex, itemId, statut, label, thumbnailUrl}], hasWarnings }
  // On ne garde que les PHOTOS : le controle renvoie aussi des avertissements
  // de texte, qui ne parlent pas de nettete et ont leur propre signalement.
  const photoWarnings = (qualityCheck?.warnings || []).filter((entry) => entry.kind !== 'texte');
  const lowQualityCount = photoWarnings.length;

  // Continuer DEPUIS CET ECRAN veut dire "j'ai vu ces avertissements (ou
  // leur absence)" — memorise pour que l'ecran Apercu final, plus loin dans
  // le parcours, n'ait pas besoin de reposer la meme question pour les
  // MEMES photos (retour utilisateur, 2026-09-29). Seulement si le controle
  // a REELLEMENT charge (`qualityCheck` non nul) : sans ca, un controle qui
  // echoue ou n'a pas fini de charger memoriserait a tort "rien a
  // signaler", et desamorcerait le verrou obligatoire de l'ecran suivant
  // pour un livre jamais vraiment verifie.
  const handleContinuer = () => {
    if (qualityCheck) {
      acquitterAvertissementsQualite(bookId, photoWarnings.map((entry) => entry.itemId));
    }
    onContinue();
  };

  // Regroupees PAR PAGE : c'est la page qu'on va rouvrir, pas la photo. Une
  // page portant 3 photos trop justes ne doit apparaitre qu'une fois.
  // `itemId` retient la PREMIERE photo signalee de la page (celle que le
  // clic ouvrira directement, voir plus bas) ; `ratioGap` remonte a vrai des
  // qu'AU MOINS une des photos de la page a une forme tres eloignee de son
  // cadre — c'est le cas le plus frequent (retour utilisateur, 2026-09-29 :
  // 8 photos sur 10 sur un livre reel etaient dans ce cas, pas vraiment
  // "mauvaises", juste tres rognees) et il a une vraie solution en un clic
  // une fois sur la page (photo entiere / autre mise en page), d'ou le mot
  // different ci-dessous plutot que "resolution insuffisante" partout.
  const pagesConcernees = [];
  photoWarnings.forEach((entry) => {
    if (entry.pageIndex == null) return;
    const aUnEcartDeForme = typeof entry.ecartRatio === 'number' && entry.ecartRatio > RATIO_GAP_THRESHOLD;
    const existante = pagesConcernees.find((p2) => p2.pageIndex === entry.pageIndex);
    if (existante) {
      existante.count += 1;
      if (entry.statut === 'insuffisant') existante.pire = 'insuffisant';
      if (aUnEcartDeForme) existante.ratioGap = true;
      return;
    }
    pagesConcernees.push({
      pageIndex: entry.pageIndex,
      itemId: entry.itemId,
      count: 1,
      pire: entry.statut,
      ratioGap: aUnEcartDeForme
    });
  });
  pagesConcernees.sort((x, y) => x.pageIndex - y.pageIndex);

  return (
    <div className="atelier-modal-backdrop" onClick={onClose}>
      <div className="atelier-modal" onClick={(event) => event.stopPropagation()}>
        <div className="atelier-modal-head">
          <h2 className="atelier-modal-title">
            {isReady ? 'Votre livre est prêt à être prévisualisé' : 'Presque prêt'}
          </h2>
          <button type="button" className="atelier-modal-close" onClick={onClose} aria-label="Fermer">×</button>
        </div>

        <ul className="atelier-finish-checklist">
          <li className="is-ok">✓ {stats.photosCount} photo{stats.photosCount > 1 ? 's' : ''} utilisée{stats.photosCount > 1 ? 's' : ''}</li>
          <li className="is-ok">✓ {stats.souvenirsCount} souvenir{stats.souvenirsCount > 1 ? 's' : ''} utilisé{stats.souvenirsCount > 1 ? 's' : ''}</li>
          <li className="is-ok">✓ {stats.pagesCreated} page{stats.pagesCreated > 1 ? 's' : ''} créée{stats.pagesCreated > 1 ? 's' : ''}</li>
          {isReady ? (
            <li className="is-ok">✓ Toutes les pages sont complètes</li>
          ) : (
            <li className="is-warning">⚠️ {stats.incompletePages} page{stats.incompletePages > 1 ? 's' : ''} ne {stats.incompletePages > 1 ? 'sont' : 'est'} pas encore complète{stats.incompletePages > 1 ? 's' : ''}</li>
          )}
          {qualityCheck && (
            lowQualityCount === 0 ? (
              <li className="is-ok">✓ Qualité photo vérifiée</li>
            ) : (
              <li className="is-warning">
                ⚠️ {lowQualityCount} photo{lowQualityCount > 1 ? 's' : ''} pourraient être moins nette{lowQualityCount > 1 ? 's' : ''}
                {pagesConcernees.length > 0 && (
                  <>
                    {' — '}
                    <button
                      type="button"
                      className="atelier-finish-quality-link"
                      onClick={() => setListeDepliee((v) => !v)}
                      aria-expanded={listeDepliee}
                    >
                      {listeDepliee
                        ? 'Masquer les pages'
                        : (pagesConcernees.length > 1
                          ? `Voir les ${pagesConcernees.length} pages concernées`
                          : 'Voir la page concernée')}
                    </button>
                  </>
                )}

                {/* La LISTE, et non un saut vers la premiere page concernee.
                    L'ancien lien menait a la page du premier avertissement :
                    quand c'etait celle ou l'on se trouvait deja (souvent la
                    page 1), cliquer ne produisait rien de visible — "ca ne
                    renvoie nulle part" (2026-09-14). Les pages sont aussi
                    marquees d'un ⚠️ dans la bande de vignettes, pour les
                    retrouver sans rouvrir cet ecran. */}
                {listeDepliee && (
                  <>
                    {/* Astuce generale (retour utilisateur, 2026-09-29) :
                        la plupart de ces avertissements viennent d'un
                        cadrage tres serre, pas d'une photo reellement
                        mauvaise — le dire une fois ici evite de faire
                        chercher la solution a chacun. */}
                    <p className="atelier-finish-quality-tip">
                      Souvent, il suffit de passer la photo en « Photo entière » ou de choisir une mise en page mieux adaptée à sa forme — cliquez sur une page pour essayer directement.
                    </p>
                    <ul className="atelier-finish-quality-pages">
                      {pagesConcernees.map((entree) => (
                        <li key={entree.pageIndex}>
                          <button
                            type="button"
                            className={`atelier-finish-quality-page ${entree.pire === 'insuffisant' ? 'is-severe' : ''}`}
                            // Ouvre DIRECTEMENT l'ajustement de la photo
                            // signalee (retour utilisateur, 2026-09-29) —
                            // avant, "Voir la page concernee" se contentait
                            // de naviguer, il fallait ensuite recliquer sur
                            // la photo soi-meme pour atteindre le message de
                            // forme/suggestion de mise en page (deja
                            // existant, juste mal atteignable). Voir
                            // BookAtelierLuxe.js (onViewPage) : navigue ET
                            // ouvre l'ajustement en un seul geste.
                            onClick={() => { onClose(); if (onViewPage) onViewPage(entree.pageIndex, entree.itemId); }}
                            disabled={!onViewPage}
                          >
                            <span className="atelier-finish-quality-page-num">Page {entree.pageIndex + 1}</span>
                            <span className="atelier-finish-quality-page-count">
                              {entree.count} photo{entree.count > 1 ? 's' : ''}
                              {entree.pire === 'insuffisant'
                                ? (entree.ratioGap ? ' · cadrage très serré' : ' · résolution insuffisante')
                                : ' · un peu juste'}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </li>
            )
          )}
        </ul>

        <div className="atelier-modal-actions">
          {isReady ? (
            <button type="button" className="btn btn-primary" onClick={handleContinuer}>
              Voir mon livre →
            </button>
          ) : (
            <>
              <button type="button" className="btn btn-outline" onClick={onClose}>
                Corriger dans l'atelier
              </button>
              <button type="button" className="btn btn-primary" onClick={handleContinuer}>
                Voir quand même
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default AtelierFinishModal;
