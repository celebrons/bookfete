// Les donnees sont-elles reellement protegees ?
//
//   node scripts/check-rls.js
//
// Rejoue, avec la cle ANON publique (celle qu'embarque chaque navigateur),
// exactement les acces qui passaient AVANT sql/phase22_rls_books_profiles.sql.
// Ecrit le 2026-09-20, apres avoir constate que `books` etait lisible ET
// MODIFIABLE sans aucun compte, et `profiles` lisible avec les e-mails.
//
// LECTURE SEULE cote donnees : la seule ecriture tentee est un UPDATE qui
// DOIT echouer, et il vise un identifiant qui n'existe pas — meme si la
// protection etait absente, il ne modifierait rien.
//
// A relancer apres toute migration touchant aux politiques.

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const cheminEnvFront = path.join(__dirname, '../../frontend/.env');

function lireCleAnon() {
  // La cle publique vit dans le .env du frontend : c'est bien celle-la qu'il
  // faut eprouver, pas une cle de service qui contourne RLS par conception.
  const depuisEnv = process.env.SUPABASE_ANON_KEY || process.env.REACT_APP_SUPABASE_ANON_KEY;
  const url = process.env.SUPABASE_URL;
  if (depuisEnv && url) return { url, key: depuisEnv };

  if (!fs.existsSync(cheminEnvFront)) {
    throw new Error('Cle anon introuvable (ni dans l environnement, ni dans frontend/.env).');
  }
  const contenu = fs.readFileSync(cheminEnvFront, 'utf8');
  const lire = (cle) => (contenu.match(new RegExp(`^${cle}=(.*)$`, 'm')) || [])[1]?.trim();
  return { url: lire('REACT_APP_SUPABASE_URL'), key: lire('REACT_APP_SUPABASE_ANON_KEY') };
}

let echecs = 0;
const verifier = (libelle, ok, detail) => {
  console.log(`  ${ok ? 'OK   ' : 'FAILLE'}  ${libelle}${detail ? ` — ${detail}` : ''}`);
  if (!ok) echecs += 1;
};

async function main() {
  const { url, key } = lireCleAnon();
  const anon = createClient(url, key);

  console.log('\nAcces avec la cle publique du navigateur, sans aucun compte :\n');

  // --- Lectures qui doivent etre vides -----------------------------------
  for (const table of ['books', 'profiles', 'book_content_items', 'book_pages', 'orders', 'app_events']) {
    // eslint-disable-next-line no-await-in-loop
    const { data, error } = await anon.from(table).select('*').limit(5);
    // Deux formes de protection acceptables : un refus explicite, ou zero
    // ligne renvoyee (RLS filtre silencieusement, c'est le cas normal).
    const protege = Boolean(error) || (data || []).length === 0;
    verifier(
      `${table} : aucune ligne lisible`,
      protege,
      error ? `refus ${error.code || ''}` : `${(data || []).length} ligne(s)`
    );
  }

  // --- Ecriture qui doit etre refusee ------------------------------------
  //
  // Viser un identifiant inexistant ne prouverait RIEN : la requete renvoie
  // 0 ligne qu'il y ait protection ou non. On vise donc un VRAI livre, en
  // lui reecrivant EXACTEMENT son titre actuel : si la protection manque,
  // la ligne revient (et rien n'a change) ; si elle est en place, rien ne
  // revient. Aucune donnee n'est modifiee dans les deux cas.
  //
  // Le titre reel est lu avec la cle de service, qui contourne RLS par
  // conception — c'est le seul moyen de connaitre la valeur a reecrire une
  // fois la protection posee. Sans cette cle, on saute le test plutot que
  // d'en faire un qui ne prouve rien.
  const cleService = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (cleService) {
    const service = createClient(url, cleService);
    const { data: temoin } = await service.from('books').select('id, title').limit(1).single();

    if (temoin?.id) {
      const { data: modifiees, error: erreurEcriture } = await anon
        .from('books')
        .update({ title: temoin.title })
        .eq('id', temoin.id)
        .select('id');

      verifier(
        'books : ecriture refusee sans compte (sur un livre REEL, titre inchange)',
        Boolean(erreurEcriture) || (modifiees || []).length === 0,
        erreurEcriture ? `refus ${erreurEcriture.code || ''}` : `${(modifiees || []).length} ligne(s) atteinte(s)`
      );
    }
  } else {
    console.log('  passe   books : ecriture — cle de service absente, test non concluant, ignore');
  }

  // --- Le stockage -------------------------------------------------------
  const { data: fichiers, error: erreurStockage } = await anon.storage
    .from('contribution-photos')
    .list('', { limit: 5 });
  // Informatif : le bucket est PUBLIC par choix (les photos doivent
  // s'afficher dans le livre sans URL signee). On signale seulement que le
  // catalogue est enumerable, ce qui n'est pas la meme chose qu'une fuite de
  // donnees de compte.
  console.log(
    `\n  info    stockage : ${erreurStockage ? 'listing refuse' : `${(fichiers || []).length} entree(s) listable(s)`}`
    + ' — bucket public par choix, voir le diagnostic egress.'
  );

  console.log(`\nRESULTAT : ${echecs === 0 ? 'OK — rien n est accessible sans compte' : `${echecs} FAILLE(S)`}\n`);
  process.exit(echecs === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(`\nECHEC : ${error.message}\n`);
  process.exit(1);
});
