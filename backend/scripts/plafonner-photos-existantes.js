// Plafonne a ORIGINAL_MAX_PX (storageService.js) les photos DEJA EN LIGNE
// qui depassent ce plafond — pendant du plafonnement applique aux nouveaux
// uploads depuis le 2026-09-29 (retour utilisateur : quota de stockage
// Supabase depasse, 83% du bucket photos venant d'originaux dont les pixels
// au-dela du plus gros besoin reel, 2600px pour l'impression, ne servent
// jamais a rien — voir scripts/audit-egress.js).
//
//   node scripts/plafonner-photos-existantes.js              -> liste seulement
//   node scripts/plafonner-photos-existantes.js --appliquer  -> redimensionne
//
// IRREVERSIBLE : une fois une photo redimensionnee et reecrasee, les pixels
// au-dela du plafond sont perdus pour de bon (pas de sauvegarde — en garder
// une doublerait temporairement le stockage qu'on cherche justement a
// reduire, et l'ecart ne sert jamais a rien dans ce pipeline). Par prudence,
// le script ne touche rien sans --appliquer, et n'ecrit RIEN pour un
// fichier dont le redimensionnement ou le reupload echoue.
//
// Les vignettes/preview NE SONT PAS regenerees : elles etaient deja des
// versions redimensionnees (480/1600px, toujours sous 3000px) de la meme
// photo source — les retoucher ne changerait rien de visible.
//
// APRES chaque redimensionnement, book_content_items.metadata.width/height
// est mis a jour pour refleter le fichier REELLEMENT stocke — sans ca, le
// controle de qualite d'impression (photoQualityEngine.js, qui lit ces
// deux champs, jamais le fichier en direct) continuerait de juger une
// resolution qui n'existe plus.

require('dotenv').config();
const supabase = require('../config/supabase');
const { capOriginalResolution, ORIGINAL_MAX_PX } = require('../services/storageService');

const appliquer = process.argv.includes('--appliquer');
const mo = (o) => (o / 1024 / 1024).toFixed(2);

// Meme analyse d'URL que storageService.deleteByPublicUrl (non exportee de
// la, dupliquee ici a l'identique plutot que de l'exporter pour un usage
// aussi ponctuel).
function parseUrl(publicUrl) {
  const marker = '/storage/v1/object/public/';
  const raw = String(publicUrl || '');
  const at = raw.indexOf(marker);
  if (at === -1) return null;
  const rest = raw.slice(at + marker.length);
  const slash = rest.indexOf('/');
  if (slash === -1) return null;
  const bucket = rest.slice(0, slash);
  const filePath = decodeURIComponent(rest.slice(slash + 1));
  if (!bucket || !filePath) return null;
  // Ne touche jamais une vignette/preview par erreur : seuls les fichiers
  // "originaux" (voir uploadFile) n'ont ni _thumb ni _preview dans leur nom.
  if (filePath.includes('_thumb.') || filePath.includes('_preview.')) return null;
  return { bucket, filePath };
}

(async () => {
  console.log(`Mode : ${appliquer ? 'APPLICATION REELLE' : 'liste seulement (--appliquer pour redimensionner)'}\n`);

  const { data: items, error } = await supabase
    .from('book_content_items')
    .select('id, book_id, url, metadata')
    .eq('kind', 'photo');
  if (error) { console.error('Lecture impossible :', error.message); process.exit(1); }

  console.log(`${items.length} photo(s) en base a examiner...\n`);

  let examinees = 0;
  let dejaSousLePlafond = 0;
  let ignorees = 0;
  let candidates = [];
  let octetsAvant = 0;
  let octetsApres = 0;
  let echecs = 0;

  for (const item of items) {
    const cible = parseUrl(item.url);
    if (!cible) { ignorees += 1; continue; }
    examinees += 1;

    // eslint-disable-next-line no-await-in-loop
    const { data: blob, error: erreurTelechargement } = await supabase.storage.from(cible.bucket).download(cible.filePath);
    if (erreurTelechargement || !blob) {
      console.log(`  ECHEC telechargement (${item.id}) : ${erreurTelechargement?.message || 'fichier introuvable'}`);
      echecs += 1;
      continue;
    }
    // eslint-disable-next-line no-await-in-loop
    const buffer = Buffer.from(await blob.arrayBuffer());

    // eslint-disable-next-line no-await-in-loop
    const { buffer: redimensionne, reencoded } = await capOriginalResolution(buffer, ORIGINAL_MAX_PX);
    if (!reencoded) { dejaSousLePlafond += 1; continue; }

    const sizeOf = require('image-size');
    let dims;
    try { dims = sizeOf(redimensionne); } catch (_e) { dims = null; }
    if (!dims?.width || !dims?.height || Math.max(dims.width, dims.height) > ORIGINAL_MAX_PX) {
      console.log(`  ECHEC verification post-redimensionnement (${item.id}) : rien ecrit.`);
      echecs += 1;
      continue;
    }

    octetsAvant += buffer.length;
    octetsApres += redimensionne.length;
    candidates.push({ item, cible, buffer, redimensionne, dims });
    console.log(`  ${item.id.slice(0, 8)}...  ${mo(buffer.length)} Mo -> ${mo(redimensionne.length)} Mo  (${dims.width}x${dims.height})`);

    if (appliquer) {
      // eslint-disable-next-line no-await-in-loop
      const { error: erreurUpload } = await supabase.storage
        .from(cible.bucket)
        .upload(cible.filePath, redimensionne, { contentType: 'image/jpeg', cacheControl: '31536000, immutable', upsert: true });
      if (erreurUpload) {
        console.log(`    ECHEC reupload : ${erreurUpload.message} — fichier original CONSERVE tel quel.`);
        echecs += 1;
        octetsApres -= redimensionne.length;
        octetsApres += buffer.length; // annule le calcul de gain pour ce fichier
        continue;
      }
      // eslint-disable-next-line no-await-in-loop
      const { error: erreurMaj } = await supabase
        .from('book_content_items')
        .update({ metadata: { ...(item.metadata || {}), width: dims.width, height: dims.height } })
        .eq('id', item.id);
      if (erreurMaj) {
        console.log(`    ATTENTION : fichier redimensionne mais metadata.width/height NON mis a jour (${erreurMaj.message}) — a corriger a la main pour ${item.id}.`);
      }
    }
  }

  console.log('\n=== RESUME ===');
  console.log(`Examinees            : ${examinees}`);
  console.log(`Deja sous le plafond : ${dejaSousLePlafond}`);
  console.log(`Ignorees (pas une URL de ce bucket/deja une derivee) : ${ignorees}`);
  console.log(`Echecs               : ${echecs}`);
  console.log(`${appliquer ? 'Redimensionnees' : 'Candidates'}        : ${candidates.length}`);
  console.log(`Poids avant  : ${mo(octetsAvant)} Mo`);
  console.log(`Poids apres  : ${mo(octetsApres)} Mo`);
  console.log(`${appliquer ? 'Espace libere' : 'Espace qui serait libere'} : ${mo(octetsAvant - octetsApres)} Mo`);

  if (!appliquer && candidates.length > 0) {
    console.log('\nAucune modification effectuee. Relancez avec --appliquer pour redimensionner reellement.');
  }
})();
