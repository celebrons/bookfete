import React from 'react';
import { ORDER_STATUS_SEQUENCE, getOrderStatusConfig, includesPdf, includesPrint } from '../../../utils/orderWorkflow';
import GenerationProgress from './GenerationProgress';
import './StepTracking.css';

// Ecran 4 : suivi REEL de production (2026-09-11). Jusqu'ici la page se
// contentait d'afficher `order.status`, une valeur qui n'avancait jamais
// toute seule pour une commande imprimee. Ici, l'etat vient de l'imprimeur
// lui-meme (voir backend GET /api/orders/:orderId/tracking, qui interroge
// Gelato et ne fait jamais RECULER un statut).
//
// DEUX SUIVIS COTE A COTE (2026-09-20). Une commande « Pack » achete deux
// choses qui n'avancent pas au meme rythme : un fichier pret en quelques
// minutes, et un livre imprime puis expedie en plusieurs jours. Une frise
// unique melangeait les deux — on y lisait « Imprime » alors qu'on attendait
// son PDF, et inversement. Chaque produit achete a donc son volet, et un
// seul volet s'affiche quand un seul produit a ete achete.
//
// Purement presentatif : le chargement/rafraichissement est pilote par
// BookCheckoutLuxe.js.

// Etapes affichees dans le volet impression. Le PDF, lui, n'a pas de frise :
// il est en fabrication ou il est pret, et la barre de progression dit deja
// ou il en est.
//
// « Mise en production » (`print_queued`) A ETE RETIREE (2026-09-20). Elle
// s'intercalait entre le paiement et l'envoi, et ne decrivait rien que
// l'acheteur puisse constater : quand l'envoi a l'imprimeur reussit, on
// passe directement a « Envoye imprimeur ». Le statut existe toujours en
// base pour les commandes d'avant, il est simplement affiche sur cette
// etape-la (voir etapeAffichee).
const PRINT_STEPS = ['paid', 'sent_to_printer', 'printed', 'shipped', 'delivered'];

// Les commandes anterieures peuvent encore porter `print_queued` : elles
// s'affichent sur l'etape « Envoye imprimeur », qui la remplace.
const etapeAffichee = (statut) => (statut === 'print_queued' ? 'sent_to_printer' : statut);

function buildPrintTimeline(currentStatus) {
  const statutAffiche = etapeAffichee(currentStatus);
  const currentRank = ORDER_STATUS_SEQUENCE.indexOf(statutAffiche);

  return PRINT_STEPS.map((key) => {
    const rank = ORDER_STATUS_SEQUENCE.indexOf(key);
    return {
      key,
      label: getOrderStatusConfig(key).label,
      done: currentRank > -1 && rank > -1 && rank < currentRank,
      current: key === statutAffiche
    };
  });
}

// DEUX STATUTS QUAND ON A ACHETE DEUX CHOSES (2026-09-20).
//
// Un « Pack » n'a pas un etat, il en a deux : le fichier peut etre pret
// pendant que le livre est encore sous presse. Un statut unique en haut de
// page devait donc choisir lequel mentir.
const statutDuPdf = ({ pret, enCours }) => {
  if (pret) return { label: 'Disponible', tone: 'is-ready' };
  if (enCours) return { label: 'En fabrication', tone: 'is-progress' };
  return { label: 'En attente', tone: 'is-muted' };
};

const statutDeLImpression = ({ statut, gelatoOrderId, echec }) => {
  if (echec) return { label: 'Envoi a reprendre', tone: 'is-error' };
  const affiche = etapeAffichee(statut);
  if (['printed', 'shipped', 'delivered', 'cancelled', 'failed'].includes(affiche)) {
    return getOrderStatusConfig(affiche);
  }
  if (affiche === 'sent_to_printer' || gelatoOrderId) {
    return { label: "Chez l'imprimeur", tone: 'is-progress' };
  }
  return { label: 'Envoi en cours', tone: 'is-progress' };
};

// Icones : demandees explicitement (2026-09-20) pour que l'action se
// reconnaisse avant d'etre lue — une fleche qui descend pour telecharger,
// deux fleches qui tournent pour refabriquer.
function IconeTelecharger() {
  return (
    <svg className="btn-icone" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3v12" />
      <path d="m7 11 5 5 5-5" />
      <path d="M4 19h16" />
    </svg>
  );
}

