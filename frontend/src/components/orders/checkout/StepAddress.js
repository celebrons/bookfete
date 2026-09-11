import React from 'react';

// Ecran 2 : adresse de livraison. Affiche uniquement pour une commande
// contenant un livre imprime — une commande PDF saute purement et
// simplement cette etape (voir BookCheckoutLuxe.js: buildSteps).
// Champs repris tels quels de l'ancienne page (meme `name`, meme handler) :
// c'est `sanitizeAddress`/`isAddressValid` cote backend qui reste l'autorite
// sur ce qui est acceptable.
const FIELDS = [
  { name: 'fullName', placeholder: 'Nom complet' },
  { name: 'line1', placeholder: 'Adresse' },
  { name: 'line2', placeholder: 'Complement' },
  { name: 'postalCode', placeholder: 'Code postal' },
  { name: 'city', placeholder: 'Ville' },
  { name: 'country', placeholder: 'Pays' },
  { name: 'phone', placeholder: 'Telephone' }
];

function StepAddress({ address, onChangeField, locked, incomplete }) {
  return (
    <article className="orders-panel">
      <h2>Adresse de livraison</h2>
      <div className="orders-form-grid">
        {FIELDS.map((field) => (
          <input
            key={field.name}
            className="input-luxe"
            name={field.name}
            value={address[field.name] || ''}
            onChange={onChangeField}
            placeholder={field.placeholder}
            disabled={locked}
          />
        ))}
      </div>
      {incomplete && (
        <p className="orders-disclaimer">
          Nom, adresse, code postal, ville et pays sont necessaires pour l'expedition.
        </p>
      )}
    </article>
  );
}

export default StepAddress;
