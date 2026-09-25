// A QUOI RESSEMBLERA LE LIVRE UNE FOIS RELIE ?
//
//   node scripts/check-ouvertures.js <commande-id | chemin.pdf | url> [nb-ouvertures]
//
// Exemples :
//   node scripts/check-ouvertures.js 228b0937-9367-4437-b694-0b63e29d20ee
//   node scripts/check-ouvertures.js backend/tmp/mon-fichier.pdf 8
//
// LECTURE SEULE : ne touche ni la base, ni le fichier, ni Gelato.
//
// POURQUOI CE SCRIPT EXISTE
//
// Un fichier d'impression est une SUITE de pages ; un livre relie, lui, se
// lit par OUVERTURES (deux pages qui se font face). Regarder le PDF page
// apres page ne dit donc rien de ce qu'on aura sous les yeux — c'est
// exactement ce qui a laisse passer, jusqu'au 2026-09-25, une double page
// qui s'est imprimee en recto-verso.
//
// Ici on remonte les ouvertures reelles, et on les pose cote a cote en
// image. C'est la seule facon de verifier une double page sans payer une
// commande : on compare l'image a un livre qu'on a deja en main, ou on
// regarde simplement si la photo etalee est entiere sur UNE ouverture.
//
// LE MODELE (voir services/composition/pageParity.js)
//
//   page PDF 1            = la couverture enveloppante
//   page PDF 2            = le contre-plat (interieur de couverture), A GAUCHE
//   page PDF 3            = la page 1 du livre, A DROITE
//   ouverture n           = (PDF 2n, PDF 2n+1)
//
// La page 1 est donc seule a droite, et les ouvertures suivantes portent
// les pages (2,3), (4,5), (6,7)...

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const http = require('http');
const puppeteer = require('puppeteer');
const sharp = require('../config/sharp');

const SORTIE_DIR = path.join(__dirname, '..', 'tmp');
const PORT = 8799;

const VIEWER = `<!doctype html><html><body style="margin:0">
<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
<script>
pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
window.rendre = async (nums) => {
  const doc = await pdfjsLib.getDocument('/document.pdf').promise;
  const out = { total: doc.numPages, pages: [] };
  for (const n of nums) {
    if (n > doc.numPages) continue;
    const page = await doc.getPage(n);
    const vp = page.getViewport({ scale: 0.30 });
    const c = document.createElement('canvas');
    c.width = vp.width; c.height = vp.height;
    await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
    out.pages.push({ n, png: c.toDataURL('image/png') });
  }
  return out;
};
</script></body></html>`;

