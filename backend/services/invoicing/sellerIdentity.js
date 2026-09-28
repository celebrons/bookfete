// backend/services/invoicing/sellerIdentity.js
//
// Identite du vendeur, telle qu'elle DOIT apparaitre sur chaque facture
// (Code de commerce art. L441-9) : nom, SIRET, adresse du siege. Ces trois
// informations n'existent nulle part dans le code au moment ou ce fichier
// est ecrit (voir frontend/src/components/legal/MentionsLegalesLuxe.js,
// qui porte les memes "[À COMPLÉTER]") — une facture emise sans elles n'est
// PAS legalement valide.
//
// Pilote par variables d'environnement plutot que code en dur : le
// fondateur peut les poser dans backend/.env des qu'il les a, sans
// redeploiement de code, et TOUTES les factures deja emises restent
// inchangees (l'identite est figee dans invoices.seller au moment de
// l'emission — voir invoiceService.js).
const PLACEHOLDER = '[À COMPLÉTER]';

// Regime confirme le 2026-09-28 (retour utilisateur, artefact mise en
// production) : micro-entreprise, franchise en base de TVA.
const VAT_MENTION = 'TVA non applicable, art. 293 B du CGI';
const STATUS_MENTION = 'Micro-entreprise';

function sellerIdentity() {
  return {
    name: (process.env.INVOICE_SELLER_NAME || '').trim() || PLACEHOLDER,
    siret: (process.env.INVOICE_SELLER_SIRET || '').trim() || PLACEHOLDER,
    address: (process.env.INVOICE_SELLER_ADDRESS || '').trim() || PLACEHOLDER,
    // Adresse de contact reelle, deja publiee sur /mentions-legales — pas un
    // champ obligatoire sur une facture, mais utile au client.
    email: (process.env.INVOICE_SELLER_EMAIL || '').trim() || 'bonjour@celebrons.com',
    vatMention: VAT_MENTION,
    statusMention: STATUS_MENTION
  };
}

// Vrai des que les 3 mentions obligatoires sont posees — sert a decider si
// on alerte l'administrateur (voir invoiceService.js) plutot que d'emettre
// silencieusement une facture juridiquement incomplete.
function isSellerIdentityComplete(identity = sellerIdentity()) {
  return identity.name !== PLACEHOLDER && identity.siret !== PLACEHOLDER && identity.address !== PLACEHOLDER;
}

module.exports = { sellerIdentity, isSellerIdentityComplete, PLACEHOLDER };
