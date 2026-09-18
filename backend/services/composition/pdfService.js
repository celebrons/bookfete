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
const sharp = require('../../config/sharp');
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
// Pourquoi le navigateur est-il introuvable ? Sur une machine distante
// (Render), `browserAvailable: false` sans autre detail est un cul-de-sac :
// impossible de savoir si puppeteer manque, si son Chromium n'a pas ete
// telecharge, ou s'il a ete telecharge ailleurs que la ou on le cherche.
// Cette fonction repond a ces trois questions — elle ne sert QU'au
// diagnostic (GET /api/health/printing), jamais au rendu.
async function describeBrowserResolution() {
  const explicit = process.env.PDF_BROWSER_PATH || process.env.CHROME_BIN || process.env.GOOGLE_CHROME_BIN || null;
  const candidates = CANDIDATE_BROWSER_PATHS[process.platform] || CANDIDATE_BROWSER_PATHS.linux;

  const detail = {
    platform: process.platform,
    envPath: explicit,
    envPathExists: explicit ? fs.existsSync(explicit) : null,
    systemCandidates: candidates.map((candidate) => ({ path: candidate, exists: fs.existsSync(candidate) })),
    puppeteerInstalled: false,
    puppeteerCacheDir: null,
    puppeteerExecutablePath: null,
    puppeteerExecutableExists: false,
    puppeteerError: null
  };

  try {
    // eslint-disable-next-line global-require
    const puppeteer = require('puppeteer');
    detail.puppeteerInstalled = true;
    try {
      // eslint-disable-next-line global-require
      detail.puppeteerCacheDir = require('../../.puppeteerrc.cjs')?.cacheDirectory || null;
    } catch (_configError) {
      detail.puppeteerCacheDir = null;
    }
    const executablePath = await puppeteer.executablePath();
    detail.puppeteerExecutablePath = executablePath || null;
    detail.puppeteerExecutableExists = Boolean(executablePath) && fs.existsSync(executablePath);
  } catch (error) {
    detail.puppeteerError = error.message;
  }

  return detail;
}

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

