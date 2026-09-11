import React from 'react';
import { ORDER_STATUS_SEQUENCE, getOrderStatusConfig, includesPrint } from '../../../utils/orderWorkflow';
import './StepTracking.css';

// Ecran 4 : suivi REEL de production (2026-09-11). Jusqu'ici la page se
// contentait d'afficher `order.status`, une valeur qui n'avancait jamais
// toute seule pour une commande imprimee. Ici, l'etat vient de l'imprimeur
// lui-meme (voir backend GET /api/orders/:orderId/tracking, qui interroge
// Gelato et ne fait jamais RECULER un statut).
//
// Purement presentatif : le chargement/rafraichissement est pilote par
// BookCheckoutLuxe.js.

// Etapes affichees selon le type de commande : une commande PDF n'a rien a
// imprimer ni a expedier, une commande imprimee ne passe pas par la
// generation du PDF client.
const PDF_STEPS = ['paid', 'pdf_generating', 'pdf_ready'];
const PRINT_STEPS = ['paid', 'print_queued', 'sent_to_printer', 'printed', 'shipped', 'delivered'];

function buildTimeline(orderType, currentStatus) {
  const keys = includesPrint(orderType)
    ? PRINT_STEPS
    : PDF_STEPS;
  const currentRank = ORDER_STATUS_SEQUENCE.indexOf(currentStatus);

  return keys.map((key) => {
    const rank = ORDER_STATUS_SEQUENCE.indexOf(key);
    return {
      key,
      label: getOrderStatusConfig(key).label,
      done: currentRank > -1 && rank > -1 && rank < currentRank,
      current: key === currentStatus
    };
  });
}

// Libelle de chaque phase de la generation du fichier d'impression (le
// backend les renvoie dans metadata.gelatoProgress). Le rendu des pages est
// de loin la plus longue : c'est la seule qui a une progression chiffree,
// les autres sont annoncees pour que la barre ne reste jamais figee sans
// explication.
const PROGRESS_LABELS = {
  starting: 'Preparation...',
  cover: 'Rendu de la couverture...',
  pages: 'Rendu des pages',
  assembling: 'Assemblage du PDF...',
  uploading: 'Envoi du fichier a l\'imprimeur...',
  submitting: 'Creation de la commande chez Gelato...'
};

function GelatoProgress({ progress }) {
  // Premier point de mesure de la phase "pages", garde d'un rendu a
  // l'autre. Il sert a deduire la CADENCE REELLE de la machine qui rend le
  // livre : elle n'a rien a voir en local et sur Render (CPU bien plus
  // lent), une constante en dur donnerait une promesse fausse la moitie du
  // temps. Les horodatages viennent du serveur (progress.updatedAt), pas de
  // l'horloge du navigateur : l'estimation reste juste meme si une reponse
  // de sondage arrive en retard.
  const paceRef = React.useRef(null);

  const phase = progress?.phase;
  const done = progress?.done || 0;
  const total = progress?.total || 0;
  const updatedAtMs = progress?.updatedAt ? Date.parse(progress.updatedAt) : NaN;

  if (phase === 'pages' && done > 0 && !paceRef.current && !Number.isNaN(updatedAtMs)) {
    paceRef.current = { done, at: updatedAtMs };
  }

  if (!progress) return null;

  const hasCount = phase === 'pages' && total > 0;
  // Pourcentage REEL quand on le connait (pages rendues / total). Pour les
  // phases sans decompte, on n'invente pas de chiffre : barre indeterminee.
  const percent = hasCount ? Math.round((done / total) * 100) : null;

  // Duree restante : affichee seulement une fois qu'on a DEUX points de
  // mesure. Avant ca, le decompte "x / y pages" suffit — mieux vaut ne rien
  // annoncer qu'annoncer n'importe quoi.
  const pace = paceRef.current;
  let remainingLabel = null;
  if (hasCount && pace && done > pace.done && !Number.isNaN(updatedAtMs)) {
    const secondsPerPage = (updatedAtMs - pace.at) / 1000 / (done - pace.done);
    if (secondsPerPage > 0) {
      const remainingMin = Math.round(((total - done) * secondsPerPage) / 60);
      remainingLabel = remainingMin >= 1
        ? `Environ ${remainingMin} min restantes.`
        : 'Plus que quelques secondes.';
    }
  }

  return (
    <div className="gelato-progress">
      <div className="gelato-progress-head">
        <span>{PROGRESS_LABELS[phase] || 'Generation en cours...'}</span>
        {hasCount && <span className="gelato-progress-count">{done} / {total} pages</span>}
      </div>
      <div className={`gelato-progress-bar ${percent === null ? 'is-indeterminate' : ''}`}>
        <div
          className="gelato-progress-fill"
          style={percent === null ? undefined : { width: `${percent}%` }}
        />
      </div>
      {remainingLabel && <p className="gelato-progress-note">{remainingLabel}</p>}
    </div>
  );
}

