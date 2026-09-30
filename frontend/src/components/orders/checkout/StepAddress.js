import React from 'react';
import { useTranslation } from 'react-i18next';
import AddressAutocomplete from '../../common/AddressAutocomplete';

// Ecran 2 : adresse de livraison. Affiche uniquement pour une commande
// contenant un livre imprime — une commande PDF saute purement et
// simplement cette etape (voir BookCheckoutLuxe.js: buildSteps).
// Champs repris tels quels de l'ancienne page (meme `name`, meme handler) :
// c'est `sanitizeAddress`/`isAddressValid` cote backend qui reste l'autorite
// sur ce qui est acceptable.
//
// `autocomplete: true` sur la rue et le code postal : ces deux champs
// proposent des suggestions issues de la Base Adresse Nationale, et choisir
// une suggestion remplit aussi les autres (voir AddressAutocomplete.js).
// Purement facultatif — la saisie libre reste possible partout, et le service
// n'est jamais bloquant.
const FIELDS = [
  // L'EMAIL EN PREMIER, et porte par la COMMANDE.
  //
  // C'est lui qui permet d'ecrire au client — confirmation, paiement,
  // expedition — sans lui imposer de creer un compte avec mot de passe
  // (decision produit 2026-09-15). C'est aussi la seule adresse dont dispose
  // le webhook Stripe, qui n'est pas authentifie : sans elle, la
  // confirmation de paiement n'a aucun destinataire.
  { name: 'email', type: 'email' },
  { name: 'fullName' },
  { name: 'line1', autocomplete: true },
  { name: 'line2' },
  { name: 'postalCode', autocomplete: true },
  { name: 'city' },
  { name: 'country' },
  { name: 'phone' }
];

// Facturation : sous-ensemble de FIELDS — ni email ni telephone, deja portes
// par l'adresse de livraison et sans rapport avec une facture.
const BILLING_FIELDS = [
  { name: 'fullName' },
  { name: 'line1', autocomplete: true },
  { name: 'line2' },
  { name: 'postalCode', autocomplete: true },
  { name: 'city' },
  { name: 'country' }
];

function StepAddress({
  address,
  onChangeField,
  locked,
  incomplete,
  billingSameAsShipping,
  onToggleBillingSame,
  billingAddress,
  onChangeBillingField,
  billingIncomplete
}) {
  const { t } = useTranslation('checkout');
  return (
    <article className="orders-panel">
      <h2>{t('stepAddress.title')}</h2>
      <div className="orders-form-grid">
        {FIELDS.map((field) => (field.autocomplete ? (
          <AddressAutocomplete
            key={field.name}
            field={field.name}
            value={address[field.name] || ''}
            address={address}
            onChangeField={onChangeField}
            placeholder={t(`stepAddress.fields.${field.name}`)}
            disabled={locked}
          />
        ) : (
          <input
            key={field.name}
            className="input-luxe"
            name={field.name}
            type={field.type || 'text'}
            value={address[field.name] || ''}
            onChange={onChangeField}
            placeholder={t(`stepAddress.fields.${field.name}`)}
            disabled={locked}
          />
        )))}
      </div>
      <p className="orders-disclaimer">
        {t('stepAddress.emailNote')}
      </p>
      {incomplete && (
        <p className="orders-disclaimer">
          {t('stepAddress.incompleteWarning')}
        </p>
      )}

      {/* Facturation : cochee par defaut (cas le plus frequent, de loin),
          decochable pour saisir une adresse distincte — retour utilisateur
          2026-09-27. Les champs de facturation n'apparaissent QUE si la case
          est decochee : un formulaire toujours visible aurait double la
          longueur de cet ecran pour un cas minoritaire. */}
      <label className="orders-billing-toggle">
        <input
          type="checkbox"
          checked={billingSameAsShipping}
          onChange={onToggleBillingSame}
          disabled={locked}
        />
        {t('stepAddress.billingSameLabel')}
      </label>

      {!billingSameAsShipping && (
        <div className="orders-billing-fields">
          <h3>{t('stepAddress.billingTitle')}</h3>
          <div className="orders-form-grid">
            {BILLING_FIELDS.map((field) => (field.autocomplete ? (
              <AddressAutocomplete
                key={field.name}
                field={field.name}
                value={billingAddress[field.name] || ''}
                address={billingAddress}
                onChangeField={onChangeBillingField}
                placeholder={t(`stepAddress.fields.${field.name}`)}
                disabled={locked}
              />
            ) : (
              <input
                key={field.name}
                className="input-luxe"
                name={field.name}
                type={field.type || 'text'}
                value={billingAddress[field.name] || ''}
                onChange={onChangeBillingField}
                placeholder={t(`stepAddress.fields.${field.name}`)}
                disabled={locked}
              />
            )))}
          </div>
          {billingIncomplete && (
            <p className="orders-disclaimer">
              {t('stepAddress.billingIncompleteWarning')}
            </p>
          )}
        </div>
      )}
    </article>
  );
}

export default StepAddress;
