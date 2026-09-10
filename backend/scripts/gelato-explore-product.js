// backend/scripts/gelato-explore-product.js
//
// Detail d'un productUid Gelato specifique : bornes reelles de PagesCount
// (min/max/incrementeur), et tarifs par palier de pages. Complement a
// gelato-explore-catalog.js une fois les productUid candidats identifies.
//
// Usage : node scripts/gelato-explore-product.js <productUid>

require('dotenv').config();

const API_KEY = process.env.GELATO_API_KEY;
const BASE_URL = 'https://product.gelatoapis.com/v3';
const productUid = process.argv[2];

if (!API_KEY) {
  console.error('GELATO_API_KEY manquante dans backend/.env');
  process.exit(1);
}
if (!productUid) {
  console.error('Usage: node scripts/gelato-explore-product.js <productUid>');
  process.exit(1);
}

async function gelatoFetch(pathSuffix, options = {}) {
  const response = await fetch(`${BASE_URL}${pathSuffix}`, {
    ...options,
    headers: { 'X-API-KEY': API_KEY, 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  const text = await response.text();
  let json;
  try { json = JSON.parse(text); } catch (_e) { json = { raw: text }; }
  if (!response.ok) {
    const error = new Error(`Gelato API ${response.status} sur ${pathSuffix}`);
    error.body = json;
    throw error;
  }
  return json;
}

async function main() {
  console.log(`\n=== Produit: ${productUid} ===\n`);
  try {
    const product = await gelatoFetch(`/products/${encodeURIComponent(productUid)}`);
    console.log(JSON.stringify(product, null, 2));
  } catch (e) {
    console.error('GET /products/:uid a echoue:', e.message, JSON.stringify(e.body || {}));
  }

  const pageCounts = process.argv.slice(3);
  for (const pageCount of pageCounts) {
    console.log(`\n=== Prix pour pageCount=${pageCount} ===\n`);
    try {
      const prices = await gelatoFetch(
        `/products/${encodeURIComponent(productUid)}/prices?pageCount=${encodeURIComponent(pageCount)}`
      );
      console.log(JSON.stringify(prices, null, 2));
    } catch (e) {
      console.error('GET /products/:uid/prices a echoue:', e.message, JSON.stringify(e.body || {}));
    }
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
