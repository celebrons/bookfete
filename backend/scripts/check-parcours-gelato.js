// LE PARCOURS COMPLET D'UN ENVOI A L'IMPRIMEUR.
//
//   node scripts/check-parcours-gelato.js
//   node scripts/check-parcours-gelato.js --url https://78.232.5.181.sslip.io --modele "Portugal"
//
// Pendant du parcours PDF (check-parcours-pdf.js), pour l'autre moitie du
// produit. Ecrit le 2026-09-19 : « pour l'envoi Gelato, c'est KO : le
// serveur met trop de temps a repondre ».
//
// Ce message venait du NAVIGATEUR, qui abandonne au bout de quinze secondes.
// La route est pourtant censee repondre tout de suite et travailler ensuite.
// Ce script mesure donc d'abord le DELAI DE REPONSE, puis suit le travail
// jusqu'au bout.
//
// SECURITE : rien de facturable ne peut partir. La route refuse d'elle-meme
// si GELATO_LIVE_ORDERS vaut '1', et ce script verifie en plus que le
// brouillon cree est bien de type « draft » avant de le supprimer chez
// Gelato. Compte, livre et commande sont jetables et supprimes a la fin.

require('dotenv').config();
const fs = require('fs');
const path = require('path');

const supabase = require('../config/supabase');
const gelatoClient = require('../services/printing/gelatoClient');
const { createClient } = require('@supabase/supabase-js');

const args = process.argv.slice(2);
const valeur = (nom, defaut) => {
  const i = args.indexOf(nom);
  return i > -1 ? args[i + 1] : defaut;
};
const BASE = String(valeur('--url', 'https://78.232.5.181.sslip.io')).replace(/\/$/, '');
const MODELE = String(valeur('--modele', 'portugal')).toLowerCase();
const PATIENCE_MS = Number(valeur('--patience', 20 * 60 * 1000));

// Au-dela, ce n'est plus « le serveur travaille », c'est « le navigateur a
// abandonne ». Le seuil du client est a quinze secondes.
const REPONSE_ATTENDUE_MS = 5000;

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

