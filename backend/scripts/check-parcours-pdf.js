// LE PARCOURS COMPLET D'UN CLIENT QUI COMMANDE UN PDF.
//
//   node scripts/check-parcours-pdf.js
//   node scripts/check-parcours-pdf.js --url https://78.232.5.181.sslip.io --modele "Portugal"
//
// Ecrit le 2026-09-19, apres une journee d'allers-retours ou chaque
// correction etait annoncee sans avoir ete essayee PAR LE CHEMIN QUE PREND
// LE CLIENT. Les scripts precedents appelaient les fonctions internes ; les
// pannes, elles, etaient dans les routes, les limites de debit et les
// enchainements.
//
// Celui-ci ne triche pas : il cree un compte jetable, un livre jetable
// (copie du contenu d'un vrai livre, en lecture seule sur l'original), une
// commande PDF payee, puis il passe par les MEMES appels HTTP que le
// navigateur — demande de generation, sondage d'avancement, telechargement —
// et il OUVRE le fichier obtenu pour verifier ce qu'il contient.
//
// Tout ce qu'il cree est supprime a la fin, meme en cas d'echec.

require('dotenv').config();
const fs = require('fs');
const path = require('path');

const sharp = require('../config/sharp');
const supabase = require('../config/supabase');
const { createClient } = require('@supabase/supabase-js');

const args = process.argv.slice(2);
const valeur = (nom, defaut) => {
  const i = args.indexOf(nom);
  return i > -1 ? args[i + 1] : defaut;
};
const BASE = String(valeur('--url', 'https://78.232.5.181.sslip.io')).replace(/\/$/, '');
const MODELE = String(valeur('--modele', 'portugal')).toLowerCase();
const PATIENCE_MS = Number(valeur('--patience', 15 * 60 * 1000));

// La cle publique vit cote site.
const envFront = fs.readFileSync(path.join(__dirname, '..', '..', 'frontend', '.env'), 'utf8');
const lireFront = (nom) => (envFront.match(new RegExp(`^${nom}=(.+)$`, 'm')) || [])[1];
const URL_SUPABASE = lireFront('REACT_APP_SUPABASE_URL') || process.env.SUPABASE_URL;
const ANON = lireFront('REACT_APP_SUPABASE_ANON_KEY');

const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

let echecs = 0;
const check = (cond, msg, detail = '') => {
  if (!cond) echecs += 1;
  console.log((cond ? '  OK  ' : ' ECHEC') + ' ' + msg + (detail ? `   ${detail}` : ''));
};

const extraireJpegs = (donnees) => {
  const trouves = [];
  let i = 0;
  while (i < donnees.length - 3) {
    if (donnees[i] === 0xFF && donnees[i + 1] === 0xD8 && donnees[i + 2] === 0xFF) {
      let j = i + 3;
      while (j < donnees.length - 1 && !(donnees[j] === 0xFF && donnees[j + 1] === 0xD9)) j += 1;
      if (j < donnees.length - 1) { trouves.push(donnees.subarray(i, j + 2)); i = j + 2; continue; }
    }
    i += 1;
  }
  return trouves;
};

