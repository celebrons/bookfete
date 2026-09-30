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
  shippingCents,
  totalCents,
  pricesByType = {}
}) {
  // Economie du pack : calculee a partir des VRAIS prix renvoyes par le
  // serveur, jamais d'un chiffre ecrit en dur qui finirait par mentir le
  // jour ou la grille tarifaire bouge. Le pourcentage aussi est DEDUIT de
  // ces prix (jamais un "10%" recopie ici) — la remise reelle vit dans
  // PACK_DISCOUNT_PERCENT cote serveur (pricingConfig.js), ce calcul ne
  // fait que la lire en retour.
  const prixPdf = pricesByType.pdf;
  const prixPrint = pricesByType.print;
  const prixPack = pricesByType.pack;
  const prixSepares = Number.isFinite(prixPdf) && Number.isFinite(prixPrint) ? prixPdf + prixPrint : null;
  const economiePack = prixSepares != null && Number.isFinite(prixPack) ? prixSepares - prixPack : 0;
  // Retour utilisateur 2026-09-27 : "on les voit pas vraiement" — la remise
  // etait une simple ligne de detail, meme poids visuel que "Le fichier PDF
  // n'est pas inclus". Elle a maintenant SA PROPRE presentation : un badge
  // "-10%" sur la carte, l'ancien prix barre au-dessus du nouveau, et le
  // gain en euros mis en avant (pas noye dans la liste de details).
  const pourcentageEconomie = economiePack > 0 && prixSepares > 0
    ? Math.round((economiePack / prixSepares) * 100)
    : 0;

  return (
    <article className="orders-panel">
      <h2>{locked ? 'Commande en attente' : 'Choix du produit'}</h2>

      <div className="product-choice-grid">
        {PRODUCT_CHOICES.map((choice) => {
          const prix = pricesByType[choice.key];
          const estLePack = choice.key === 'pack';
          const montrerRemise = estLePack && pourcentageEconomie > 0;

          return (
            <button
              key={choice.key}
              type="button"
              className={`product-choice ${orderType === choice.key ? 'is-active' : ''}`}
              onClick={() => { if (!locked) onChangeType(choice.key); }}
              disabled={locked}
              aria-pressed={orderType === choice.key}
            >
              {montrerRemise && (
                <span className="product-choice-badge">− {pourcentageEconomie} %</span>
              )}
              <span className="product-choice-price">
                {montrerRemise && (
                  <span className="product-choice-price-was">{formatPriceCents(prixSepares)}</span>
                )}
                {Number.isFinite(prix) ? formatPriceCents(prix) : '—'}
                <span className="product-choice-price-unit">par exemplaire</span>
              </span>
              <span className="product-choice-text">
                <strong>{choice.title}</strong>
                <span className="product-choice-note">{choice.note}</span>
                <span className="product-choice-details">
                  {choice.details.map((ligne) => (
                    <span key={ligne} className="product-choice-detail">{ligne}</span>
                  ))}
                </span>
                {montrerRemise && (
                  <span className="product-choice-savings">
                    Vous économisez {formatPriceCents(economiePack)} par rapport aux deux achetés séparément
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      {/* UNE SEULE LIGNE (retour utilisateur, 2026-09-30, piste "Commande &
          compte") : le champ Quantité et les trois blocs Prix unitaire /
          Quantité / Total affichaient quatre fois la meme donnee sur quatre
          lignes separees. Le total reste la SEULE chose mise en avant
          visuellement (a droite, en gras) ; le detail (unite, livraison)
          n'est plus qu'un texte discret entre le selecteur et le total.
          Rien n'est perdu : memes trois informations (prix unitaire des que
          quantite > 1, livraison si applicable, total), juste regroupees. */}
      <div className="orders-recap-line">
        <div className="orders-qty-stepper">
          <button
            type="button"
            className="orders-qty-btn"
            onClick={() => onChangeQuantity(Math.max(1, quantity - 1))}
            disabled={locked || quantity <= 1}
            aria-label="Réduire la quantité"
          >
            −
          </button>
          <span className="orders-qty-val">{quantity}</span>
          <button
            type="button"
            className="orders-qty-btn"
            onClick={() => onChangeQuantity(Math.min(20, quantity + 1))}
            disabled={locked || quantity >= 20}
            aria-label="Augmenter la quantité"
          >
            +
          </button>
        </div>
        <span className="orders-recap-detail">
          {quantity} exemplaire{quantity > 1 ? 's' : ''}
          {quantity > 1 && Number.isFinite(unitCents) ? ` · ${formatPriceCents(unitCents)} l'unité` : ''}
          {includesPrint(orderType) && Number.isFinite(shippingCents) ? ` · livraison ${formatPriceCents(shippingCents)}` : ''}
        </span>
        <span className="orders-recap-total">{formatPriceCents(totalCents)}</span>
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
