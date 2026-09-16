import React from 'react';
import { ORDER_STATUS_SEQUENCE, getOrderStatusConfig, includesPrint } from '../../../utils/orderWorkflow';
import GenerationProgress from './GenerationProgress';
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

function StepTracking({
  order,
  tracking,
  loadingTracking,
  onRefreshTracking,
  onDownloadPdf,
  // Refabriquer le PDF. Le serveur reutilise celui deja produit tant qu'il
  // existe — economie legitime (un rendu coute plusieurs minutes), mais sans
  // ce bouton il devenait impossible d'obtenir un PDF a jour apres une
  // correction du rendu (2026-09-15).
  onRegeneratePdf,
  regeneratingPdf,
  // Avancement du PDF client, publie par le serveur (voir backend
  // GET /books/:id/export-final-pdf/:jobId/status). Meme forme que la
  // progression de l'envoi Gelato : meme composant d'affichage.
  pdfJob,
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

  // Le PDF est-il en train d'etre fabrique ?
  //
  // Le statut de la COMMANDE fait foi, pas seulement le job suivi par cet
  // onglet : si la reponse du serveur s'est perdue (reveil d'instance,
  // reseau), on n'a plus d'identifiant de job a suivre — et l'ecran
  // n'affichait alors AUCUNE barre, juste une phrase. C'est exactement ce
  // qui a ete signale le 2026-09-15. `regeneratingPdf` couvre en plus le
  // court instant entre le clic et la premiere reponse.
  // Un PDF PRET l emporte sur tout le reste. Le suivi du job vit dans cet
  // onglet : si son sondage s interrompt (reseau, serveur occupe a rendre),
  // pdfJob reste fige sur sa derniere valeur — « 15 / 32 pages » — alors que
  // le serveur, lui, a fini et envoye l email. Sans cette garde, la barre
  // restait affichee indefiniment sur un travail deja termine (2026-09-16).
  const pdfEnCours = !pdfReady && (
    regeneratingPdf
    || status === 'pdf_generating'
    || pdfJob?.status === 'queued'
    || pdfJob?.status === 'rendering'
  );

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

      {/* Fabrication du PDF : plusieurs minutes de rendu haute resolution.
          Le travail se poursuit cote serveur meme si l'onglet est ferme —
          c'est ce qui autorise a le dire ici, et un email vient le
          confirmer (backend : notifierPdfPret). */}
      {pdfEnCours && (
        <div className="pdf-build-block">
          <h3>Votre PDF est en cours de fabrication</h3>
          {/* Entre le clic et la premiere reponse du serveur, le job
              n'existe pas encore : on affiche la meme valeur de depart que
              le serveur, plutot qu'un blanc. */}
          <GenerationProgress
            progress={pdfJob?.progress || { phase: 'starting', done: 0, total: 0 }}
            label="Fabrication du PDF..."
          />
          <p className="orders-disclaimer">
            Il sera disponible dans quelques minutes. <strong>Vous serez informé par email</strong> dès
            qu’il sera prêt : vous pouvez fermer cette page, la fabrication continue de notre côté.
          </p>
          {onRegeneratePdf && (
            <button
              type="button"
              className="btn btn-outline pdf-build-relaunch"
              onClick={onRegeneratePdf}
              disabled={regeneratingPdf}
              title="Repart de zero si la fabrication semble arretee"
            >
              {regeneratingPdf ? 'Relance…' : 'Relancer la fabrication'}
            </button>
          )}
        </div>
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
        {pdfReady && onRegeneratePdf && (
          <button
            type="button"
            className="btn btn-outline"
            onClick={onRegeneratePdf}
            disabled={regeneratingPdf}
            title="Refabrique le PDF a partir de votre livre actuel"
          >
            {regeneratingPdf ? 'Regeneration…' : 'Régénérer le PDF'}
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
          {gelatoSending && <GenerationProgress progress={gelatoProgress} />}
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
