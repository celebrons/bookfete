import React from 'react';
import { formatPriceCents, includesPrint } from '../../../utils/orderWorkflow';

// Ecran 3 : recapitulatif complet (produit + adresse + total) puis paiement.
// Le recapitulatif est la raison d'etre de cet ecran : c'est le dernier
// moment ou l'utilisateur verifie ce qu'il achete et ou il sera livre, avant
// d'etre redirige vers Stripe.
const TYPE_LABELS = {
  pdf: 'PDF seul',
  print: 'Livre imprime',
  pack: 'Pack PDF + imprime'
};

function StepPayment({
  orderType,
  quantity,
  unitCents,
  totalCents,
  address,
  bookTitle,
  onPay,
  submitting,
  canPay,
  stripeEnabled,
  hasPendingPaymentOrder
}) {
  const withPrint = includesPrint(orderType);

  return (
    <article className="orders-panel">
      <h2>Recapitulatif et paiement</h2>

      <div className="orders-result-grid">
        <div>
          <span>Livre</span>
          <strong>{bookTitle || 'Sans titre'}</strong>
        </div>
        <div>
          <span>Produit</span>
          <strong>{TYPE_LABELS[orderType] || orderType}</strong>
        </div>
      </div>

      <div className="orders-summary">
        <div>
          <span>Prix unitaire</span>
          <strong>{formatPriceCents(unitCents)}</strong>
        </div>
        <div>
          <span>Quantite</span>
          <strong>{quantity}</strong>
        </div>
        <div>
          <span>Total a payer</span>
          <strong>{formatPriceCents(totalCents)}</strong>
        </div>
      </div>

      {withPrint && (
        <div className="orders-recap-address">
          <span>Livraison</span>
          <p>
            {address?.fullName}<br />
            {address?.line1}{address?.line2 ? <>, {address.line2}</> : null}<br />
            {address?.postalCode} {address?.city}<br />
            {address?.country}
          </p>
        </div>
      )}

      <button type="button" className="btn btn-primary" disabled={submitting || !canPay || !stripeEnabled} onClick={onPay}>
        {submitting
          ? 'Traitement...'
          : hasPendingPaymentOrder
            ? 'Payer la commande en attente'
            : 'Payer avec Stripe (test)'}
      </button>

      <p className="orders-disclaimer">
        {stripeEnabled
          ? 'Stripe Checkout en mode test. Utilisez une carte de test Stripe.'
          : 'Le paiement est temporairement indisponible: activez Stripe pour lancer la commande.'}
      </p>
    </article>
  );
}

export default StepPayment;
