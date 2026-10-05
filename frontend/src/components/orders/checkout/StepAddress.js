import React from 'react';
import { useTranslation } from 'react-i18next';
import AddressAutocomplete from '../../common/AddressAutocomplete';
import { requiresStateField } from '../../../utils/countryCodes';

// Ecran 2 : adresse de livraison pour un livre imprime, ou facturation
// seule pour une commande PDF (prop `billingOnly`, voir BookCheckoutLuxe.js:
// steps) — rien a expedier, mais une facture doit identifier son
// destinataire (retour utilisateur, 2026-10-04).
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
  // state : AVANT country, pas apres — vient d'etre saisi/choisi juste au
  // moment ou son pays le rend pertinent (voir plus bas, affiche seulement
  // pour US/CA/AU).
  { name: 'state' },
  { name: 'country' },
  { name: 'phone' }
];

// Facturation : sous-ensemble de FIELDS — ni email ni telephone, deja portes
// par l'adresse de livraison et sans rapport avec une facture. Pas de
// `state` non plus : la facturation n'est jamais envoyee a Gelato (voir
// gelatoOrderService.js), seul le champ "livraison" en a besoin.
const BILLING_FIELDS = [
  { name: 'fullName' },
  { name: 'line1', autocomplete: true },
  { name: 'line2' },
  { name: 'postalCode', autocomplete: true },
  { name: 'city' },
  { name: 'country' }
];

// Les champs TOUJOURS obligatoires (meme liste que addressComplete/
// billingComplete dans BookCheckoutLuxe.js, et que isAddressValid cote
// serveur) — email/telephone/complement restent facultatifs partout, jamais
// marques en erreur meme vides. `state` n'y figure pas : il est obligatoire
// seulement pour certains pays (voir requiresStateField plus bas).
const CHAMPS_OBLIGATOIRES = new Set(['fullName', 'line1', 'postalCode', 'city', 'country']);

// Partage entre l'adresse de livraison, le bloc facturation conditionnel et
// le mode "facturation seule" (PDF) plus bas : les trois rendent la meme
// forme de champ (autocomplete ou simple input), seule la liste de champs et
// les valeurs changent.
//
// `showErrors` : un bouton "Continuer" DESACTIVE sans indication ne disait
// jamais quel champ manquait (retour utilisateur, 2026-10-04) — le bouton
// est maintenant toujours cliquable, et un clic sur un formulaire incomplet
// declenche `showErrors` pour entourer en rouge chaque champ obligatoire
// encore vide. Jamais affiche avant une premiere tentative : un formulaire
// vierge n'a pas besoin de s'annoncer en erreur.
//
// `state` (2026-10-05) : n'est ni affiche ni obligatoire pour la tres
// grande majorite des pays (jamais demande en France/Europe) — seulement
// pour US/CA/AU, ou Gelato le rejette sans lui (premiere vraie commande
// vers le Canada perdue pour cette raison). Filtre ici, avant le rendu,
// plutot qu'un champ toujours visible qui serait vide et confus ailleurs.
function renderFields(fields, values, onChange, locked, t, showErrors) {
  const etatRequis = requiresStateField(values.country);
  const champsAffiches = fields.filter((field) => field.name !== 'state' || etatRequis);
  return champsAffiches.map((field) => {
    const estObligatoire = CHAMPS_OBLIGATOIRES.has(field.name) || (field.name === 'state' && etatRequis);
    const manquant = showErrors && estObligatoire && !String(values[field.name] || '').trim();
    const className = `input-luxe${manquant ? ' input-error' : ''}`;
    return field.autocomplete ? (
      <AddressAutocomplete
        key={field.name}
        field={field.name}
        value={values[field.name] || ''}
        address={values}
        onChangeField={onChange}
        placeholder={t(`stepAddress.fields.${field.name}`)}
        disabled={locked}
        className={className}
      />
    ) : (
      <input
        key={field.name}
        className={className}
        name={field.name}
        type={field.type || 'text'}
        value={values[field.name] || ''}
        onChange={onChange}
        placeholder={t(`stepAddress.fields.${field.name}`)}
        disabled={locked}
      />
    );
  });
}

function StepAddress({
  address,
  onChangeField,
  locked,
  incomplete,
  billingSameAsShipping,
  onToggleBillingSame,
  billingAddress,
  onChangeBillingField,
  billingIncomplete,
  billingOnly,
  showErrors
}) {
  const { t } = useTranslation('checkout');

  // Commande PDF seule : rien a expedier, donc pas d'adresse de livraison —
  // mais une facture doit quand meme identifier son destinataire (retour
  // utilisateur, 2026-10-04 : le nom du client y retombait sur son email,
  // voire sur "Client"). On reutilise le meme formulaire que la facturation
  // "adresse differente" ci-dessous, ici comme UNIQUE saisie de cette etape
  // plutot que cachee derriere une case "meme que la livraison" qui n'aurait
  // aucun sens sans livraison a comparer.
  if (billingOnly) {
    return (
      <article className="orders-panel">
        <h2>{t('stepAddress.billingOnlyTitle')}</h2>
        <p className="orders-disclaimer">{t('stepAddress.billingOnlyNote')}</p>
        <div className="orders-form-grid">
          {renderFields(BILLING_FIELDS, billingAddress, onChangeBillingField, locked, t, showErrors)}
        </div>
        {showErrors && billingIncomplete && (
          <p className="orders-disclaimer">
            {t('stepAddress.billingIncompleteWarning')}
          </p>
        )}
      </article>
    );
  }

  return (
    <article className="orders-panel">
      <h2>{t('stepAddress.title')}</h2>
      <div className="orders-form-grid">
        {renderFields(FIELDS, address, onChangeField, locked, t, showErrors)}
      </div>
      <p className="orders-disclaimer">
        {t('stepAddress.emailNote')}
      </p>
      {showErrors && incomplete && (
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
            {renderFields(BILLING_FIELDS, billingAddress, onChangeBillingField, locked, t, showErrors)}
          </div>
          {showErrors && billingIncomplete && (
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