// La source peut etre un identifiant de commande : on va alors chercher
// dans la base l'adresse du fichier reellement envoye a l'imprimeur.
async function resoudreLaSource(source) {
  if (/^https?:\/\//.test(source)) return { url: source, quoi: 'une adresse' };
  if (fs.existsSync(source)) return { fichier: path.resolve(source), quoi: 'un fichier local' };

  const supabase = require('../config/supabase');
  const { data, error } = await supabase
    .from('orders').select('id,status,metadata').eq('id', source);
  if (error) throw new Error(`commande illisible : ${error.message}`);
  if (!data || !data.length) throw new Error(`ni fichier, ni adresse, ni commande connue : ${source}`);
  const url = data[0].metadata?.gelatoFileUrl;
  if (!url) throw new Error("cette commande n'a pas encore de fichier d'impression");
  return { url, quoi: `la commande ${source} (${data[0].status})` };
}

async function telecharger(url, vers) {
  const reponse = await fetch(url);
  if (!reponse.ok) throw new Error(`telechargement impossible (HTTP ${reponse.status})`);
  fs.writeFileSync(vers, Buffer.from(await reponse.arrayBuffer()));
}

(async () => {
  const source = process.argv[2];
  const nbOuvertures = Math.max(1, Number(process.argv[3]) || 6);
  if (!source) {
    console.error('Usage : node scripts/check-ouvertures.js <commande-id | chemin.pdf | url> [nb-ouvertures]');
    process.exit(1);
  }

  fs.mkdirSync(SORTIE_DIR, { recursive: true });
  const pdfLocal = path.join(SORTIE_DIR, 'ouvertures-source.pdf');

  const resolu = await resoudreLaSource(source);
  console.log(`Source : ${resolu.quoi}`);
  if (resolu.url) {
    console.log('Telechargement...');
    await telecharger(resolu.url, pdfLocal);
  } else {
    fs.copyFileSync(resolu.fichier, pdfLocal);
  }
  console.log(`Fichier : ${(fs.statSync(pdfLocal).size / 1e6).toFixed(1)} Mo`);

  fs.writeFileSync(path.join(SORTIE_DIR, 'ouvertures-viewer.html'), VIEWER);
  const srv = http.createServer((req, res) => {
    const nom = req.url === '/document.pdf' ? 'ouvertures-source.pdf' : 'ouvertures-viewer.html';
    const f = path.join(SORTIE_DIR, nom);
    res.writeHead(200, { 'Content-Type': nom.endsWith('.pdf') ? 'application/pdf' : 'text/html' });
    fs.createReadStream(f).pipe(res);
  }).listen(PORT);

  const nums = [];
  for (let o = 1; o <= nbOuvertures; o += 1) nums.push(2 * o, 2 * o + 1);

  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle0' });
  const rendu = await page.evaluate((n) => window.rendre(n), nums);
  await browser.close();
  srv.close();

  console.log(`Le document compte ${rendu.total} pages.`);
  const parNum = new Map(rendu.pages.map((p) => [p.n, Buffer.from(p.png.split(',')[1], 'base64')]));
  if (!parNum.size) throw new Error('aucune page rendue');

  const temporaires = [];
  for (const [n, buffer] of parNum) {
    const f = path.join(SORTIE_DIR, `_ouv-${n}.png`);
    fs.writeFileSync(f, buffer);
    temporaires.push(f);
  }

  const premiere = path.join(SORTIE_DIR, `_ouv-${nums[0]}.png`);
  const { width: W, height: H } = await sharp(premiere).metadata();
  const MARGE = 26;
  const ENTRE = 34;
  const ouverturesRendues = [];
  for (let o = 1; o <= nbOuvertures; o += 1) {
    if (parNum.has(2 * o) || parNum.has(2 * o + 1)) ouverturesRendues.push(o);
  }

  const tuiles = [];
  ouverturesRendues.forEach((o, i) => {
    const top = MARGE + i * (H + ENTRE);
    if (parNum.has(2 * o)) tuiles.push({ input: path.join(SORTIE_DIR, `_ouv-${2 * o}.png`), left: MARGE, top });
    if (parNum.has(2 * o + 1)) tuiles.push({ input: path.join(SORTIE_DIR, `_ouv-${2 * o + 1}.png`), left: MARGE + W + 6, top });
    const libGauche = o === 1 ? 'interieur de couverture' : `page ${2 * o - 2}`;
    const libDroite = parNum.has(2 * o + 1) ? `page ${2 * o - 1}` : '(fin)';
    const svg = `<svg width="${W * 2 + 6}" height="26"><text x="0" y="18" font-size="15" font-family="sans-serif" fill="#5a4a2a">Ouverture ${o} :  ${libGauche}   |   ${libDroite}</text></svg>`;
    tuiles.push({ input: Buffer.from(svg), left: MARGE, top: top - 22 });
  });

  const sortie = path.join(SORTIE_DIR, 'ouvertures.png');
  await sharp({
    create: {
      width: W * 2 + 6 + MARGE * 2,
      height: MARGE * 2 + ouverturesRendues.length * (H + ENTRE),
      channels: 3,
      background: '#faf6ec'
    }
  }).composite(tuiles).png().toFile(sortie);

  temporaires.forEach((f) => fs.unlinkSync(f));
  console.log('');
  console.log(`IMAGE : ${sortie}`);
  console.log('');
  console.log('A regarder : une photo etalee sur une double page doit etre ENTIERE');
  console.log('sur UNE seule ligne. Si ses deux moities tombent sur deux lignes');
  console.log("differentes, elle s'imprimera en recto-verso.");
})().catch((error) => {
  console.error('ERREUR', error.message);
  process.exit(1);
});