(async () => {
  console.log(`Parcours complet d'une commande PDF sur ${BASE}\n`);

  const marque = `pdf-${Date.now()}`;
  const email = `${marque}@celebrons-test.invalid`;
  const motDePasse = `jetable-${Math.random().toString(36).slice(2)}-A1!`;
  let userId = null;
  let bookId = null;
  let orderId = null;
  let fichierRecu = null;

  try {
    // ---------------------------------------------------------------- 1
    console.log('1. Compte, livre et commande jetables');

    const { data: cree, error: erreurUser } = await supabase.auth.admin.createUser({
      email, password: motDePasse, email_confirm: true
    });
    if (erreurUser) throw new Error(`compte : ${erreurUser.message}`);
    userId = cree.user.id;

    const { data: livres } = await supabase.from('books').select('*');
    const modele = (livres || []).find((b) => (b.title || '').toLowerCase().includes(MODELE));
    if (!modele) throw new Error(`livre modele « ${MODELE} » introuvable`);

    const { data: livre, error: erreurLivre } = await supabase
      .from('books')
      .insert({
        title: `Livre ${marque}`,
        owner_id: userId,
        page_count: modele.page_count,
        print_format: modele.print_format,
        template_id: modele.template_id,
        cover_config: modele.cover_config,
        back_cover_config: modele.back_cover_config,
        cover_overrides: modele.cover_overrides,
        page_count_mode: modele.page_count_mode,
        collection_mode: modele.collection_mode
      })
      .select('id')
      .single();
    if (erreurLivre) throw new Error(`livre : ${erreurLivre.message}`);
    bookId = livre.id;

    let copiees = 0;
    for (const table of ['book_content_items', 'book_pages']) {
      // eslint-disable-next-line no-await-in-loop
      const { data: lignes } = await supabase.from(table).select('*').eq('book_id', modele.id);
      if (!lignes?.length) continue;
      const copies = lignes.map((l) => {
        const c = { ...l, book_id: bookId };
        delete c.id; delete c.created_at; delete c.updated_at;
        return c;
      });
      // eslint-disable-next-line no-await-in-loop
      const { error } = await supabase.from(table).insert(copies);
      if (error) throw new Error(`copie ${table} : ${error.message}`);
      copiees += copies.length;
    }

    // Une commande PDF DEJA PAYEE : on teste la fabrication et la remise du
    // fichier, pas Stripe.
    const { data: commande, error: erreurCommande } = await supabase
      .from('orders')
      .insert({
        book_id: bookId,
        owner_id: userId,
        type: 'pdf',
        status: 'paid',
        paid_at: new Date().toISOString(),
        metadata: { pricing: { pages: modele.page_count, printFormat: modele.print_format, pdfUnitCents: 3900 } }
      })
      .select('id')
      .single();
    if (erreurCommande) throw new Error(`commande : ${erreurCommande.message}`);
    orderId = commande.id;

    console.log(`   livre « ${modele.title} » recopie (${copiees} lignes), commande PDF payee\n`);

    // ---------------------------------------------------------------- 2
    console.log('2. Connexion, comme le client');
    const client = createClient(URL_SUPABASE, ANON);
    const { data: sess, error: erreurSession } = await client.auth.signInWithPassword({
      email, password: motDePasse
    });
    if (erreurSession) throw new Error(`connexion : ${erreurSession.message}`);
    const jeton = sess.session.access_token;
    const entetes = { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json' };
    console.log('   connecte\n');

    // ---------------------------------------------------------------- 3
    console.log('3. Demande de generation');
    const depart = Date.now();
    const lancement = await fetch(`${BASE}/api/books/${bookId}/export-final-pdf`, {
      method: 'POST', headers: entetes, body: JSON.stringify({ forceRegenerate: true })
    });
    const corpsLancement = await lancement.json().catch(() => ({}));
    check(lancement.status === 202, 'la generation demarre (202)', `recu ${lancement.status} ${JSON.stringify(corpsLancement).slice(0, 120)}`);
    const jobId = corpsLancement.jobId;
    if (!jobId) throw new Error('aucun jobId rendu');
    console.log(`   job ${jobId}\n`);

    // ---------------------------------------------------------------- 4
    console.log('4. Sondage de l avancement (comme le navigateur, toutes les 2 s)');
    let dernierStatut = null;
    let sondages = 0;
    let refusDeDebit = 0;
    const echeance = Date.now() + PATIENCE_MS;

    while (Date.now() < echeance) {
      // eslint-disable-next-line no-await-in-loop
      const r = await fetch(`${BASE}/api/books/${bookId}/export-final-pdf/${jobId}/status`, { headers: entetes });
      sondages += 1;
      if (r.status === 429) refusDeDebit += 1;
      // eslint-disable-next-line no-await-in-loop
      const corps = await r.json().catch(() => ({}));
      dernierStatut = corps.status || `HTTP ${r.status}`;

      const p = corps.progress;
      process.stdout.write(`\r   ${String(dernierStatut).padEnd(10)} ${p ? `${p.phase} ${p.done}/${p.total}` : ''}          `);

      if (dernierStatut === 'ready' || dernierStatut === 'failed') break;
      // eslint-disable-next-line no-await-in-loop
      await attendre(2000);
    }
    const secondes = Math.round((Date.now() - depart) / 1000);
    console.log(`\n   ${sondages} sondages en ${secondes} s\n`);

    check(refusDeDebit === 0, 'le sondage n est jamais refuse pour exces de debit', refusDeDebit ? `${refusDeDebit} refus (429)` : '');
    check(dernierStatut === 'ready', 'la generation aboutit', `statut final : ${dernierStatut}`);
    if (dernierStatut !== 'ready') throw new Error(`generation non aboutie (${dernierStatut})`);

    // ---------------------------------------------------------------- 5
    console.log('5. Telechargement');
    const tele = await fetch(`${BASE}/api/books/${bookId}/export-final-pdf/${jobId}/download/final`, { headers: entetes });
    check(tele.status === 200, 'le telechargement repond 200', `recu ${tele.status}`);
    if (tele.status !== 200) {
      const err = await tele.text();
      throw new Error(`telechargement refuse : ${err.slice(0, 200)}`);
    }
    const type = tele.headers.get('content-type') || '';
    check(type.includes('pdf'), 'le serveur renvoie bien un PDF', type);

    const donnees = Buffer.from(await tele.arrayBuffer());
    fichierRecu = path.join(__dirname, '..', 'tmp', `${marque}.pdf`);
    fs.mkdirSync(path.dirname(fichierRecu), { recursive: true });
    fs.writeFileSync(fichierRecu, donnees);
    console.log(`   ${(donnees.length / 1048576).toFixed(1)} Mo recus\n`);

    // ---------------------------------------------------------------- 6
    console.log('6. Ce que contient le fichier');
    check(donnees.subarray(0, 5).toString() === '%PDF-', 'le fichier est un PDF');
    check(donnees.subarray(-1024).toString('latin1').includes('%%EOF'), 'le PDF est complet (marqueur de fin)');

    const texte = donnees.toString('latin1');
    const nbPages = (texte.match(/\/Type\s*\/Page[^s]/g) || []).length;
    console.log(`   ${nbPages} pages`);
    check(nbPages >= modele.page_count, `au moins ${modele.page_count} pages`, `trouve ${nbPages}`);

    const jpegs = extraireJpegs(donnees);
    let intactes = 0;
    let abimees = 0;
    const ratios = [];
    for (const image of jpegs) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const meta = await sharp(image).metadata();
        if (!meta.width || meta.width < 300) continue;
        // eslint-disable-next-line no-await-in-loop
        await sharp(image).raw().toBuffer();
        intactes += 1;
        ratios.push(meta.width / meta.height);
      } catch (_error) {
        abimees += 1;
      }
    }
    console.log(`   ${intactes} photos intactes, ${abimees} abimees`);
    check(intactes > 0, 'le PDF contient des photos');
    check(abimees === 0, 'aucune photo abimee', abimees ? `${abimees} abimee(s)` : '');

    // Les proportions, le controle qui manquait toute la journee.
    const attendus = new Set();
    const { data: photos } = await supabase
      .from('book_content_items').select('url').eq('book_id', bookId).eq('kind', 'photo').limit(40);
    for (const photo of (photos || [])) {
      const url = photo.url;
      if (!url) continue;
      const leger = url.includes('/storage/v1/object/public/')
        ? `${url.replace('/storage/v1/object/public/', '/storage/v1/render/image/public/')}?width=300&height=300&resize=contain&format=origin`
        : url;
      try {
        // eslint-disable-next-line no-await-in-loop
        const rep = await fetch(leger);
        // eslint-disable-next-line no-await-in-loop
        const meta = await sharp(Buffer.from(await rep.arrayBuffer())).metadata();
        attendus.add(Math.round((meta.width / meta.height) * 100) / 100);
      } catch (_error) { /* photo illisible */ }
    }
    const deformees = ratios.filter(
      (r) => ![...attendus].some((a) => Math.abs(a - r) < 0.03)
    );
    console.log(`   proportions du livre : ${[...attendus].sort().join(', ')}`);
    check(
      deformees.length === 0,
      'les photos gardent leurs proportions',
      deformees.length ? `${deformees.length} deformee(s) : ${deformees.slice(0, 3).map((r) => r.toFixed(2)).join(', ')}` : ''
    );

    console.log('');
    console.log(`  fichier conserve : ${fichierRecu}`);
  } catch (error) {
    echecs += 1;
    console.log(`\n ECHEC ${error.message}`);
  } finally {
    if (orderId) await supabase.from('orders').delete().eq('id', orderId);
    if (bookId) {
      await supabase.from('book_pages').delete().eq('book_id', bookId);
      await supabase.from('book_content_items').delete().eq('book_id', bookId);
      await supabase.from('books').delete().eq('id', bookId);
    }
    if (userId) await supabase.auth.admin.deleteUser(userId);
    console.log('\n  donnees jetables supprimees');
  }

  console.log(echecs === 0 ? '\nRESULTAT : OK' : `\nRESULTAT : ${echecs} echec(s)`);
  process.exit(echecs === 0 ? 0 : 1);
})();