// JPEG PLUTOT QUE PNG pour les pages assemblees (2026-09-15).
//
// Le PNG avait ete choisi pour eviter une SECONDE passe de compression avec
// perte sur des photos deja JPEG. Le raisonnement etait juste, la conclusion
// ne l'etait plus : un livre de 33 pages pesait 183 Mo, soit 5,5 Mo par page.
// Au-dessus de la limite de 50 Mo du bucket Supabase, impossible a
// telecharger pour un client, et lourd a produire sur une petite instance.
//
// Mesure sur une vraie page photo a l'echelle de production : PNG 3,58 Mo,
// JPEG q95 0,86 Mo, q92 0,68 Mo (19%), q88 0,56 Mo. A q92 avec
// chroma 4:4:4 (aucun sous-echantillonnage de la couleur), la perte est
// invisible a l'oeil comme a l'impression — c'est le reglage standard des
// flux d'impression professionnels.
//
// Et il n'y a qu'UNE passe avec perte, pas deux : la photo d'origine est
// decodee, rendue, capturee sans perte par Chrome, puis encodee une seule
// fois ici.
const JPEG_QUALITY = 92;
const MM_TO_PT = 72 / 25.4;
const IMAGE_WAIT_TIMEOUT_MS = 8000;
// Delai de garde du chargement de page. Genereux : une page de couverture
// telecharge aussi les polices Google. Depasse, on capture quand meme —
// c'est le comportement d'avant, mais devenu exceptionnel au lieu d'etre
// la regle.
const PAGE_LOAD_TIMEOUT_MS = 15000;
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

  // Abonnements aux EVENEMENTS du navigateur, par nom de methode.
  //
  // Ce client les ignorait entierement : seules les REPONSES aux appels
  // etaient traitees. Consequence, on ne pouvait pas attendre qu'une page
  // ait fini de se charger — et c'est exactement ce qui produisait des
  // pages sans photos dans le PDF (voir la boucle de capture).
  const listeners = new Map();

  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.id !== undefined && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message || 'Erreur CDP.'));
      else resolve(message.result);
      return;
    }
    // Evenement : on reveille tous ceux qui l'attendaient, une seule fois.
    if (message.method && listeners.has(message.method)) {
      const attentes = listeners.get(message.method);
      listeners.delete(message.method);
      attentes.forEach((resolve) => resolve(message.params));
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

  // Attend UN evenement, avec un delai de garde.
  //
  // Le delai n'est pas une precaution decorative : si l'evenement
  // n'arrivait jamais (page en erreur, navigation annulee), la generation
  // du PDF resterait bloquee pour toujours. Mieux vaut continuer et
  // capturer ce qu'on a — c'est de toute facon ce qui se passait avant,
  // mais a chaque page au lieu d'exceptionnellement.
  function waitForEvent(method, timeoutMs) {
    return new Promise((resolve) => {
      const minuteur = setTimeout(() => resolve(null), timeoutMs);
      const attentes = listeners.get(method) || [];
      attentes.push((params) => { clearTimeout(minuteur); resolve(params); });
      listeners.set(method, attentes);
    });
  }

  return { call, waitForEvent, close: () => ws.close() };
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
  // `decode()` et non `complete` : une image peut etre TELECHARGEE (complete
  // === true) sans etre encore DECODEE, donc pas encore peignable. Capturer
  // a cet instant donne une image partielle — c'est exactement la bande
  // bleue tronquee observee en haut d'une page du PDF le 2026-09-15.
  // `decode()` ne resout que lorsque l'image est reellement prete a etre
  // dessinee.
  //
  // Le repli sur l'ancienne methode couvre les navigateurs ou `decode()`
  // rejette sur une image deja en erreur : on ne veut pas bloquer une page
  // entiere pour une seule photo introuvable.
  const expression = `
    Promise.race([
      Promise.all([
        Promise.all(Array.from(document.images).map((img) => {
          const attendreEvenement = () => new Promise((resolve) => {
            if (img.complete) { resolve(); return; }
            img.addEventListener('load', resolve, { once: true });
            img.addEventListener('error', resolve, { once: true });
          });
          return attendreEvenement().then(() => (
            typeof img.decode === 'function' ? img.decode().catch(() => {}) : undefined
          ));
        })),
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
async function capturePagesAsImages({ book, pages, items, layouts, format, scale = SCREENSHOT_SCALE, bleedMm = 0, onProgress }) {
  const browserPath = await resolveBrowserPath();
  if (!browserPath) {
    throw new Error(
      "Aucun navigateur headless trouve pour le rendu PDF. Definissez PDF_BROWSER_PATH (Chrome/Edge), ou utilisez l'apercu HTML en attendant."
    );
  }

  const port = cdpPort();
  // BRIDER LE NAVIGATEUR.
  //
  // Le 2026-09-18, sur une machine de 2 Go, le noyau a tue Chrome en plein
  // rendu : « Out of memory: Killed process (chrome) ». Le navigateur avait
  // lance HUIT processus pour 407 Mo, a cote des 624 Mo de Node — plus d'un
  // gigaoctet pour rendre des pages UNE PAR UNE.
  //
  // Chrome repartit normalement son travail entre plusieurs processus pour
  // isoler les onglets les uns des autres. Ici il n'y a qu'un seul onglet,
  // ouvert par nous, sur du HTML que nous avons ecrit : cette isolation ne
  // protege de rien et coute la memoire qui manque.
  const child = spawn(browserPath, [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--disable-dev-shm-usage',

    // Un seul processus de rendu : nous n'affichons qu'une page a la fois.
    '--renderer-process-limit=1',
    // Supprime le processus « zygote », qui ne sert qu'a cloner rapidement
    // de nouveaux processus de rendu — inutile quand il n'y en a qu'un.
    '--no-zygote',

    // Services que le rendu n'utilise pas, et qui tournent par defaut.
    '--disable-extensions',
    '--disable-background-networking',
    '--disable-background-timer-throttling',
    '--disable-default-apps',
    '--disable-sync',
    '--disable-translate',
    '--mute-audio',
    '--no-first-run',

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

    // Progression REELLE (2026-09-11) : la capture haute resolution coute
    // plusieurs secondes par page, l'appelant doit pouvoir dire ou il en est
    // plutot qu'afficher une animation decorative. Jamais bloquant : une
    // erreur dans le rapport de progression ne doit pas faire echouer un
    // rendu. Compte les pages CAPTUREES (et non encodees) : c'est ce que
    // l'utilisateur attend, et l'encodage est desormais differe (ci-dessous).
    const reportProgress = (done) => {
      if (typeof onProgress !== 'function') return;
      try {
        onProgress({ done, total: pages.length });
      } catch (_error) {
        // ignore
      }
    };

    // Une promesse par page, dans l'ordre de `pages`. L'encodage PNG du fond
    // perdu (sharp) n'est PLUS attendu avant de passer a la page suivante :
    // il tourne pendant que Chrome charge et capture la page d'apres.
    // Mesure du 2026-09-11 sur un livre reel : navigation+capture ~6 s/page
    // et encodage ~5 s/page s'additionnaient ; en les recouvrant, le cout de
    // l'encodage disparait presque entierement du temps total.
    const encodeTasks = [];
    for (const page of pages) {
      const html = pageRenderer.renderSinglePageHtml({ book, page, items, layouts, format });
      const htmlPath = path.join(PDF_PREVIEW_DIR, `${stamp}-page-${page.page_index}.html`);
      tempHtmlPaths.push(htmlPath);
      await fsp.writeFile(htmlPath, html, 'utf8');

      // ATTENDRE LE CHARGEMENT DE LA PAGE AVANT TOUT LE RESTE.
      //
      // `Page.navigate` rend la main des que la navigation COMMENCE, pas
      // quand le document est pret. Sonder `document.images` juste apres
      // interrogeait donc une page parfois meme pas encore analysee : la
      // liste etait vide, l'attente se terminait instantanement, et on
      // photographiait une page blanche.
      //
      // C'etait une COURSE : elle se gagnait sur les pages legeres et se
      // perdait sur les autres — d'ou des photos manquantes de facon
      // apparemment aleatoire dans le PDF (signale le 2026-09-15 : « beaucoup
      // de photos n'apparaissent pas », dont la photo de 4e de couverture).
      //
      // L'abonnement est pose AVANT la navigation, sinon l'evenement peut
      // arriver entre les deux appels et n'etre attendu par personne.
      const chargement = cdp.waitForEvent('Page.loadEventFired', PAGE_LOAD_TIMEOUT_MS);
      await cdp.call('Page.navigate', { url: pathToFileURL(htmlPath).href });
      await chargement;
      await waitForImages(cdp);

      const shot = await cdp.call('Page.captureScreenshot', { format: 'png' });
      const rawBuffer = Buffer.from(shot.data, 'base64');

      if (bleedMm > 0) {
        // meme echelle px/mm que la capture elle-meme (mmToPx utilise un
        // ratio fixe 96/25.4, applique ici cote CSS-px puis multiplie par
        // `scale` — la capture est deja a deviceScaleFactor=scale, donc ses
        // pixels reels valent mmToPx(mm)*scale).
        const bleedPx = Math.round(mmToPx(bleedMm) * scale);
        // compressionLevel 9 : les reglages PNG par defaut de sharp
        // produisent un fichier ~2x PLUS GROS que le PNG d'origine (capture
        // Chrome, deja bien compresse) — verifie empiriquement le 2026-09-10
        // (2,9 Mo -> 5,8 Mo en reglages par defaut, -> 0,9 Mo au maximum) en
        // cherchant a resoudre le depassement de la limite 50 Mo du bucket.
        //
        // effort 6 et non 10 : mesure du 2026-09-11 sur une page reelle du
        // livre 5197b1ff, les deux donnent EXACTEMENT le meme fichier
        // (2,12 Mo) mais effort 10 met 9,5 s contre 5,2 s. Au-dela de 6,
        // l'effort supplementaire ne gagne plus un octet ici : c'est du
        // temps depense pour rien. (effort 4 descendrait a 3,7 s mais
        // remonterait le fichier a 2,35 Mo — refuse, la limite du bucket
        // est la contrainte qui a dicte ces reglages.)
        //
        // Volontairement PAS attendu ici : la promesse part dans encodeTasks
        // et s'execute pendant la capture de la page suivante.
        const task = sharp(rawBuffer)
          .extend({ top: bleedPx, bottom: bleedPx, left: bleedPx, right: bleedPx, extendWith: 'mirror' })
          .jpeg({ quality: JPEG_QUALITY, chromaSubsampling: '4:4:4', mozjpeg: true })
          .toBuffer();
        // Sans ce `catch` neutre, un echec d'encodage non encore attendu
        // remonterait en unhandledRejection. L'erreur reste portee par
        // `task`, que le Promise.all final attend bel et bien.
        task.catch(() => {});
        // Au plus deux encodages en vol : on attend celui d'il y a deux
        // pages avant d'en lancer un nouveau, pour que les buffers bruts
        // (3 a 7 Mo chacun) ne s'accumulent pas en memoire sur un livre de
        // 30 pages — la marge est etroite sur l'instance Render (512 Mo).
        if (encodeTasks.length >= 2) {
          await encodeTasks[encodeTasks.length - 2];
        }
        encodeTasks.push(task);
      } else {
        // Meme conversion sans fond perdu : c'est ce chemin qu'emprunte le
        // PDF telechargeable par le client, celui qui pesait 183 Mo.
        const task = sharp(rawBuffer)
          .jpeg({ quality: JPEG_QUALITY, chromaSubsampling: '4:4:4', mozjpeg: true })
          .toBuffer();
        task.catch(() => {});
        if (encodeTasks.length >= 2) {
          await encodeTasks[encodeTasks.length - 2];
        }
        encodeTasks.push(task);
      }
      reportProgress(encodeTasks.length);
    }

    // Ferme l'onglet AVANT d'attendre les derniers encodages : toutes les
    // captures sont faites, garder Chrome connecte pendant que sharp finit
    // ne servirait qu'a occuper de la memoire.
    cdp.close();
    return await Promise.all(encodeTasks);
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
// `insertInsideCover` : glisse une page blanche juste apres la couverture.
//
// Ce n'est pas cosmetique, c'est ce qui fait que les DOUBLES PAGES se
// raccordent chez tout le monde. Une photo etalee sur deux pages est stockee
// en deux moities : la gauche sur un index PAIR, la droite sur l'impair
// suivant. Sans page de garde, la moitie gauche tombe sur une page PAIRE du
// PDF — or la quasi-totalite des lecteurs apparient (1,2), (3,4), (5,6)... et
// placent les pages IMPAIRES a gauche. Les deux moities se retrouvaient donc
// inversees (signale le 2026-09-15 : « la partie gauche se retrouve sur la
// droite »).
//
// Avec la page de garde, la moitie gauche tombe sur une page impaire : elle
// s'affiche a gauche, dans un lecteur conforme comme dans un lecteur naif.
// Et cette page blanche n'est pas une verrue : elle represente exactement
// l'interieur de la couverture, ce qu'on voit en ouvrant un vrai livre.
//
// Le fichier envoye a l'imprimeur n'emprunte PAS ce chemin (voir
// services/printing/gelatoPrintFile.js, qui assemble son propre document) :
// aucune page n'y est ajoutee.
function assemblePdfFromImages(imageBuffers, format, outputPath, bleedMm = 0, insertInsideCover = false) {
  return new Promise((resolve, reject) => {
    const pageWidthPt = (format.trimWidthMm + bleedMm * 2) * MM_TO_PT;
    const pageHeightPt = (format.trimHeightMm + bleedMm * 2) * MM_TO_PT;
    const doc = new PDFDocument({ autoFirstPage: false });

    // PAGES EN VIS-A-VIS a l'ouverture (mode "livre").
    //
    // Une photo etalee sur la double page (FULL_PHOTO_SPREAD) est stockee
    // comme deux demi-images sur deux pages consecutives : dans un lecteur
    // PDF en mode "une page a la fois", on ne voit jamais l'image entiere —
    // "sur le pdf, il faut afficher les deux pages cote a cote pour ne pas la
    // perdre" (retour utilisateur 2026-09-14).
    //
    // /TwoPageRight = deux pages a la fois, les pages IMPAIRES a droite. La
    // page 1 du PDF (la couverture) reste donc seule, puis les pages 2-3,
    // 4-5... — soit exactement les doubles-pages du livre : la page
    // interieure d'index 0 est bien une page de GAUCHE (atelier :
    // leftPageIndex = spread * 2), et c'est la meme parite qui decide quelle
    // moitie de l'image est affichee (voir pageRenderer .photo-spread).
    //
    // C'est une PREFERENCE D'AFFICHAGE inscrite dans le catalogue du PDF :
    // aucune page n'est modifiee, fusionnee ni reordonnee. Le fichier envoye
    // a l'imprimeur, lui, n'emprunte pas ce chemin (voir
    // services/printing/gelatoPrintFile.js, qui assemble son propre document)
    // : une page = une page, toujours.
    // /TwoPageLeft = deux pages a la fois, les IMPAIRES a gauche. C'est
    // exactement l'appariement que font d'eux-memes les lecteurs qui
    // ignorent ce reglage : les deux comportements coincident, et une double
    // page se raccorde partout. (Avec /TwoPageRight, seuls les lecteurs
    // conformes affichaient correctement — les autres inversaient les
    // moities.)
    if (doc._root?.data) doc._root.data.PageLayout = 'TwoPageLeft';

    const stream = fs.createWriteStream(outputPath);

    stream.on('finish', () => resolve(outputPath));
    stream.on('error', reject);
    doc.on('error', reject);
    doc.pipe(stream);

    imageBuffers.forEach((buffer, index) => {
      doc.addPage({ size: [pageWidthPt, pageHeightPt], margin: 0 });
      doc.image(buffer, 0, 0, { width: pageWidthPt, height: pageHeightPt });
      // Apres la couverture (premiere image) uniquement.
      if (insertInsideCover && index === 0) {
        doc.addPage({ size: [pageWidthPt, pageHeightPt], margin: 0 });
      }
    });

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
    onProgress: input.onProgress,
    bleedMm
  });

  // Les pages sont rendues ; reste l'assemblage du document. Il dure
  // quelques secondes sur un livre lourd : sans ce signal, la barre
  // resterait figee a 100 % sans explication.
  if (typeof input.onProgress === 'function') {
    try {
      input.onProgress({ phase: 'assembling', done: input.pages.length, total: input.pages.length });
    } catch (_error) {
      // jamais bloquant
    }
  }

  await fsp.mkdir(PDF_PREVIEW_DIR, { recursive: true });
  const outputPath = path.join(PDF_PREVIEW_DIR, `${input.fileBaseName || 'book'}-${Date.now()}.pdf`);
  // La page de garde n'a de sens que si le document commence bien par une
  // couverture — c'est le cas de tout PDF passe par composeCoversIntoPages.
  const commenceParUneCouverture = input.pages?.[0]?.content?.kind === 'front-cover';
  await assemblePdfFromImages(imageBuffers, format, outputPath, bleedMm, commenceParUneCouverture);
  return outputPath;
}

module.exports = {
  resolveBrowserPath,
  describeBrowserResolution,
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
