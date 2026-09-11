// backend/services/composition/pdfService.js
//
// HTML -> PDF via Chrome/Edge headless.
//
// IMPORTANT (verifie empiriquement, aout 2026) : le flag CLI --print-to-pdf
// ET le parametre CDP Page.printToPDF({scale}) ignorent tous les deux tout
// reglage de resolution — --force-device-scale-factor n'a aucun effet, et
// une astuce CSS (mise en page 3x plus grande + transform:scale) non plus :
// trois PDF generes avec/sans ces leviers font une taille quasi identique
// (~337 800 octets a 6 octets pres). Les photos integrees restent donc
// plafonnees a ~96dpi quelle que soit la methode --print-to-pdf utilisee.
//
// Le mode capture d'ecran standard de Chrome, lui, respecte bien
// deviceScaleFactor (verifie : 669 Ko a l'echelle 1 contre 3,28 Mo a
// l'echelle 3, soit ~5x plus de donnees). renderPdfFromPages() exploite
// donc ce mode : chaque page est capturee individuellement en PNG haute
// resolution (SCREENSHOT_SCALE=3, ~288dpi) via le protocole CDP, puis les
// captures sont assemblees en PDF avec pdfkit (deja une dependance du
// projet). PNG plutot que JPEG : les photos integrees viennent deja d'un
// fichier JPEG (upload utilisateur) — les recapturer en JPEG ajouterait une
// seconde passe de compression avec perte (degradation visible constatee,
// corrigee ici). renderPdfFromHtml() (print-to-pdf direct) reste disponible
// en repli simple/rapide si jamais la capture par page pose probleme.
//
// Ne pas supposer que Chrome/Edge est installe sur l'environnement cible
// (ex. Render) : resolveBrowserPath() peut renvoyer null, a gerer par
// l'appelant (repli sur l'apercu HTML, qui ne depend d'aucun binaire).

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { execFile, spawn } = require('child_process');
const { pathToFileURL } = require('url');
const PDFDocument = require('pdfkit');
const sharp = require('sharp');
const pageRenderer = require('./pageRenderer');

const PDF_PREVIEW_DIR = path.join(__dirname, '..', '..', 'tmp', 'composition-preview');

const CANDIDATE_BROWSER_PATHS = {
  win32: [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
  ],
  darwin: [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
  ],
  linux: [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/usr/bin/microsoft-edge',
    '/usr/bin/microsoft-edge-stable'
  ]
};

// Chromium embarque par puppeteer (dependance ajoutee le 2026-09-11) :
// dernier recours, mais SEUL chemin disponible en hebergement type Render,
// ou aucun navigateur n'est installe sur la machine (pas de Chrome, pas
// d'apt-get hors Docker) — sans lui, ni le fichier d'impression Gelato ni
// l'export PDF client ne peuvent etre produits en ligne.
// Volontairement en DERNIER : une machine qui a deja un vrai Chrome (poste
// de dev Windows/Mac) continue de l'utiliser, comportement inchange.
// `executablePath()` renvoie une promesse selon les versions de puppeteer :
// await gere les deux cas. Jamais bloquant : si puppeteer n'est pas
// installe ou n'a pas telecharge son binaire, on retombe sur null comme
// avant (l'appelant affiche deja un message clair).
async function resolvePuppeteerBrowserPath() {
  try {
    // require() paresseux : ce module doit rester chargeable meme sans
    // puppeteer installe (tests, environnements minimaux).
    // eslint-disable-next-line global-require
    const puppeteer = require('puppeteer');
    const executablePath = await puppeteer.executablePath();
    return executablePath && fs.existsSync(executablePath) ? executablePath : null;
  } catch (_error) {
    return null;
  }
}

async function resolveBrowserPath() {
  const explicit = process.env.PDF_BROWSER_PATH || process.env.CHROME_BIN || process.env.GOOGLE_CHROME_BIN;
  if (explicit && fs.existsSync(explicit)) return explicit;

  const candidates = CANDIDATE_BROWSER_PATHS[process.platform] || CANDIDATE_BROWSER_PATHS.linux;
  const systemBrowser = candidates.find((candidate) => fs.existsSync(candidate));
  if (systemBrowser) return systemBrowser;

  return resolvePuppeteerBrowserPath();
}

function cleanText(value = '') {
  return String(value).replace(/\s+/g, ' ').trim().slice(0, 400);
}

