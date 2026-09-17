// Fabrique EN LOCAL le PDF que le client telecharge.
//
//   node scripts/generer-pdf-client.js                     -> le livre dont le titre contient "montr"
//   node scripts/generer-pdf-client.js "60 ans"            -> un autre livre
//   node scripts/generer-pdf-client.js --sortie C:/x/y.pdf
//
// Meme chaine que l'export reel (routes/books.js) : listPagesForRender ->
// composeCoversIntoPages -> renderPdfFromPages. Le fichier produit est donc
// identique a celui que le serveur enverrait.
//
// Pourquoi ce script : le rendu demande ~600 Mo (Node + navigateur), au-dessus
// des 512 Mo d'une instance Render gratuite ou Starter, qui se fait tuer en
// cours de route. Le faire tourner sur votre machine permet de continuer a
// valider le produit sans payer d'hebergement — et c'est aussi le moyen le
// plus rapide d'obtenir un PDF a jour apres une correction du rendu.

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const supabase = require('../config/supabase');
const bookContentService = require('../services/composition/bookContentService');
const templateCatalog = require('../services/composition/templateCatalog');
const coverComposer = require('../services/composition/coverComposer');
const pdfService = require('../services/composition/pdfService');
const { resolveCoverFormat } = require('../services/composition/coverFormat');
const { resolveFormatDensity } = require('../services/composition/formatDensity');

const args = process.argv.slice(2);
const iSortie = args.indexOf('--sortie');
const sortieDemandee = iSortie > -1 ? args[iSortie + 1] : null;
const recherche = args.filter((a, i) => !a.startsWith('--') && i !== iSortie + 1)[0] || 'montr';

const nomDeFichier = (titre) => `${(titre || 'livre').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.pdf`;

(async () => {
  const { data: books } = await supabase.from('books').select('*');
  const livre = (books || []).find((b) => (b.title || '').toLowerCase().includes(recherche.toLowerCase()));
  if (!livre) {
    console.log(`Aucun livre dont le titre contient « ${recherche} ».`);
    process.exit(1);
  }

  const format = {
    formatId: livre.print_format,
    ...resolveCoverFormat(livre.print_format),
    ...resolveFormatDensity(livre.print_format)
  };

  const [interiorPages, items, layouts] = await Promise.all([
    // listPagesForRender : exactement les pages FACTUREES, y compris celles
    // laissees vierges (sans ligne en base). Meme regle que l'export reel.
    bookContentService.listPagesForRender(livre.id, livre.page_count),
    bookContentService.listContentItems(livre.id),
    templateCatalog.listActiveLayouts()
  ]);
  const template = livre.template_id ? await templateCatalog.getTemplateById(livre.template_id) : null;
  const pages = coverComposer.composeCoversIntoPages({ book: livre, items, template, interiorPages, format });

  console.log(`« ${livre.title} » — format ${livre.print_format}, ${pages.length} pages (couvertures comprises)`);
  console.log('');

  const depart = Date.now();
  const produit = await pdfService.renderPdfFromPages({
    book: livre,
    items,
    layouts,
    format,
    pages,
    fileBaseName: 'client-local',
    onProgress: ({ phase, done, total }) => {
      const mo = (process.memoryUsage().rss / 1024 / 1024).toFixed(0);
      process.stdout.write(`\r   ${phase || 'pages'} ${done}/${total} — ${mo} Mo        `);
    }
  });

  const destination = sortieDemandee
    ? path.resolve(sortieDemandee)
    : path.join(process.cwd(), nomDeFichier(livre.title));

  fs.copyFileSync(produit, destination);
  fs.unlinkSync(produit);

  const secondes = (Date.now() - depart) / 1000;
  console.log('\n');
  console.log(`  fichier : ${destination}`);
  console.log(`  poids   : ${(fs.statSync(destination).size / 1024 / 1024).toFixed(1)} Mo`);
  console.log(`  duree   : ${(secondes / 60).toFixed(1)} min`);
  process.exit(0);
})();
