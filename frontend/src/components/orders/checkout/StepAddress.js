import React from 'react';
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
  { name: 'email', placeholder: 'Votre adresse e-mail', type: 'email' },
  { name: 'fullName', placeholder: 'Nom complet' },
  { name: 'line1', placeholder: 'Adresse', autocomplete: true },
  { name: 'line2', placeholder: 'Complement' },
  { name: 'postalCode', placeholder: 'Code postal', autocomplete: true },
  { name: 'city', placeholder: 'Ville' },
  { name: 'country', placeholder: 'Pays' },
  { name: 'phone', placeholder: 'Telephone' }
];

// Facturation : sous-ensemble de FIELDS — ni email ni telephone, deja portes
// par l'adresse de livraison et sans rapport avec une facture.
const BILLING_FIELDS = [
  { name: 'fullName', placeholder: 'Nom complet' },
  { name: 'line1', placeholder: 'Adresse', autocomplete: true },
  { name: 'line2', placeholder: 'Complement' },
  { name: 'postalCode', placeholder: 'Code postal', autocomplete: true },
  { name: 'city', placeholder: 'Ville' },
  { name: 'country', placeholder: 'Pays' }
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
  return (
    <article className="orders-panel">
      <h2>Adresse de livraison</h2>
      <div className="orders-form-grid">
        {FIELDS.map((field) => (field.autocomplete ? (
          <AddressAutocomplete
            key={field.name}
            field={field.name}
            value={address[field.name] || ''}
            address={address}
            onChangeField={onChangeField}
            placeholder={field.placeholder}
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
            placeholder={field.placeholder}
            disabled={locked}
          />
        )))}
      </div>
      <p className="orders-disclaimer">
        Nous utiliserons votre adresse e-mail pour confirmer votre commande, vous envoyer les mises à jour et vous
        permettre de retrouver votre livre.
      </p>
      {incomplete && (
        <p className="orders-disclaimer">
          Nom, adresse, code postal, ville et pays sont necessaires pour l'expedition.
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
        Adresse de facturation identique à l'adresse de livraison
      </label>

      {!billingSameAsShipping && (
        <div className="orders-billing-fields">
          <h3>Adresse de facturation</h3>
          <div className="orders-form-grid">
            {BILLING_FIELDS.map((field) => (field.autocomplete ? (
              <AddressAutocomplete
                key={field.name}
                field={field.name}
                value={billingAddress[field.name] || ''}
                address={billingAddress}
                onChangeField={onChangeBillingField}
                placeholder={field.placeholder}
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
                placeholder={field.placeholder}
                disabled={locked}
              />
            )))}
          </div>
          {billingIncomplete && (
            <p className="orders-disclaimer">
              Nom, adresse, code postal, ville et pays sont necessaires pour la facturation.
            </p>
          )}
        </div>
      )}
    </article>
  );
}

export default StepAddress;
