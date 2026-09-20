// Combien l'imprimeur nous facture-t-il reellement ?
//
//   node scripts/prix-gelato.js
//   node scripts/prix-gelato.js --pays FR --pages 32
//
// LECTURE SEULE : interroge l'API catalogue de Gelato, ne cree ni ne modifie
// aucune commande.
//
// Ecrit le 2026-09-20. Jusqu'ici, le commentaire de FORMAT_PRICING
// (routes/orders.js) disait la verite sans detour : « Hypothese de travail
// (aucun cout d'impression reel connu a ce jour) ». Autrement dit, nous
// vendions 49 a 99 EUR un objet dont nous ignorions le prix de revient. Ce
// script comble ce trou : il demande a Gelato le prix de nos VRAIS produits,
// pour le nombre de pages reel, et le compare a notre grille de vente.
//
// Rappel de vocabulaire, qui a deja fait trebucher : « pages » chez Gelato
// designe le cahier INTERIEUR, gardes comprises — 32 pour un livre de 30
// pages composees (voir gelatoCatalog.js).

require('dotenv').config();
const { GELATO_PRODUCT_MAP } = (() => {
  // gelatoCatalog n'exporte pas la table brute : on la relit depuis le
  // module plutot que d'en recopier une seconde, qui divergerait.
  const catalogue = require('../services/printing/gelatoCatalog');
  return { GELATO_PRODUCT_MAP: catalogue.__mapPourLesTests || catalogue.GELATO_PRODUCT_MAP || null };
})();

const args = process.argv.slice(2);
const valeur = (nom, defaut) => {
  const i = args.indexOf(nom);
  return i > -1 ? args[i + 1] : defaut;
};
const PAYS = String(valeur('--pays', 'FR')).toUpperCase();
const DEVISE = String(valeur('--devise', 'EUR')).toUpperCase();
const PAGES = Number(valeur('--pages', 32));

// Notre grille de vente (routes/orders.js : FORMAT_PRICING), recopiee ici
// volontairement en LECTURE seule pour la comparaison — ce script ne doit
// jamais devenir une seconde source de verite des prix.
const VENTE = {
  livret: { baseCents: 3400, perPageCents: 60, minCents: 4900 },
  standard: { baseCents: 4900, perPageCents: 85, minCents: 6900 },
  luxe: { baseCents: 6900, perPageCents: 130, minCents: 9900 }
};
const prixDeVente = (format, pages) => {
  const p = VENTE[format];
  return Math.max(p.minCents, p.baseCents + Math.round(pages * p.perPageCents)) / 100;
};

async function prixGelato(productUid) {
  const cle = process.env.GELATO_API_KEY;
  if (!cle) throw new Error('GELATO_API_KEY absente : impossible d interroger le catalogue.');

  const url = `https://product.gelatoapis.com/v3/products/${encodeURIComponent(productUid)}/prices`
    + `?country=${PAYS}&currency=${DEVISE}&pageCount=${PAGES}`;
  const reponse = await fetch(url, { headers: { 'X-API-KEY': cle } });
  if (!reponse.ok) {
    throw new Error(`HTTP ${reponse.status} — ${(await reponse.text()).slice(0, 160)}`);
  }
  return reponse.json();
}

async function main() {
  if (!GELATO_PRODUCT_MAP) {
    throw new Error('Table des produits introuvable dans gelatoCatalog.js.');
  }

  console.log(`\nPrix imprimeur — ${PAYS}, ${DEVISE}, ${PAGES} pages interieures (gardes comprises)\n`);
  console.log('  format      cout impression   notre prix de vente   marge brute');

  for (const [format, produit] of Object.entries(GELATO_PRODUCT_MAP)) {
    let ligne;
    try {
      // eslint-disable-next-line no-await-in-loop
      const tarifs = await prixGelato(produit.productUid);
      // La reponse liste un tarif par palier de quantite : on prend le
      // premier (quantite 1), qui est notre cas reel.
      const unitaire = Array.isArray(tarifs) ? tarifs[0] : tarifs?.prices?.[0];
      const cout = Number(unitaire?.price);
      if (!Number.isFinite(cout)) {
        ligne = 'reponse inattendue';
      } else {
        const vente = prixDeVente(format, PAGES - 2);
        const marge = vente - cout;
        const pourcent = Math.round((marge / vente) * 100);
        ligne = `${cout.toFixed(2).padStart(9)} ${DEVISE}   ${vente.toFixed(2).padStart(12)} ${DEVISE}`
          + `   ${marge.toFixed(2).padStart(7)} ${DEVISE} (${pourcent} %)`;
      }
    } catch (error) {
      ligne = `indisponible — ${error.message}`;
    }
    console.log(`  ${format.padEnd(11)} ${ligne}`);
  }

  console.log('\n  Frais d\'expedition NON inclus : ils dependent de l\'adresse et');
  console.log('  n\'apparaissent qu\'au devis de commande. A verifier sur un envoi reel.\n');
}

main().catch((error) => {
  console.error(`\nECHEC : ${error.message}\n`);
  process.exit(1);
});
