// backend/services/invoicing/invoiceTemplate.js
//
// Rendu HTML d'une facture, destine a pdfService.renderPdfFromHtml() (rendu
// via Chrome headless --print-to-pdf) — PAS le meme gabarit que les emails
// (emailTemplates.js), volontairement pauvre en CSS pour les clients de
// messagerie. Ici la page est imprimee par un vrai navigateur : grid/flex
// et polices systeme suffisent, pas besoin de tableaux en repli.
//
// Une seule page A4, mentions legales completes pour une micro-entreprise en
// franchise en base de TVA (voir sellerIdentity.js) : numero + date
// d'emission, identite vendeur (nom, SIRET, adresse), mention "TVA non
// applicable", identite acheteur, designation/quantite/prix des lignes,
// total, reference et date de la commande/du paiement.

const echapper = (valeur) => String(valeur ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const prix = (cents) => {
  const n = Number(cents);
  if (!Number.isFinite(n)) return '';
  return `${(n / 100).toFixed(2).replace('.', ',')} €`;
};

const dateLongue = (valeur) => {
  const d = valeur ? new Date(valeur) : new Date();
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
};

/**
 * @param {object} params
 * @param {string} params.invoiceNumber
 * @param {string} params.issuedAt - ISO
 * @param {object} params.seller - { name, siret, address, email, vatMention, statusMention }
 * @param {object} params.buyer - { name, email, address: {line1, line2, postalCode, city, country} | null }
 * @param {object} params.order - { orderNumber, paidAt }
 * @param {Array<{label, detail, quantity, unitCents, amountCents}>} params.lineItems
 * @param {{totalCents:number}} params.totals
 */
function renderInvoiceHtml({ invoiceNumber, issuedAt, seller, buyer, order, lineItems, totals }) {
  const lignesHtml = (lineItems || []).map((ligne) => `
    <tr>
      <td class="desc">
        <div class="desc-titre">${echapper(ligne.label)}</div>
        ${ligne.detail ? `<div class="desc-detail">${echapper(ligne.detail)}</div>` : ''}
      </td>
      <td class="num">${ligne.quantity ?? 1}</td>
      <td class="num">${echapper(prix(ligne.unitCents))}</td>
      <td class="num montant">${echapper(prix(ligne.amountCents))}</td>
    </tr>
  `).join('');

  const adresseAcheteur = buyer?.address
    ? [buyer.address.line1, buyer.address.line2, `${buyer.address.postalCode || ''} ${buyer.address.city || ''}`.trim(), buyer.address.country]
      .filter(Boolean).map(echapper).join('<br>')
    : '';

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<style>
  @page { size: A4; margin: 22mm 18mm; }
  * { box-sizing: border-box; }
  body {
    margin: 0; color: #241f18; background: #fff;
    font-family: -apple-system, "Segoe UI", Helvetica, Arial, sans-serif;
    font-size: 12.5px; line-height: 1.5;
  }
  .entete { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 34px; }
  .marque { font-family: Georgia, "Times New Roman", serif; font-size: 22px; letter-spacing: 0.04em; }
  .marque .point { color: #b8924a; }
  .titre-facture { text-align: right; }
  .titre-facture h1 { margin: 0; font-size: 20px; font-weight: 700; letter-spacing: 0.03em; }
  .titre-facture .numero { margin-top: 4px; font-size: 13px; color: #5a5245; }
  .blocs { display: flex; justify-content: space-between; gap: 32px; margin-bottom: 30px; }
  .bloc { flex: 1; }
  .bloc h2 { margin: 0 0 8px; font-size: 10.5px; letter-spacing: 0.08em; text-transform: uppercase; color: #8a8072; }
  .bloc .nom { font-weight: 700; margin-bottom: 2px; }
  .bloc p { margin: 0 0 3px; color: #3a352c; }
  .meta { display: flex; gap: 40px; margin-bottom: 26px; padding: 12px 0; border-top: 1px solid #e6dfd0; border-bottom: 1px solid #e6dfd0; }
  .meta div span { display: block; font-size: 10px; letter-spacing: 0.06em; text-transform: uppercase; color: #8a8072; margin-bottom: 2px; }
  .meta div strong { font-size: 13px; }
  table.lignes { width: 100%; border-collapse: collapse; margin-bottom: 6px; }
  table.lignes thead th {
    text-align: left; font-size: 10px; letter-spacing: 0.06em; text-transform: uppercase; color: #8a8072;
    padding: 0 0 8px; border-bottom: 1.5px solid #241f18;
  }
  table.lignes thead th.num { text-align: right; }
  table.lignes td { padding: 12px 0; border-bottom: 1px solid #eee6d6; vertical-align: top; }
  table.lignes td.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  table.lignes td.montant { font-weight: 700; }
  .desc-titre { font-weight: 600; }
  .desc-detail { color: #8a8072; font-size: 11.5px; margin-top: 2px; }
  .totaux { display: flex; justify-content: flex-end; margin-top: 14px; }
  .totaux table { border-collapse: collapse; min-width: 240px; }
  .totaux td { padding: 5px 0; }
  .totaux td:first-child { color: #5a5245; padding-right: 24px; }
  .totaux td:last-child { text-align: right; font-variant-numeric: tabular-nums; }
  .totaux .ligne-total td { border-top: 1.5px solid #241f18; padding-top: 10px; font-size: 15px; font-weight: 700; }
  .mention-tva { margin-top: 8px; font-size: 11px; color: #5a5245; text-align: right; }
  .pied { margin-top: 48px; padding-top: 14px; border-top: 1px solid #e6dfd0; font-size: 10.5px; color: #8a8072; }
  .pied p { margin: 0 0 4px; }
</style>
</head>
<body>
  <div class="entete">
    <div class="marque">Bookipix<span class="point">.</span></div>
    <div class="titre-facture">
      <h1>FACTURE</h1>
      <div class="numero">N° ${echapper(invoiceNumber)} · ${echapper(dateLongue(issuedAt))}</div>
    </div>
  </div>

  <div class="blocs">
    <div class="bloc">
      <h2>Vendeur</h2>
      <p class="nom">${echapper(seller.name)}</p>
      <p>${echapper(seller.address)}</p>
      <p>SIRET : ${echapper(seller.siret)}</p>
      <p>${echapper(seller.email)}</p>
    </div>
    <div class="bloc">
      <h2>Facturé à</h2>
      <p class="nom">${echapper(buyer.name)}</p>
      ${adresseAcheteur ? `<p>${adresseAcheteur}</p>` : ''}
      ${buyer.email && buyer.email !== buyer.name ? `<p>${echapper(buyer.email)}</p>` : ''}
    </div>
  </div>

  <div class="meta">
    <div><span>Commande</span><strong>${echapper(order.orderNumber)}</strong></div>
    <div><span>Date de paiement</span><strong>${echapper(dateLongue(order.paidAt))}</strong></div>
    <div><span>Mode de règlement</span><strong>Carte bancaire</strong></div>
  </div>

  <table class="lignes">
    <thead>
      <tr>
        <th>Désignation</th>
        <th class="num">Qté</th>
        <th class="num">Prix unitaire</th>
        <th class="num">Montant</th>
      </tr>
    </thead>
    <tbody>
      ${lignesHtml}
    </tbody>
  </table>

  <div class="totaux">
    <table>
      <tr class="ligne-total"><td>Total</td><td>${echapper(prix(totals.totalCents))}</td></tr>
    </table>
  </div>
  <p class="mention-tva">${echapper(seller.vatMention)}</p>

  <div class="pied">
    <p>${echapper(seller.name)}${seller.statusMention ? ` — ${echapper(seller.statusMention)}` : ''}</p>
    <p>Pas d'escompte pour paiement anticipé. Aucune pénalité de retard applicable — le règlement intervient au moment de la commande.</p>
  </div>
</body>
</html>`;
}

module.exports = { renderInvoiceHtml, prix, dateLongue };
