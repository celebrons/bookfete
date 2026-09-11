import React from 'react';
import { formatPriceCents, includesPrint } from '../../../utils/orderWorkflow';

// Ecran 1 : choix du produit + RECAPITULATIF DE PRIX detaille (prix
// unitaire x quantite = total), la ou l'ancienne page n'affichait le total
// qu'en bas, dans le bloc paiement. Purement presentatif : les etats et
// handlers restent dans BookCheckoutLuxe.js.
const PRODUCT_CHOICES = [
  { key: 'pdf', title: 'PDF seul', note: 'Telechargement uniquement' },
  { key: 'print', title: 'Livre imprime', note: 'Impression + livraison' },
  { key: 'pack', title: 'Pack PDF + imprime', note: 'Les deux versions' }
];

function StepProduct({
  orderType,
  onChangeType,
  quantity,
  onChangeQuantity,
  locked,
  unitCents,
  totalCents
}) {
  return (
    <article className="orders-panel">
      <h2>{locked ? 'Commande en attente' : 'Choix du produit'}</h2>

      <div className="product-choice-grid">
        {PRODUCT_CHOICES.map((choice) => (
          <button
            key={choice.key}
            type="button"
            className={`product-choice ${orderType === choice.key ? 'is-active' : ''}`}
            onClick={() => { if (!locked) onChangeType(choice.key); }}
            disabled={locked}
          >
            <strong>{choice.title}</strong>
            <span>{choice.note}</span>
          </button>
        ))}
      </div>

      <div className="orders-field">
        <label htmlFor="quantity">Quantite</label>
        <input
          id="quantity"
          type="number"
          min="1"
          max="20"
          className="input-luxe"
          value={quantity}
          onChange={(event) => onChangeQuantity(Number(event.target.value || 1))}
          disabled={locked}
        />
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
          <span>Total</span>
          <strong>{formatPriceCents(totalCents)}</strong>
        </div>
      </div>

      <p className="orders-disclaimer">
        {includesPrint(orderType)
          ? "Livraison a l'adresse indiquee a l'etape suivante."
          : 'Aucune livraison : le PDF est telechargeable des le paiement valide.'}
      </p>
    </article>
  );
}

export default StepProduct;