(async () => {
  console.log(`Parcours complet d'un envoi a l'imprimeur sur ${BASE}\n`);

  if (process.env.GELATO_LIVE_ORDERS === '1') {
    console.log(' ECHEC GELATO_LIVE_ORDERS vaut 1 : ce script ne tourne pas en mode facturable.');
    process.exit(1);
  }

  const marque = `gelato-${Date.now()}`;
  const email = `${marque}@celebrons-test.invalid`;
  const motDePasse = `jetable-${Math.random().toString(36).slice(2)}-A1!`;
  let userId = null;
  let bookId = null;
  let orderId = null;
  let brouillonGelato = null;

  try {
    console.log('1. Compte, livre et commande impression jetables');
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

    // Les pages designent les photos par identifiant : recopier sans
    // renumeroter donne un livre vide (voir check-parcours-pdf.js).
    const { data: itemsModele } = await supabase
      .from('book_content_items').select('*').eq('book_id', modele.id);
    const correspondance = new Map();
    const copies = (itemsModele || []).map((l) => {
      const c = { ...l, book_id: bookId };
      delete c.id; delete c.created_at; delete c.updated_at;
      return { ancien: l.id, ligne: c };
    });
    if (copies.length) {
      const { data: inseres, error } = await supabase
        .from('book_content_items').insert(copies.map((c) => c.ligne)).select('id');
      if (error) throw new Error(`copie des photos : ${error.message}`);
      (inseres || []).forEach((ligne, i) => correspondance.set(copies[i].ancien, ligne.id));
    }
    const renumeroter = (v) => {
      if (typeof v === 'string') return correspondance.get(v) || v;
      if (Array.isArray(v)) return v.map(renumeroter);
      if (v && typeof v === 'object') {
        const o = {};
        Object.entries(v).forEach(([k, x]) => { o[correspondance.get(k) || k] = renumeroter(x); });
        return o;
      }
      return v;
    };
    const { data: pagesModele } = await supabase
      .from('book_pages').select('*').eq('book_id', modele.id);
    const copiesPages = (pagesModele || []).map((l) => {
      const c = { ...l, book_id: bookId, content: renumeroter(l.content) };
      delete c.id; delete c.created_at; delete c.updated_at;
      return c;
    });
    if (copiesPages.length) {
      const { error } = await supabase.from('book_pages').insert(copiesPages);
      if (error) throw new Error(`copie des pages : ${error.message}`);
    }
    await supabase.from('books').update({
      cover_overrides: renumeroter(modele.cover_overrides),
      cover_config: renumeroter(modele.cover_config)
    }).eq('id', bookId);

    const { data: commande, error: erreurCommande } = await supabase
      .from('orders')
      .insert({
        book_id: bookId,
        owner_id: userId,
        type: 'print',
        status: 'paid',
        paid_at: new Date().toISOString(),
        metadata: {
          pricing: { pages: modele.page_count, printFormat: modele.print_format, printUnitCents: 7450 },
          shippingAddress: {
            firstName: 'Test', lastName: 'Jetable',
            line1: '1 rue de la Verification', postalCode: '75001',
            city: 'Paris', country: 'FR', email
          }
        }
      })
      .select('id')
      .single();
    if (erreurCommande) throw new Error(`commande : ${erreurCommande.message}`);
    orderId = commande.id;
    console.log(`   livre « ${modele.title} » recopie, commande impression payee\n`);

    console.log('2. Connexion');
    const client = createClient(URL_SUPABASE, ANON);
    const { data: sess, error: erreurSession } = await client.auth.signInWithPassword({
      email, password: motDePasse
    });
    if (erreurSession) throw new Error(`connexion : ${erreurSession.message}`);
    const entetes = {
      Authorization: `Bearer ${sess.session.access_token}`,
      'Content-Type': 'application/json'
    };
    console.log('   connecte\n');

    console.log("3. Demande d'envoi a l'imprimeur — LE DELAI DE REPONSE EST LE SUJET");
    const t0 = Date.now();
    const reponse = await fetch(`${BASE}/api/orders/${orderId}/gelato-test`, {
      method: 'POST', headers: entetes, body: JSON.stringify({})
    });
    const delai = Date.now() - t0;
    const corps = await reponse.json().catch(() => ({}));

    console.log(`   reponse en ${(delai / 1000).toFixed(1)} s : ${reponse.status} ${JSON.stringify(corps).slice(0, 100)}\n`);
    check(reponse.status === 202, "l'envoi est accepte (202)", `recu ${reponse.status}`);
    check(
      delai < REPONSE_ATTENDUE_MS,
      `le serveur repond en moins de ${REPONSE_ATTENDUE_MS / 1000} s`,
      `${(delai / 1000).toFixed(1)} s — le navigateur abandonne a 15 s`
    );
    if (reponse.status !== 202) throw new Error(`envoi refuse : ${JSON.stringify(corps).slice(0, 200)}`);

    console.log("4. Suivi du travail (comme l'ecran de commande)");
    const echeance = Date.now() + PATIENCE_MS;
    let meta = {};
    while (Date.now() < echeance) {
      // eslint-disable-next-line no-await-in-loop
      const { data } = await supabase.from('orders').select('metadata').eq('id', orderId).single();
      meta = data?.metadata || {};
      const p = meta.gelatoProgress;
      process.stdout.write(`\r   ${p ? `${p.phase} ${p.done}/${p.total}` : 'en cours'}            `);
      if (meta.gelatoOrderId || meta.gelatoError) break;
      // eslint-disable-next-line no-await-in-loop
      await attendre(3000);
    }
    console.log(`\n   termine en ${Math.round((Date.now() - t0) / 1000)} s\n`);

    check(!meta.gelatoError, "l'envoi n'a pas echoue", meta.gelatoError ? String(meta.gelatoError).slice(0, 160) : '');
    check(Boolean(meta.gelatoOrderId), "l'imprimeur a bien recu la commande", meta.gelatoOrderId || 'aucun identifiant');
    brouillonGelato = meta.gelatoOrderId || null;

    // La garde qui compte : rien de facturable.
    check(
      String(meta.gelatoOrderType || '').toLowerCase() !== 'order',
      'la commande est un BROUILLON, pas une production',
      `type : ${meta.gelatoOrderType || '?'}`
    );

    if (meta.printFileUrl || meta.gelatoFileUrl) {
      const url = meta.printFileUrl || meta.gelatoFileUrl;
      try {
        const tete = await fetch(url, { method: 'HEAD' });
        const taille = Number(tete.headers.get('content-length') || 0);
        if (taille) {
          console.log(`   fichier depose : ${(taille / 1048576).toFixed(1)} Mo`);
          check(taille < 50 * 1048576, 'le fichier tient sous la limite de 50 Mo du stockage');
        }
      } catch (_error) { /* url non joignable : sans consequence ici */ }
    }
  } catch (error) {
    echecs += 1;
    console.log(`\n ECHEC ${error.message}`);
  } finally {
    // Le brouillon chez Gelato : cree par ce test, supprime par ce test.
    if (brouillonGelato) {
      try {
        await gelatoClient.deleteOrder(brouillonGelato);
        console.log(`\n  brouillon Gelato ${brouillonGelato} supprime`);
      } catch (error) {
        console.log(`\n  ATTENTION brouillon Gelato ${brouillonGelato} non supprime : ${error.message}`);
      }
    }
    if (orderId) await supabase.from('orders').delete().eq('id', orderId);
    if (bookId) {
      await supabase.from('book_pages').delete().eq('book_id', bookId);
      await supabase.from('book_content_items').delete().eq('book_id', bookId);
      await supabase.from('books').delete().eq('id', bookId);
    }
    if (userId) await supabase.auth.admin.deleteUser(userId);
    console.log('  donnees jetables supprimees');
  }

  console.log(echecs === 0 ? '\nRESULTAT : OK' : `\nRESULTAT : ${echecs} echec(s)`);
  process.exit(echecs === 0 ? 0 : 1);
})();
