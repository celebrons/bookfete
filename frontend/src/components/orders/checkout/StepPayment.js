import React from 'react';
import { formatPriceCents, includesPrint } from '../../../utils/orderWorkflow';
import EmailOtpForm from '../../auth/EmailOtpForm';

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
  hasPendingPaymentOrder,
  isAnonymous = false,
  // Appele une fois l'adresse verifiee : la page de commande reprend la main
  // (elle recharge la session et poursuit le paiement).
  onAccountReady,
  // L'adresse de livraison deja saisie, proposee par defaut — une personne
  // qui vient de la taper ne devrait pas avoir a la retaper.
  emailPropose = ''
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

      {/* SANS COMPTE, LE PAIEMENT EST IMPOSSIBLE — autant le dire ici plutot
          qu'apres le clic. Le serveur refuse la creation de commande en
          session anonyme (403 requiresAccount) : la personne cliquait
          "Payer", lisait "Creez votre compte pour commander" et restait
          bloquee la, sans lien (signale le 2026-09-19). */}
      {isAnonymous ? (
        <div className="orders-account-gate">
          <strong>Une dernière chose : votre adresse e-mail</strong>
          <p>
            Elle vous permettra de retrouver ce livre, de suivre sa fabrication et de
            revenir sur votre commande — y compris depuis un autre appareil. Nous vous
            envoyons un code par e-mail : <strong>pas de mot de passe à inventer</strong>.
            Votre livre est déjà enregistré, rien n’est perdu et vous ne quittez pas
            cette page.
          </p>
          {/* EN PLACE, jamais une redirection : le livre et la commande en
              cours vivent dans cet ecran. Aller-retour vers une page
              d'inscription = autant d'occasions de les perdre, et c'est
              exactement ce qui ne renvoyait nulle part avant le 2026-09-20. */}
          <EmailOtpForm
            emailInitial={emailPropose}
            libelleAction="Valider et continuer"
            onSuccess={onAccountReady}
          />
        </div>
      ) : (
        <>
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
        </>
      )}
    </article>
  );
}

export default StepPayment;