function execFilePromise(command, args, options) {
  return new Promise((resolve, reject) => {
    execFile(command, args, options, (error, stdout, stderr) => {
      if (error) {
        error.message += ` | stdout: ${cleanText(stdout)} | stderr: ${cleanText(stderr)}`;
        reject(error);
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

// Rend un document HTML complet (deja autonome : <html>...<style>...</html>)
// en PDF. Renvoie le chemin du fichier PDF genere. Leve une erreur explicite
// si aucun navigateur headless n'est disponible.
async function renderPdfFromHtml(html, { fileBaseName = 'preview' } = {}) {
  const browserPath = await resolveBrowserPath();
  if (!browserPath) {
    throw new Error(
      "Aucun navigateur headless trouve pour le rendu PDF. Definissez PDF_BROWSER_PATH (Chrome/Edge), ou utilisez l'apercu HTML en attendant."
    );
  }

  await fsp.mkdir(PDF_PREVIEW_DIR, { recursive: true });
  const stamp = Date.now();
  const htmlPath = path.join(PDF_PREVIEW_DIR, `${fileBaseName}-${stamp}.html`);
  const outputPath = path.join(PDF_PREVIEW_DIR, `${fileBaseName}-${stamp}.pdf`);

  try {
    await fsp.writeFile(htmlPath, html, 'utf8');
    const htmlUrl = pathToFileURL(htmlPath).href;

    await execFilePromise(
      browserPath,
      [
        '--headless=new',
        '--disable-gpu',
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--run-all-compositor-stages-before-draw',
        '--virtual-time-budget=15000',
        '--print-to-pdf-no-header',
        `--print-to-pdf=${outputPath}`,
        htmlUrl
      ],
      { timeout: 90000 }
    );

    if (!fs.existsSync(outputPath)) {
      throw new Error("Le navigateur n'a pas produit de fichier PDF.");
    }

    return outputPath;
  } finally {
    fsp.unlink(htmlPath).catch(() => {});
  }
}

// deviceScaleFactor -> dpi effectif (96 * SCREENSHOT_SCALE). 3 => ~288dpi,
// proche du standard impression (300dpi) — 2 (~192dpi) etait visiblement
// trop bas pour un rendu destine a l'impression papier.
const SCREENSHOT_SCALE = 3;
const MM_TO_PT = 72 / 25.4;
const IMAGE_WAIT_TIMEOUT_MS = 8000;
const CDP_READY_TIMEOUT_MS = 10000;

function mmToPx(mm) {
  return Math.round(mm * (96 / 25.4));
}

function cdpPort() {
  return 9300 + Math.floor(Math.random() * 500);
}

async function waitForCdpReady(port) {
  const deadline = Date.now() + CDP_READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) return;
    } catch (_err) {
      // Chrome pas encore pret a accepter des connexions : on reessaie.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('Le navigateur headless (CDP) ne repond pas.');
}

async function openCdpTarget(port) {
  await waitForCdpReady(port);
  const res = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' });
  const data = await res.json();
  if (!data.webSocketDebuggerUrl) {
    throw new Error("Impossible d'ouvrir un onglet dans le navigateur headless (CDP).");
  }
  return data.webSocketDebuggerUrl;
}

function cdpClient(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let nextId = 0;
  const pending = new Map();

  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.id !== undefined && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message || 'Erreur CDP.'));
      else resolve(message.result);
    }
  });

  const ready = new Promise((resolve, reject) => {
    ws.addEventListener('open', () => resolve());
    ws.addEventListener('error', () => reject(new Error('Connexion CDP echouee.')));
  });

  async function call(method, params = {}) {
    await ready;
    const id = ++nextId;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  return { call, close: () => ws.close() };
}

// Attend que toutes les <img> de la page courante soient chargees ET que les
// polices web (document.fonts.ready) aient fini de se charger, ou abandonne
// apres IMAGE_WAIT_TIMEOUT_MS : les photos viennent du Storage Supabase, un
// vrai fetch reseau, pas un asset local instantane — et depuis l'ajout du
// lien Google Fonts (couverture, voir pageRenderer.js), les polices aussi.
// Sans ce second signal, une capture pourrait arriver avant la fin du
// telechargement de la police et retomber silencieusement sur la police de
// repli (Georgia) de facon intermittente — un bug difficile a reproduire.
async function waitForImages(cdp) {
  const expression = `
    Promise.race([
      Promise.all([
        Promise.all(Array.from(document.images).map((img) =>
          img.complete ? Promise.resolve() : new Promise((resolve) => {
            img.addEventListener('load', resolve, { once: true });
            img.addEventListener('error', resolve, { once: true });
          })
        )),
        (document.fonts && document.fonts.ready) ? document.fonts.ready : Promise.resolve()
      ]),
      new Promise((resolve) => setTimeout(resolve, ${IMAGE_WAIT_TIMEOUT_MS}))
    ])
  `;
  await cdp.call('Runtime.evaluate', { expression, awaitPromise: true });
}

/**
 * Capture chaque page individuellement en PNG haute resolution via CDP (voir
 * commentaire en tete de fichier). PNG plutot que JPEG : les photos
 * integrees viennent deja d'un fichier JPEG (upload utilisateur) — les
 * recapturer en JPEG ajouterait une SECONDE passe de compression avec perte,
 * la source concrete de la degradation visible signalee sur les livres
 * generes. Retourne un tableau de Buffer PNG, dans l'ordre de `pages`.
 */
// scale : override ponctuel de SCREENSHOT_SCALE (defaut = qualite de
// production normale, comportement inchange si omis) — ajoute le
// 2026-09-10 pour un diagnostic Gelato (PDF 28 pages a l'echelle normale
// = 66 Mo, au dessus de la limite 50 Mo du bucket print-files/du plan
// Supabase) ; jamais utilise par le pipeline de production reel
// (routes/composition.js), qui n'a pas besoin de reduire la qualite —
// c'est le vrai probleme a resoudre avant d'aller en production avec de
// longs livres, pas une astuce a generaliser silencieusement.
//
// bleedMm : fond perdu ajoute par-dessus la taille de trim (defaut 0 =
// comportement inchange pour tous les appelants existants — le PDF grand
// public telechargeable depuis une commande, routes/books.js, n'en a
// structurellement pas besoin, ce n'est jamais envoye a un imprimeur tel
// quel). Ajoute le 2026-09-10 suite a un vrai rejet Gelato ("Document page
// dimension matches the product size but does not include bleeds — 216x286mm
// attendu contre 210x280mm fourni pour du 21x28cm, soit 3mm de chaque
// cote"). Aucune mise en page de ce projet n'est conçue pour deborder
// intentionnellement jusqu'au bord (voir pageRenderer.js/coverTheme.js,
// aucune notion de bleed nulle part dans leur CSS) — plutot que de
// redessiner chaque layout, la marge est ajoutee APRES capture en etirant
// les pixels du bord vers l'exterieur (sharp, extendWith:'mirror') : la
// zone de fond perdu n'est jamais vue une fois le livre massicote a la
// bonne taille, une extension en miroir suffit a eviter un liseret blanc
// au bord si la coupe n'est pas parfaitement precise — c'est exactement
// le role du bleed, pas une zone destinee a etre visible.
async function capturePagesAsImages({ book, pages, items, layouts, format, scale = SCREENSHOT_SCALE, bleedMm = 0 }) {
  const browserPath = await resolveBrowserPath();
  if (!browserPath) {
    throw new Error(
      "Aucun navigateur headless trouve pour le rendu PDF. Definissez PDF_BROWSER_PATH (Chrome/Edge), ou utilisez l'apercu HTML en attendant."
    );
  }

  const port = cdpPort();
  const child = spawn(browserPath, [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    `--remote-debugging-port=${port}`,
    '--remote-allow-origins=*'
  ], { stdio: 'ignore' });

  await fsp.mkdir(PDF_PREVIEW_DIR, { recursive: true });
  const stamp = Date.now();
  const tempHtmlPaths = [];

  try {
    const wsUrl = await openCdpTarget(port);
    const cdp = cdpClient(wsUrl);

    const widthPx = mmToPx(format.trimWidthMm);
    const heightPx = mmToPx(format.trimHeightMm);
    await cdp.call('Emulation.setDeviceMetricsOverride', {
      width: widthPx,
      height: heightPx,
      deviceScaleFactor: scale,
      mobile: false
    });
    await cdp.call('Page.enable', {});

    const imageBuffers = [];
    for (const page of pages) {
      const html = pageRenderer.renderSinglePageHtml({ book, page, items, layouts, format });
      const htmlPath = path.join(PDF_PREVIEW_DIR, `${stamp}-page-${page.page_index}.html`);
      tempHtmlPaths.push(htmlPath);
      await fsp.writeFile(htmlPath, html, 'utf8');

      await cdp.call('Page.navigate', { url: pathToFileURL(htmlPath).href });
      await waitForImages(cdp);

      const shot = await cdp.call('Page.captureScreenshot', { format: 'png' });
      const rawBuffer = Buffer.from(shot.data, 'base64');

      if (bleedMm > 0) {
        // meme echelle px/mm que la capture elle-meme (mmToPx utilise un
        // ratio fixe 96/25.4, applique ici cote CSS-px puis multiplie par
        // `scale` — la capture est deja a deviceScaleFactor=scale, donc ses
        // pixels reels valent mmToPx(mm)*scale).
        const bleedPx = Math.round(mmToPx(bleedMm) * scale);
        // compressionLevel/effort au maximum : les reglages PNG par defaut
        // de sharp produisent un fichier ~2x PLUS GROS que le PNG d'origine
        // (capture Chrome, deja bien compresse) — verifie empiriquement le
        // 2026-09-10 (2,9 Mo -> 5,8 Mo en reglages par defaut, -> 0,9 Mo au
        // maximum) en cherchant a resoudre le depassement de la limite 50 Mo
        // du bucket. Plus lent, mais l'ecart est trop important pour l'ignorer.
        const bled = await sharp(rawBuffer)
          .extend({ top: bleedPx, bottom: bleedPx, left: bleedPx, right: bleedPx, extendWith: 'mirror' })
          .png({ compressionLevel: 9, effort: 10 })
          .toBuffer();
        imageBuffers.push(bled);
      } else {
        imageBuffers.push(rawBuffer);
      }
    }

    cdp.close();
    return imageBuffers;
  } finally {
    child.kill();
    await Promise.all(tempHtmlPaths.map((p) => fsp.unlink(p).catch(() => {})));
  }
}

// Assemble des images (une image = une page ; PNG, voir capturePagesAsImages)
// en un seul PDF, chaque image couvrant exactement la page au format
// physique demande. pdfkit detecte automatiquement PNG vs JPEG a la lecture
// des octets, donc fonctionne sans changement pour les deux formats.
//
// bleedMm : doit correspondre exactement a celui passe a
// capturePagesAsImages (sinon les images, deja plus grandes que le trim,
// seraient re-compressees dans une page PDF trop petite) — chaque cote de
// la page PDF finale s'agrandit de bleedMm.
function assemblePdfFromImages(imageBuffers, format, outputPath, bleedMm = 0) {
  return new Promise((resolve, reject) => {
    const pageWidthPt = (format.trimWidthMm + bleedMm * 2) * MM_TO_PT;
    const pageHeightPt = (format.trimHeightMm + bleedMm * 2) * MM_TO_PT;
    const doc = new PDFDocument({ autoFirstPage: false });
    const stream = fs.createWriteStream(outputPath);

    stream.on('finish', () => resolve(outputPath));
    stream.on('error', reject);
    doc.on('error', reject);
    doc.pipe(stream);

    for (const buffer of imageBuffers) {
      doc.addPage({ size: [pageWidthPt, pageHeightPt], margin: 0 });
      doc.image(buffer, 0, 0, { width: pageWidthPt, height: pageHeightPt });
    }

    doc.end();
  });
}

/**
 * Rendu PDF haute resolution, page par page (voir commentaire en tete de
 * fichier). C'est la methode a utiliser pour un export destine a
 * l'impression ; renderPdfFromHtml() reste un repli plus simple/rapide
 * mais avec des photos plafonnees a ~96dpi.
 *
 * @param {object} input
 * @param {object} input.book
 * @param {Array} input.pages - resultat de layoutEngine.compose() ou lecture de book_pages
 * @param {Array} input.items
 * @param {Array} [input.layouts]
 * @param {object} [input.format]
 * @param {string} [input.fileBaseName]
 * @returns {Promise<string>} chemin du PDF genere
 */
async function renderPdfFromPages(input) {
  const format = input.format || { trimWidthMm: 210, trimHeightMm: 297 };
  const bleedMm = input.bleedMm || 0;
  const imageBuffers = await capturePagesAsImages({
    book: input.book,
    pages: input.pages,
    items: input.items,
    layouts: input.layouts,
    format,
    scale: input.scale,
    bleedMm
  });

  await fsp.mkdir(PDF_PREVIEW_DIR, { recursive: true });
  const outputPath = path.join(PDF_PREVIEW_DIR, `${input.fileBaseName || 'book'}-${Date.now()}.pdf`);
  await assemblePdfFromImages(imageBuffers, format, outputPath, bleedMm);
  return outputPath;
}

module.exports = {
  resolveBrowserPath,
  renderPdfFromHtml,
  renderPdfFromPages,
  // capturePagesAsImages/SCREENSHOT_SCALE exportes le 2026-09-09 pour
  // services/printing/gelatoCoverComposer.js (couverture wraparound Gelato,
  // capture front/back cover a la taille exacte des panneaux imprimeur —
  // meme primitive, format juste different de celui d'un livre standard).
  capturePagesAsImages,
  SCREENSHOT_SCALE,
  PDF_PREVIEW_DIR
};
