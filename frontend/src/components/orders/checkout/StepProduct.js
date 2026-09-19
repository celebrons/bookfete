import React from 'react';
import { formatPriceCents, includesPrint } from '../../../utils/orderWorkflow';

// Ecran 1 : choix du produit + RECAPITULATIF DE PRIX detaille (prix
// unitaire x quantite = total), la ou l'ancienne page n'affichait le total
// qu'en bas, dans le bloc paiement. Purement presentatif : les etats et
// handlers restent dans BookCheckoutLuxe.js.
//
// LE PRIX EST DEVANT LE PRODUIT, ET LE PRODUIT EST EXPLIQUE (2026-09-19).
// Avant, les trois cartes ne portaient qu'un titre et quatre mots ("PDF
// seul / Telechargement uniquement") : il fallait choisir un produit pour
// decouvrir son prix, et rien ne disait ce qu'on recevait vraiment. Chaque
// carte annonce maintenant son prix a gauche, avant le titre, et le detail
// de ce qui est inclus — y compris ce qui ne l'est PAS, la question qui se
// pose vraiment entre "imprime" et "pack".
const PRODUCT_CHOICES = [
  {
    key: 'pdf',
    title: 'PDF seul',
    note: 'Rien n’est expédié',
    details: [
      'Le livre entier en fichier PDF haute définition',
      'Téléchargeable dès le paiement, autant de fois que vous voulez',
      'À garder ou à faire imprimer où vous voulez'
    ]
  },
  {
    key: 'print',
    title: 'Livre imprimé',
    note: 'Imprimé et livré chez vous',
    details: [
      'Votre livre imprimé et relié par notre imprimeur',
      'Livré à l’adresse indiquée à l’étape suivante',
      'Le fichier PDF n’est pas inclus'
    ]
  },
  {
    key: 'pack',
    title: 'Pack PDF + imprimé',
    note: 'Les deux à la fois',
    details: [
      'Le livre imprimé, livré chez vous',
      'ET le PDF téléchargeable dès le paiement'
    ]
  }
];

function StepProduct({
  orderType,
  onChangeType,
  quantity,
  onChangeQuantity,
  locked,
  unitCents,
  totalCents,
  pricesByType = {}
}) {
  // Economie du pack : calculee a partir des VRAIS prix renvoyes par le
  // serveur, jamais d'un chiffre ecrit en dur qui finirait par mentir le
  // jour ou la grille tarifaire bouge.
  const prixPdf = pricesByType.pdf;
  const prixPrint = pricesByType.print;
  const prixPack = pricesByType.pack;
  const economiePack = [prixPdf, prixPrint, prixPack].every((valeur) => Number.isFinite(valeur))
    ? prixPdf + prixPrint - prixPack
    : 0;

  return (
    <article className="orders-panel">
      <h2>{locked ? 'Commande en attente' : 'Choix du produit'}</h2>

      <div className="product-choice-grid">
        {PRODUCT_CHOICES.map((choice) => {
          const prix = pricesByType[choice.key];
          const details = choice.key === 'pack' && economiePack > 0
            ? [...choice.details, `Soit ${formatPriceCents(economiePack)} de moins que les deux achetés séparément`]
            : choice.details;

          return (
            <button
              key={choice.key}
              type="button"
              className={`product-choice ${orderType === choice.key ? 'is-active' : ''}`}
              onClick={() => { if (!locked) onChangeType(choice.key); }}
              disabled={locked}
              aria-pressed={orderType === choice.key}
            >
              <span className="product-choice-price">
                {Number.isFinite(prix) ? formatPriceCents(prix) : '—'}
                <span className="product-choice-price-unit">par exemplaire</span>
              </span>
              <span className="product-choice-text">
                <strong>{choice.title}</strong>
                <span className="product-choice-note">{choice.note}</span>
                <span className="product-choice-details">
                  {details.map((ligne) => (
                    <span key={ligne} className="product-choice-detail">{ligne}</span>
                  ))}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="orders-field">
        <label htmlFor="quantity">Quantité</label>
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
          <span>Quantité</span>
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
