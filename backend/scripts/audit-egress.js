// Combien pesent reellement les photos, et que telecharge le navigateur ?
//
//   node scripts/audit-egress.js
//
// LECTURE SEULE. Ce script ne modifie rien : il liste le stockage, lit la
// base, et mesure le poids reellement servi par quelques URL. Ecrit le
// 2026-09-20 apres l'alerte Supabase (5,5 Go de « cached egress » sur
// l'offre gratuite).
//
// Ce qu'il etablit, chiffres a l'appui :
//   1. le poids total du stockage, reparti entre ORIGINAL / PREVIEW /
//      THUMBNAIL — donc le prix d'une page selon la variante servie ;
//   2. combien de photos n'ont PAS de derivees (elles ne peuvent alors etre
//      servies qu'en original, quoi qu'en dise le code) ;
//   3. l'en-tete de cache reellement renvoye par le CDN, qui decide si un
//      navigateur retelecharge la meme image demain ;
//   4. le cout d'un rendu PDF, qui telecharge lui aussi depuis Supabase.

require('dotenv').config();
const supabase = require('../config/supabase');

const BUCKET = 'contribution-photos';

const mo = (octets) => `${(octets / 1024 / 1024).toFixed(1)} Mo`;
const go = (octets) => `${(octets / 1024 / 1024 / 1024).toFixed(2)} Go`;

// Le stockage Supabase se liste dossier par dossier (un dossier par livre).
async function listerRecursivement(prefixe = '', profondeur = 0) {
  if (profondeur > 3) return [];
  const { data, error } = await supabase.storage.from(BUCKET).list(prefixe, {
    limit: 1000,
    sortBy: { column: 'name', order: 'asc' }
  });
  if (error) throw new Error(`list(${prefixe}) : ${error.message}`);

  const fichiers = [];
  for (const entree of data || []) {
    const chemin = prefixe ? `${prefixe}/${entree.name}` : entree.name;
    // Un « dossier » n'a pas d'id : c'est ainsi que l'API les distingue.
    if (!entree.id) {
      // eslint-disable-next-line no-await-in-loop
      fichiers.push(...await listerRecursivement(chemin, profondeur + 1));
    } else {
      fichiers.push({ chemin, taille: entree.metadata?.size || 0, type: entree.metadata?.mimetype || '' });
    }
  }
  return fichiers;
}

function classer(chemin) {
  if (/_thumb\.jpg$/i.test(chemin)) return 'thumbnail';
  if (/_preview\.jpg$/i.test(chemin)) return 'preview';
  return 'original';
}

async function mesurerUneUrl(url) {
  try {
    const reponse = await fetch(url, { method: 'GET' });
    const octets = Number(reponse.headers.get('content-length') || 0);
    return {
      statut: reponse.status,
      octets,
      cache: reponse.headers.get('cache-control'),
      age: reponse.headers.get('age'),
      cdn: reponse.headers.get('x-cache') || reponse.headers.get('cf-cache-status') || null
    };
  } catch (error) {
    return { statut: 0, erreur: error.message };
  }
}

async function main() {
  console.log('\n=== AUDIT EGRESS — lecture seule ===\n');

  // --- 1. Le stockage ------------------------------------------------------
  const fichiers = await listerRecursivement();
  const parType = { original: { n: 0, octets: 0 }, preview: { n: 0, octets: 0 }, thumbnail: { n: 0, octets: 0 } };
  fichiers.forEach((f) => {
    const type = classer(f.chemin);
    parType[type].n += 1;
    parType[type].octets += f.taille;
  });

  const total = fichiers.reduce((s, f) => s + f.taille, 0);
  console.log('STOCKAGE');
  console.log(`  ${fichiers.length} fichiers, ${go(total)} au total\n`);
  console.log('  variante     nombre   poids total   poids moyen');
  for (const [type, v] of Object.entries(parType)) {
    const moyen = v.n > 0 ? v.octets / v.n : 0;
    console.log(`  ${type.padEnd(12)} ${String(v.n).padStart(6)}   ${go(v.octets).padStart(9)}   ${mo(moyen).padStart(9)}`);
  }

  // --- 2. Les photos en base, et leurs derivees ---------------------------
  const { data: items, error } = await supabase
    .from('book_content_items')
    .select('id, book_id, url, metadata')
    .eq('kind', 'photo');
  if (error) throw new Error(`book_content_items : ${error.message}`);

  const avecThumb = items.filter((i) => i.metadata?.thumbnailUrl).length;
  const avecPreview = items.filter((i) => i.metadata?.previewUrl).length;
  const livres = new Set(items.map((i) => i.book_id)).size;

  console.log('\nPHOTOS EN BASE');
  console.log(`  ${items.length} photos, reparties sur ${livres} livres`);
  console.log(`  avec miniature : ${avecThumb} (${Math.round((avecThumb / items.length) * 100)}%)`);
  console.log(`  avec preview   : ${avecPreview} (${Math.round((avecPreview / items.length) * 100)}%)`);
  console.log(`  SANS derivee   : ${items.length - avecPreview} -> ne peuvent etre servies qu'en ORIGINAL`);

  // --- 3. Ce que renvoie vraiment le CDN ----------------------------------
  const echantillon = items.find((i) => i.metadata?.previewUrl && i.metadata?.thumbnailUrl);
  if (echantillon) {
    console.log('\nCE QUE RENVOIE LE CDN (une photo prise au hasard)');
    for (const [nom, url] of [
      ['original ', echantillon.url],
      ['preview  ', echantillon.metadata.previewUrl],
      ['thumbnail', echantillon.metadata.thumbnailUrl]
    ]) {
      // eslint-disable-next-line no-await-in-loop
      const r = await mesurerUneUrl(url);
      console.log(`  ${nom} : ${String(r.statut).padEnd(4)} ${mo(r.octets).padStart(9)}  cache-control=${r.cache || '?'}  age=${r.age || '-'}`);
    }

    // La transformation d'image (utilisee par le moteur PDF) est-elle
    // seulement disponible sur cette offre ?
    const transforme = `${echantillon.url}?width=1600&height=1600&resize=contain&quality=82&format=origin`;
    const r = await mesurerUneUrl(transforme);
    console.log(`  transform : ${String(r.statut).padEnd(4)} ${mo(r.octets).padStart(9)}  cache-control=${r.cache || '?'}`);
  }

  // --- 4. Le cout d'une page et d'un livre --------------------------------
  const moyOriginal = parType.original.n ? parType.original.octets / parType.original.n : 0;
  const moyPreview = parType.preview.n ? parType.preview.octets / parType.preview.n : 0;
  const moyThumb = parType.thumbnail.n ? parType.thumbnail.octets / parType.thumbnail.n : 0;

  console.log('\nCOUT D\'UN PARCOURS (moyennes mesurees ci-dessus)');
  console.log(`  bibliotheque de 60 photos, en miniatures : ${mo(60 * moyThumb)}`);
  console.log(`  bibliotheque de 60 photos, en originaux  : ${mo(60 * moyOriginal)}`);
  console.log(`  livre de 32 pages x 2 photos, en preview : ${mo(64 * moyPreview)}`);
  console.log(`  livre de 32 pages x 2 photos, en original: ${mo(64 * moyOriginal)}`);
  console.log(`  un rendu PDF (64 photos, transformees)   : environ ${mo(64 * moyPreview)} a ${mo(64 * moyOriginal)}`);

  console.log('\n=== fin — rien n\'a ete modifie ===\n');
}

main().catch((error) => {
  console.error(`\nECHEC : ${error.message}\n`);
  process.exit(1);
});
