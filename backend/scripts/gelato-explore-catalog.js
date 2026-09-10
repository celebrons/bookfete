// backend/scripts/gelato-explore-catalog.js
//
// Script d'exploration UNIQUEMENT (rien n'est envoye a Supabase/production) :
// interroge les vrais catalogues Gelato "hard-cover-photobooks" et
// "soft-cover-photobooks" pour recuperer la liste reelle des attributs
// disponibles (tailles, nombre de pages, papier...) puis un echantillon de
// produits reels, afin de faire correspondre nos 3 formats (livret
// 170x170mm carre / standard 220x280mm / luxe 240x320mm — voir
// backend/services/composition/coverFormat.js) a de vrais productUid Gelato.
//
// Usage : GELATO_API_KEY dans backend/.env (jamais commite), puis :
//   node scripts/gelato-explore-catalog.js
//
// Ecrit le resultat dans scripts/.gelato-catalog-dump.json (gitignore) pour
// pouvoir l'inspecter sans re-appeler l'API a chaque fois.

require('dotenv').config();
const fs = require('fs');
const path = require('path');

const API_KEY = process.env.GELATO_API_KEY;
const BASE_URL = 'https://product.gelatoapis.com/v3';
// Confirmes via GET /v3/catalogs le 2026-09-09 : pas de catalogue unique
// "photobooks", mais deux catalogues separes rigide/souple.
const CATALOG_UIDS = ['hard-cover-photobooks', 'soft-cover-photobooks'];
const OUT_FILE = path.join(__dirname, '.gelato-catalog-dump.json');

if (!API_KEY) {
  console.error(
    'GELATO_API_KEY manquante. Ajoutez-la dans backend/.env (GELATO_API_KEY=votre_cle), ' +
    'jamais dans ce script ni en argument de commande.'
  );
  process.exit(1);
}

async function gelatoFetch(pathSuffix, options = {}) {
  const response = await fetch(`${BASE_URL}${pathSuffix}`, {
    ...options,
    headers: {
      'X-API-KEY': API_KEY,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch (_err) {
    json = { raw: text };
  }
  if (!response.ok) {
    const error = new Error(`Gelato API ${response.status} sur ${pathSuffix}`);
    error.status = response.status;
    error.body = json;
    throw error;
  }
  return json;
}

async function exploreCatalog(catalogUid) {
  console.log(`\n\n################  CATALOGUE "${catalogUid}"  ################\n`);

  console.log(`--- Attributs disponibles ---\n`);
  const catalog = await gelatoFetch(`/catalogs/${catalogUid}`);
  const attributes = catalog.productAttributes || [];

  for (const attr of attributes) {
    console.log(`- ${attr.title} (${attr.productAttributeUid})`);
    const values = Array.isArray(attr.values) ? attr.values : [];
    if (!Array.isArray(attr.values) && attr.values) {
      console.log(`    (valeurs non-enum, brut: ${JSON.stringify(attr.values)})`);
    }
    const preview = values.slice(0, 60).map((v) => `${v.title} [${v.productAttributeValueUid}]`);
    preview.forEach((line) => console.log(`    • ${line}`));
    if (values.length > 60) {
      console.log(`    ... (+${values.length - 60} autres valeurs)`);
    }
  }

  console.log(`\n--- Echantillon de vrais produits (recherche sans filtre, limite 100) ---\n`);
  let searchResult = null;
  try {
    searchResult = await gelatoFetch(`/catalogs/${catalogUid}/products:search`, {
      method: 'POST',
      body: JSON.stringify({ limit: 100, offset: 0 })
    });
    const products = searchResult.products || [];
    console.log(`${products.length} produits recuperes (hits total annonce: ${searchResult.hits ?? 'inconnu'})`);
    products.slice(0, 20).forEach((p) => {
      console.log(`  - ${p.productUid}`);
      console.log(`      ${JSON.stringify(p.attributes)}`);
    });
  } catch (searchError) {
    console.error('Recherche produit echouee :', searchError.message, JSON.stringify(searchError.body || {}));
  }

  return { catalog, searchResult };
}

async function main() {
  const dump = { fetchedAt: new Date().toISOString(), catalogs: {} };

  for (const catalogUid of CATALOG_UIDS) {
    dump.catalogs[catalogUid] = await exploreCatalog(catalogUid);
  }

  fs.writeFileSync(OUT_FILE, JSON.stringify(dump, null, 2), 'utf8');
  console.log(`\n\nDump complet ecrit dans ${OUT_FILE}\n`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Erreur:', error.message);
    if (error.body) console.error(JSON.stringify(error.body, null, 2));
    process.exit(1);
  });
