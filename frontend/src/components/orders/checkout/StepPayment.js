import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { formatPriceCents, includesPrint } from '../../../utils/orderWorkflow';
import EmailOtpForm from '../../auth/EmailOtpForm';

// Ecran 3 : recapitulatif complet (produit + adresse + total) puis paiement.
// Le recapitulatif est la raison d'etre de cet ecran : c'est le dernier
// moment ou l'utilisateur verifie ce qu'il achete et ou il sera livre, avant
// d'etre redirige vers Stripe.
const TYPE_KEYS = ['pdf', 'print', 'pack'];

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
  const { t } = useTranslation('checkout');
  const withPrint = includesPrint(orderType);
  const typeLabel = TYPE_KEYS.includes(orderType) ? t(`stepPayment.typeLabels.${orderType}`) : orderType;

  return (
    <article className="orders-panel">
      <h2>{t('stepPayment.title')}</h2>

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
            {typeLabel} · {bookTitle || t('flow.bookUntitled')}
          </span>
          <span className="orders-recap-compact-sub">
            {t('stepProduct.qty.unit', { count: quantity })}
            {quantity > 1 && Number.isFinite(unitCents) ? ` · ${t('stepProduct.qty.perUnitPrice', { price: formatPriceCents(unitCents) })}` : ''}
            {withPrint
              ? (Number.isFinite(shippingCents) ? ` · ${t('stepProduct.qty.shipping', { price: formatPriceCents(shippingCents) })}` : ` · ${t('stepPayment.shippingHome')}`)
              : ` · ${t('stepPayment.downloadOnly')}`}
          </span>
        </div>
        <span className="orders-recap-compact-total">{formatPriceCents(totalCents)}</span>
      </div>

      {withPrint && (
        <div className="orders-recap-address">
          <span>{t('stepPayment.delivery')}</span>
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
          <strong>{t('stepPayment.accountGate.title')}</strong>
          <p>
            {t('stepPayment.accountGate.bodyPrefix')}<strong>{t('stepPayment.accountGate.bodyBold')}</strong>{t('stepPayment.accountGate.bodySuffix')}
          </p>
          {/* EN PLACE, jamais une redirection : le livre et la commande en
              cours vivent dans cet ecran. Aller-retour vers une page
              d'inscription = autant d'occasions de les perdre, et c'est
              exactement ce qui ne renvoyait nulle part avant le 2026-09-20. */}
          <EmailOtpForm
            emailInitial={emailPropose}
            libelleAction={t('stepPayment.accountGate.continueAction')}
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
              {t('stepPayment.cgv.accept')}{' '}
              <Link to="/cgv" target="_blank" rel="noreferrer">{t('stepPayment.cgv.terms')}</Link>
              {withPrint && (
                <>
                  {' '}{t('stepPayment.cgv.printClause')}
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
              ? t('stepPayment.pay.processing')
              : hasPendingPaymentOrder
                ? t('stepPayment.pay.payPending')
                : t('stepPayment.pay.payStripe')}
          </button>

          <p className="orders-disclaimer">
            {stripeEnabled
              ? t('stepPayment.stripeNote.enabled')
              : t('stepPayment.stripeNote.disabled')}
          </p>
        </>
      )}
    </article>
  );
}

export default StepPayment;
