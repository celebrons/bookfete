import React from 'react';
import { Link } from 'react-router-dom';
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
  shippingCents,
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
  emailPropose = '',
  // Case CGV (retour utilisateur, 2026-09-28) — voir BookCheckoutLuxe.js.
  cgvAccepted = false,
  onToggleCgv
}) {
  const withPrint = includesPrint(orderType);

  return (
    <article className="orders-panel">
      <h2>Recapitulatif et paiement</h2>

      {/* UN SEUL BLOC (retour utilisateur, 2026-09-30, piste "Commande &
          compte") : livre + produit + quantite + total tenaient avant sur
          quatre a six lignes encadrees separement (orders-result-grid +
          orders-summary). Le detail (unite, livraison) reste present en
          texte discret sous le titre — rien n'est perdu, juste regroupe
          autour du seul chiffre qui compte vraiment avant de payer : le
          total. */}
      <div className="orders-recap-compact">
        <div>
          <span className="orders-recap-compact-title">
            {TYPE_LABELS[orderType] || orderType} · {bookTitle || 'Sans titre'}
          </span>
          <span className="orders-recap-compact-sub">
            {quantity} exemplaire{quantity > 1 ? 's' : ''}
            {quantity > 1 && Number.isFinite(unitCents) ? ` · ${formatPriceCents(unitCents)} l'unité` : ''}
            {withPrint
              ? (Number.isFinite(shippingCents) ? ` · livraison ${formatPriceCents(shippingCents)}` : ' · livraison à domicile')
              : ' · téléchargement uniquement'}
          </span>
        </div>
        <span className="orders-recap-compact-total">{formatPriceCents(totalCents)}</span>
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
          {/* Case CGV (retour utilisateur, 2026-09-28) : c'est elle qui rend
              opposable l'exclusion du droit de retractation (art. L221-28,
              CGVLuxe.js §5) — l'acceptation doit etre ECRITE et ANTERIEURE
              au paiement, jamais deduite d'un simple clic sur "Payer". */}
          <label className="orders-cgv-toggle">
            <input
              type="checkbox"
              checked={cgvAccepted}
              onChange={onToggleCgv}
              disabled={submitting}
            />
            <span>
              J'accepte les{' '}
              <Link to="/cgv" target="_blank" rel="noreferrer">conditions générales de vente</Link>
              {withPrint && (
                <>
                  {' '}et reconnais que mon livre, personnalisé, n'est pas soumis au droit de rétractation
                </>
              )}
              .
            </span>
          </label>

          <button
            type="button"
            className="btn btn-primary"
            disabled={submitting || !canPay || !stripeEnabled || !cgvAccepted}
            onClick={onPay}
          >
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