function IconeRegenerer() {
  return (
    <svg className="btn-icone" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 11a8 8 0 0 0-13.8-5.5L3 8.5" />
      <path d="M4 13a8 8 0 0 0 13.8 5.5L21 15.5" />
      <path d="M3 4v4.5h4.5" />
      <path d="M21 20v-4.5h-4.5" />
    </svg>
  );
}

// Date lisible, sans bibliotheque : « 20 septembre à 14:32 ».
function formaterDate(valeur) {
  if (!valeur) return null;
  const date = new Date(valeur);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit'
  });
}

function formaterJour(valeur) {
  if (!valeur) return null;
  const date = new Date(valeur);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
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
  const isPrint = includesPrint(order.type);
  // Le PDF n'existe, pour le client, que s'il l'a ACHETE. Une commande
  // `print` en fabrique bien un en interne (le fichier envoye a
  // l'imprimeur), et metadata.pdfReady passe donc a vrai — mais ce fichier
  // ne lui appartient pas : il a paye un livre, pas un fichier. Sans ce
  // garde-fou, l'ecran proposait « Telecharger le PDF final » a un
  // acheteur qui ne l'avait pas commande (2026-09-18).
  const pdfAchete = includesPdf(order.type);
  const pdfReady = pdfAchete && (status === 'pdf_ready' || order?.metadata?.pdfReady);

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
  const pdfEnCours = pdfAchete && !pdfReady && (
    regeneratingPdf
    || status === 'pdf_generating'
    || pdfJob?.status === 'queued'
    || pdfJob?.status === 'rendering'
  );

  const gelatoOrderId = tracking?.gelatoOrderId || order?.metadata?.gelatoOrderId || null;
  const envoyeLe = formaterDate(tracking?.gelatoSubmittedAt || order?.metadata?.gelatoSubmittedAt);
  const echecEnvoi = tracking?.gelatoError || order?.metadata?.gelatoError || null;
  const livraisonMin = formaterJour(tracking?.delivery?.minDate);
  const livraisonMax = formaterJour(tracking?.delivery?.maxDate);
  const verifieLe = formaterDate(tracking?.updatedAt);
  const deuxVolets = pdfAchete && isPrint;

  const infoPdf = statutDuPdf({ pret: pdfReady, enCours: pdfEnCours });
  const infoImpression = statutDeLImpression({ statut: status, gelatoOrderId, echec: echecEnvoi });

  return (
    <article className="orders-panel">
      <h2>Votre commande</h2>

      <div className="orders-result-grid">
        <div>
          <span>Numero</span>
          <strong>{order.order_number}</strong>
        </div>
        {pdfAchete && (
          <div>
            <span>{isPrint ? 'Statut PDF' : 'Statut'}</span>
            <strong className={infoPdf.tone}>{infoPdf.label}</strong>
          </div>
        )}
        {isPrint && (
          <div>
            <span>{pdfAchete ? 'Statut impression' : 'Statut'}</span>
            <strong className={infoImpression.tone}>{infoImpression.label}</strong>
          </div>
        )}
      </div>

      <div className={`tracking-panes ${deuxVolets ? 'is-double' : ''}`}>
        {/* ----------------------------- VOLET PDF ----------------------- */}
        {pdfAchete && (
          <section className="tracking-pane">
            <h3 className="tracking-pane-title">Votre PDF</h3>

            {pdfEnCours && (
              <>
                {/* Entre le clic et la premiere reponse du serveur, le job
                    n'existe pas encore : on affiche la meme valeur de depart
                    que le serveur, plutot qu'un blanc. */}
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
                    <IconeRegenerer />
                    {regeneratingPdf ? 'Relance…' : 'Relancer la fabrication'}
                  </button>
                )}
              </>
            )}

            {pdfReady && (
              <>
                <p className="tracking-ready">
                  <span className="tracking-ready-dot" aria-hidden="true" />
                  PDF disponible
                </p>
                <div className="tracking-pane-actions">
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => onDownloadPdf('final')}
                    disabled={downloadingKind === 'final'}
                  >
                    <IconeTelecharger />
                    {downloadingKind === 'final' ? 'Téléchargement…' : 'Télécharger'}
                  </button>
                  {onRegeneratePdf && (
                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={onRegeneratePdf}
                      disabled={regeneratingPdf}
                      title="Refabrique le PDF a partir de votre livre actuel"
                    >
                      <IconeRegenerer />
                      {regeneratingPdf ? 'Régénération…' : 'Régénérer'}
                    </button>
                  )}
                </div>
              </>
            )}

            {!pdfEnCours && !pdfReady && (
              <p className="orders-disclaimer">
                La fabrication démarre dès le paiement validé.
              </p>
            )}
          </section>
        )}

        {/* ------------------------- VOLET IMPRESSION -------------------- */}
        {isPrint && (
          <section className="tracking-pane">
            <h3 className="tracking-pane-title">Votre livre imprimé</h3>

            {/* DIRE QUE C'EST PARTI, ET SOUS QUEL NUMERO (2026-09-20).
                L'envoi a l'imprimeur se declenche tout seul apres le
                paiement, en tache de fond : rien ne le disait, et on ne
                savait pas si le livre avait ete transmis. */}
            {echecEnvoi ? (
              <p className="tracking-sent is-failed">
                L’envoi à l’imprimeur a échoué : {echecEnvoi}. Notre équipe le relance,
                votre commande n’est pas perdue.
              </p>
            ) : gelatoOrderId ? (
              <p className="tracking-sent">
                <span className="tracking-ready-dot" aria-hidden="true" />
                Reçu par l’imprimeur{envoyeLe ? ` le ${envoyeLe}` : ''}
                <span className="tracking-sent-ref">n° {gelatoOrderId}</span>
              </p>
            ) : (
              <p className="tracking-sent is-pending">
                <span className="tracking-spinner" aria-hidden="true" />
                Transmission à l’imprimeur en cours… cette page se met à jour toute seule.
              </p>
            )}

            <ol className="tracking-timeline">
              {buildPrintTimeline(status).map((step) => (
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

            {/* Transparence quand l'information n'est pas fraiche ou pas
                comprise : mieux vaut le dire que d'afficher un etat
                faussement rassurant. */}
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

            {/* Le suivi se rafraichit tout seul (BookCheckoutLuxe) : ce lien
                n'existe que pour ne pas attendre le prochain cycle, et la
                date dit si ca vaut la peine de cliquer. Un gros bouton
                « Actualiser le suivi » laissait croire qu'il fallait le
                faire soi-meme. */}
            <p className="tracking-freshness">
              {loadingTracking
                ? 'Vérification auprès de l’imprimeur…'
                : verifieLe ? `Vérifié le ${verifieLe}` : 'Mise à jour automatique'}
              {' · '}
              <button type="button" className="tracking-refresh" onClick={onRefreshTracking} disabled={loadingTracking}>
                Vérifier maintenant
              </button>
            </p>
          </section>
        )}
      </div>

      {/* LES DELAIS, EN BAS (2026-09-20).
          Uniquement ceux annonces par l'imprimeur lui-meme : aucun
          « comptez 3 a 5 jours » ecrit en dur, qui deviendrait faux le jour
          ou l'imprimeur change de pays de production (voir backend
          gelatoTracking.extractDelivery). Tant qu'il n'a rien annonce, on le
          DIT plutot que de laisser un vide qui ressemble a un oubli. */}
      {isPrint && (
        <p className="tracking-delais">
          {livraisonMin || livraisonMax ? (
            <>
              <strong>Livraison annoncée par l’imprimeur : </strong>
              {livraisonMin && livraisonMax
                ? `entre le ${livraisonMin} et le ${livraisonMax}`
                : `à partir du ${livraisonMin || livraisonMax}`}
              {tracking?.tracking?.carrier ? ` — ${tracking.tracking.carrier}` : ''}
            </>
          ) : (
            <>L’imprimeur n’a pas encore communiqué de date de livraison. Elle apparaîtra ici
            dès qu’il l’aura fixée, avec le numéro de colis.</>
          )}
        </p>
      )}

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