function StepTracking({
  order,
  tracking,
  loadingTracking,
  onRefreshTracking,
  onDownloadPdf,
  downloadingKind,
  gelatoTestAvailable,
  gelatoSending,
  gelatoProgress,
  gelatoResult,
  gelatoError,
  onSendGelatoTest
}) {
  if (!order) return null;

  const status = tracking?.status || order.status;
  const statusConfig = getOrderStatusConfig(status);
  const timeline = buildTimeline(order.type, status);
  const isPrint = includesPrint(order.type);
  const pdfReady = status === 'pdf_ready' || order?.metadata?.pdfReady;

  return (
    <article className="orders-panel">
      <h2>Suivi de production</h2>

      <div className="orders-result-grid">
        <div>
          <span>Numero</span>
          <strong>{order.order_number}</strong>
        </div>
        <div>
          <span>Statut</span>
          <strong className={statusConfig.tone}>{statusConfig.label}</strong>
        </div>
      </div>

      <ol className="tracking-timeline">
        {timeline.map((step) => (
          <li
            key={step.key}
            className={`tracking-step ${step.done ? 'is-done' : ''} ${step.current ? 'is-current' : ''}`}
          >
            <span className="tracking-dot" aria-hidden="true" />
            <span className="tracking-label">{step.label}</span>
          </li>
        ))}
      </ol>

      {/* Numero de suivi : n'apparait que quand le transporteur en a fourni un. */}
      {tracking?.tracking?.code && (
        <p className="tracking-carrier">
          Colis {tracking.tracking.carrier ? `(${tracking.tracking.carrier})` : ''} :{' '}
          {tracking.tracking.url ? (
            <a href={tracking.tracking.url} target="_blank" rel="noreferrer">{tracking.tracking.code}</a>
          ) : (
            <strong>{tracking.tracking.code}</strong>
          )}
        </p>
      )}

      {/* Transparence quand l'information n'est pas fraiche ou pas comprise :
          mieux vaut le dire que d'afficher un etat faussement rassurant. */}
      {tracking?.stale && (
        <p className="orders-disclaimer">
          L'imprimeur est momentanement injoignable : voici le dernier etat connu.
        </p>
      )}
      {tracking?.gelatoStatusUnknown && (
        <p className="orders-disclaimer">
          Etat renvoye par l'imprimeur : <strong>{tracking.gelatoStatus}</strong> (non traduit).
        </p>
      )}

      <div className="orders-download-actions">
        {isPrint && (
          <button type="button" className="btn btn-outline" onClick={onRefreshTracking} disabled={loadingTracking}>
            {loadingTracking ? 'Actualisation...' : 'Actualiser le suivi'}
          </button>
        )}
        {pdfReady && (
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => onDownloadPdf('final')}
            disabled={downloadingKind === 'final'}
          >
            {downloadingKind === 'final' ? 'Telechargement...' : 'Telecharger le PDF final'}
          </button>
        )}
      </div>

      {/* Envoi de test a l'imprimeur : sa place logique est ici, c'est ce qui
          cree la commande de production sans passer par un paiement. */}
      {gelatoTestAvailable && isPrint && (
        <div className="tracking-test-block">
          <h3>Envoi de test a l'imprimeur</h3>
          <p className="orders-disclaimer">
            Envoie ce livre a Gelato en <strong>brouillon</strong> : le vrai fichier d'impression est genere et
            depose chez l'imprimeur, mais rien n'est facture ni imprime. La generation prend plusieurs minutes
            (chaque page est rendue en haute resolution) : laissez cette page ouverte.
          </p>
          <button type="button" className="btn btn-outline" disabled={gelatoSending} onClick={onSendGelatoTest}>
            {gelatoSending ? 'Generation en cours...' : 'Envoyer a Gelato (test)'}
          </button>
          {gelatoSending && <GelatoProgress progress={gelatoProgress} />}
          {gelatoResult && (
            <p className="orders-disclaimer">
              {gelatoResult.skipped
                // Ne peut plus arriver que pour une VRAIE commande (chemin
                // paiement) : un brouillon de test est desormais rejouable,
                // notamment apres un changement de format.
                ? `Cette commande a deja ete envoyee en production (${gelatoResult.gelatoOrderId}) : elle ne peut pas etre renvoyee.`
                : `Brouillon cree chez Gelato : ${gelatoResult.gelatoOrderId}.`}
            </p>
          )}
          {gelatoResult && !gelatoResult.skipped && (
            <p className="orders-disclaimer">
              Vous pouvez relancer un envoi apres avoir change de format ou modifie le livre : le brouillon
              precedent est remplace chez l'imprimeur.
            </p>
          )}
          {gelatoError && <p className="orders-error">{gelatoError}</p>}
        </div>
      )}
    </article>
  );
}

export default StepTracking;
