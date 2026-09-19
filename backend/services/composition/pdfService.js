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
// UN SEUL RENDU A LA FOIS.
//
// Chaque rendu lance son propre Chrome et monte a plusieurs centaines de
// Mo. Deux rendus simultanes sur le serveur de 2 Go, et la machine devient
// injoignable : le 2026-09-19 elle repondait encore au ping (10 ms) mais
// ni le site, ni SSH ne repondaient. Render, lui, tuait le processus a
// 512 Mo — une erreur franche valait mieux que ce coma.
//
// La file est volontairement de UN. Un rendu dure deux minutes : deux
// utilisateurs simultanes attendent leur tour, au lieu de faire tomber le
// serveur pour tout le monde.
//
// Elle avance meme quand un rendu echoue, sans quoi un seul plantage
// bloquerait tous les suivants jusqu au redemarrage.
// LES NAVIGATEURS EN COURS, pour pouvoir les arreter.
//
// Un rendu qui part en vrille tenait la machine sans qu on puisse rien
// faire depuis l'application : il fallait ouvrir un terminal et tuer
// Chrome a la main. Demande du 2026-09-19 : voir les rendus en cours
// depuis l espace d administration, et pouvoir les arreter.
//
// On garde le PROCESSUS, pas une promesse : tuer le navigateur fait
// echouer l appel CDP en attente, donc le rendu se termine en erreur au
// lieu de rester suspendu. C est exactement le comportement voulu.
const navigateursEnCours = new Map();

// Retourne le nombre de navigateurs reellement arretes (0 si le rendu
// etait deja fini, ou attendait encore son tour dans la file).
function arreterLeRendu(renderId) {
  const enfant = navigateursEnCours.get(String(renderId || ""));
  if (!enfant) return 0;
  try {
    enfant.kill();
    return 1;
  } catch (_error) {
    return 0;
  }
}

function rendusEnCours() {
  return [...navigateursEnCours.keys()];
}

let fileDeRendu = Promise.resolve();
let rendusEnFile = 0;

function unSeulRenduALaFois(travail) {
  rendusEnFile += 1;
  const resultat = fileDeRendu.then(travail, travail);
  fileDeRendu = resultat.then(
    () => { rendusEnFile -= 1; },
    () => { rendusEnFile -= 1; }
  );
  return resultat;
}

// Pour la supervision (routes/admin.js) : combien de rendus sont en cours
// ou en attente d un tour.
function nombreDeRendusEnFile() {
  return rendusEnFile;
}

async function renderPdfFromHtmlDirect(html, { fileBaseName = 'preview' } = {}) {
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
const MM_PAR_POUCE = 25.4;

// Cadence du compte des photos pendant le chargement. Assez rapide pour
// que la barre bouge, assez lent pour ne rien couter au rendu.
const IMAGE_PROGRESS_INTERVAL_MS = 1000;
// COMBIEN DE TEMPS ATTENDRE LES PHOTOS AVANT D'IMPRIMER.
//
// Huit secondes, fixes, quel que soit le livre. Mesure du 2026-09-19 sur
// « Portugal 2025 » : au bout de 8 s, 9 photos sur 56 etaient pretes.
// Chrome imprimait donc avec 47 photos a moitie chargees — ce sont les
// images « tronquees, coupees » signalees par l utilisateur.
//
// Le rendu par impression charge TOUT le livre dans un seul document, la
// ou l'ancien rendu par captures en chargeait quelques-unes par page. Le
// delai devait suivre, il ne l a pas fait.
//
// Le budget depend donc du nombre de photos. Mesure de reference : 56
// photos pretes en 29 s, soit ~0,5 s par photo ; on prend trois fois
// cette cadence, plus un socle, pour tenir sur une machine chargee ou un
// reseau lent.
const IMAGE_WAIT_SOCLE_MS = 30000;
const IMAGE_WAIT_PAR_PHOTO_MS = 1500;
const IMAGE_WAIT_PLAFOND_MS = 5 * 60 * 1000;

const budgetDesPhotos = (nombre) => Math.min(
  IMAGE_WAIT_PLAFOND_MS,
  IMAGE_WAIT_SOCLE_MS + Math.max(0, Number(nombre) || 0) * IMAGE_WAIT_PAR_PHOTO_MS
);
// Delai de garde du chargement de page. Genereux : une page de couverture
// telecharge aussi les polices Google. Depasse, on capture quand meme —
// c'est le comportement d'avant, mais devenu exceptionnel au lieu d'etre
// la regle.
const PAGE_LOAD_TIMEOUT_MS = 15000;

// Delai de garde d un appel CDP. Genereux : ecrire le PDF d un livre de
// trente pages prend deux minutes sur une petite machine. Mais BORNE :
// sans lui, une connexion rompue laisse le rendu en attente sans fin.
const CDP_CALL_TIMEOUT_MS = 10 * 60 * 1000;
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

  // Une socket qui se ferme en cours de route laissait les appels en
  // attente POUR TOUJOURS. Le 2026-09-19, un rendu est reste bloque
  // dix-huit minutes avec un Chrome a 0 % de processeur : le navigateur
  // avait repondu, plus personne n ecoutait. Un appel sans reponse doit
  // echouer franchement — c est ce qui permet au job de se declarer en
  // echec et de rendre la main a l utilisateur.
  const rompre = (raison) => {
    const enAttente = [...pending.values()];
    pending.clear();
    enAttente.forEach(({ reject }) => reject(new Error(raison)));
  };

  ws.addEventListener('close', (evenement) => {
    const code = evenement?.code;
    // 1009 = message trop volumineux. Un PDF de plusieurs dizaines de Mo
    // revient en base64 dans UN seul message : c est la limite a
    // soupconner en premier si elle reapparait.
    const detail = code === 1009
      ? ' (reponse trop volumineuse pour la connexion)'
      : '';
    rompre(`Le navigateur a ferme la connexion (code ${code ?? '?'})${detail}.`);
  });
  ws.addEventListener('error', () => rompre('Connexion au navigateur perdue.'));

  async function call(method, params = {}, timeoutMs = CDP_CALL_TIMEOUT_MS) {
    await ready;
    const id = ++nextId;
    return new Promise((resolve, reject) => {
      const garde = setTimeout(() => {
        if (!pending.has(id)) return;
        pending.delete(id);
        reject(new Error(`Le navigateur n a pas repondu a ${method} en ${Math.round(timeoutMs / 1000)} s.`));
      }, timeoutMs);
      // Ne pas retenir le processus en vie pour un simple delai de garde.
      if (typeof garde.unref === 'function') garde.unref();

      pending.set(id, {
        resolve: (valeur) => { clearTimeout(garde); resolve(valeur); },
        reject: (erreur) => { clearTimeout(garde); reject(erreur); }
      });
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
// apres le budget calcule plus haut : les photos viennent du Storage Supabase, un
// vrai fetch reseau, pas un asset local instantane — et depuis l'ajout du
// lien Google Fonts (couverture, voir pageRenderer.js), les polices aussi.
// Sans ce second signal, une capture pourrait arriver avant la fin du
// telechargement de la police et retomber silencieusement sur la police de
// repli (Georgia) de facon intermittente — un bug difficile a reproduire.
// `onProgress` est facultatif. Le rendu par impression n a plus de boucle
// page par page : sans ce compte, la barre d avancement resterait
// indeterminee pendant toute la fabrication — exactement le reproche fait
// le 2026-09-15 (« il n y a pas de barre de progression »). Le
// telechargement des photos est la partie longue et se compte, elle.
async function waitForImages(cdp, onProgress) {
  // Une image est REGLEE quand elle a fini, chargee ou en erreur. Compter
  // les seules images valides bloquerait pour toujours sur une photo
  // introuvable : mieux vaut imprimer un trou visible qu attendre en vain.
  const compter = async () => {
    const r = await cdp.call('Runtime.evaluate', {
      expression: `JSON.stringify({
        total: document.images.length,
        reglees: Array.from(document.images).filter((i) => i.complete).length,
        valides: Array.from(document.images).filter((i) => i.complete && i.naturalWidth > 0).length
      })`,
      returnByValue: true
    });
    try {
      return JSON.parse((r && r.result && r.result.value) || '{}');
    } catch (_error) {
      return {};
    }
  };

  const premier = await compter();
  const total = premier.total || 0;

  // AUCUNE IMAGE : il n'y a rien a attendre.
  //
  // Sans ce retour, la boucle ci-dessous ne trouve jamais sa condition de
  // sortie (« toutes reglees » n'a pas de sens quand il n'y en a aucune) et
  // brule son budget entier — trente secondes. Sur le fichier d'impression,
  // qui rend les pages UNE PAR UNE, chaque garde blanche et chaque page de
  // texte coutait donc trente secondes de plus. Introduit le 2026-09-19 en
  // corrigeant l'attente des photos, et signale le jour meme : « l'envoi
  // Gelato toujours bloque ».
  if (total === 0) {
    return { total: 0, reglees: 0, valides: 0, incomplet: false };
  }

  const budget = budgetDesPhotos(total);
  const echeance = Date.now() + budget;

  let dernier = premier;
  while (Date.now() < echeance) {
    if ((dernier.reglees || 0) >= total) break;
    if (typeof onProgress === 'function') {
      try {
        onProgress({ done: dernier.reglees || 0, total });
      } catch (_error) { /* un rapport d avancement ne casse pas un rendu */ }
    }
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setTimeout(resolve, IMAGE_PROGRESS_INTERVAL_MS));
    // eslint-disable-next-line no-await-in-loop
    dernier = await compter();
  }

  // Chargee ne veut pas dire PEIGNABLE : `decode()` ne resout que lorsque
  // l'image est reellement prete a etre dessinee. Capturer avant, c'est la
  // bande tronquee observee le 2026-09-15. Les polices comptent aussi.
  const finition = `
    Promise.race([
      Promise.all([
        Promise.all(Array.from(document.images).map((img) => (
          typeof img.decode === 'function' ? img.decode().catch(() => {}) : undefined
        ))),
        (document.fonts && document.fonts.ready) ? document.fonts.ready : Promise.resolve()
      ]),
      new Promise((resolve) => setTimeout(resolve, 30000))
    ])
  `;
  await cdp.call('Runtime.evaluate', { expression: finition, awaitPromise: true });

  const bilan = await compter();
  return {
    total,
    reglees: bilan.reglees || 0,
    valides: bilan.valides || 0,
    // Vrai quand le budget a expire avant que tout soit arrive. C est LE
    // signal qui manquait : sans lui, un livre partait tronque sans que
    // personne ne le sache.
    incomplet: total > 0 && (bilan.reglees || 0) < total
  };
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

function argumentsDuNavigateur(port) {
  return [
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
  ];
}

async function capturePagesAsImagesDirect({ book, pages, items, layouts, format, scale = SCREENSHOT_SCALE, bleedMm = 0, onProgress }) {
  const browserPath = await resolveBrowserPath();
  if (!browserPath) {
    throw new Error(
      "Aucun navigateur headless trouve pour le rendu PDF. Definissez PDF_BROWSER_PATH (Chrome/Edge), ou utilisez l'apercu HTML en attendant."
    );
  }

  const port = cdpPort();
  const child = spawn(browserPath, argumentsDuNavigateur(port), { stdio: 'ignore' });

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

// Photos allegees pour le PDF DE LECTURE.
//
// Ce fichier sert a lire et a archiver, pas a imprimer : les photos y
// arrivaient a leur resolution d origine (3024 px), ce qui donnait 84,6 Mo
// pour un livre de 32 pages. Trop lourd a telecharger pour un client, et
// inutile — l imprimeur, lui, recoit un autre fichier avec les originales.
//
// Supabase sait redimensionner a la volee : /object/public/ devient
// /render/image/public/. Une URL qui ne vient pas de ce stockage passe
// telle quelle plutot que d etre cassee.
//
// 2000 px de large donnent ~240 dpi sur une page de 210 mm : plus net que
// ce qu un ecran affiche, bien assez pour une impression de depannage.
const LARGEUR_PHOTO_LECTURE = 2000;

function allegerLesPhotos(items, largeurMax) {
  if (!Array.isArray(items) || !largeurMax) return items;
  return items.map((item) => {
    const url = item?.url;
    if (item?.kind !== 'photo' || typeof url !== 'string') return item;
    if (!url.includes('/storage/v1/object/public/')) return item;
    return {
      ...item,
      url: url.replace(
        '/storage/v1/object/public/',
        '/storage/v1/render/image/public/'
      // format=origin est INDISPENSABLE.
      //
      // Sans lui, Supabase sert du WebP a Chrome (qui l annonce dans son
      // en-tete Accept). Or un PDF ne sait pas porter de WebP : Chrome
      // redecode chaque photo et la reecrit SANS compression. Mesure du
      // 2026-09-19 sur le meme livre : 252 Mo avec WebP, contre 85 Mo en
      // laissant les photos d origine. Alleger les photos rendait le
      // fichier trois fois plus lourd.
      //
      // format=origin garde le JPEG, que Chrome recopie tel quel.
      ) + `?width=${largeurMax}&quality=82&format=origin`
    };
  });
}

// Rendu PDF par IMPRESSION plutot que par captures d ecran.
//
// Mesure le 2026-09-18 sur un livre reel de 32 pages, face a la methode
// par captures :
//
//   memoire de Node : 608 Mo  ->  131 Mo
//   duree           : 108 s   ->   74 s
//   photos          : 288 dpi ->  366 dpi (leur resolution d origine)
//
// Le commentaire en tete de ce fichier affirmait que printToPDF plafonnait
// les photos a 96 dpi. C etait une erreur de METHODE : la conclusion avait
// ete tiree du POIDS des fichiers produits. Or un PDF qui integre les
// photos telles quelles est forcement plus leger qu une pile de captures,
// sans rien perdre. En mesurant les pixels des images integrees plutot que
// les octets du fichier, le resultat s inverse.
//
// Ici, Chrome ecrit le PDF lui-meme : plus aucune capture, plus de base64,
// plus de tampon d images en memoire. Les textes y sont du vrai texte
// vectoriel, net a toute echelle, et les photos sont integrees a leur
// resolution d origine.
// Recupere un PDF produit par Page.printToPDF EN FLUX.
//
// Par defaut, Chrome renvoie le fichier entier en base64 dans UN SEUL
// message de la connexion de debogage. Pour un livre de photos, ce message
// depasse la centaine de Mo : la connexion se ferme sans un mot et l appel
// reste en attente. C est ce qui a bloque un rendu dix-huit minutes le
// 2026-09-19, avec un navigateur a 0 % de processeur — il avait fini, la
// reponse ne passait pas.
//
// En flux, le navigateur rend une poignee et on lit par tranches. La taille
// du livre cesse d etre une limite.
const TAILLE_TRANCHE = 4 * 1024 * 1024;

async function lirePdfEnFlux(cdp, handle, outputPath) {
  const fichier = await fsp.open(outputPath, 'w');
  try {
    for (;;) {
      // eslint-disable-next-line no-await-in-loop
      const tranche = await cdp.call('IO.read', { handle, size: TAILLE_TRANCHE });
      if (tranche?.data) {
        // eslint-disable-next-line no-await-in-loop
        await fichier.write(Buffer.from(tranche.data, tranche.base64Encoded === false ? 'utf8' : 'base64'));
      }
      if (tranche?.eof) break;
    }
  } finally {
    await fichier.close();
    // Liberer la poignee cote navigateur, meme si la lecture a echoue.
    await cdp.call('IO.close', { handle }).catch(() => {});
  }
}

async function renderPdfByPrintingDirect(input) {
  const format = input.format || { trimWidthMm: 210, trimHeightMm: 297 };
  const bleedMm = Number(input.bleedMm) > 0 ? Number(input.bleedMm) : 0;
  const pages = Array.isArray(input.pages) ? input.pages : [];

  const browserPath = await resolveBrowserPath();
  if (!browserPath) {
    throw new Error(
      "Aucun navigateur headless trouve pour le rendu PDF. Definissez PDF_BROWSER_PATH (Chrome/Edge), ou utilisez l'apercu HTML en attendant."
    );
  }

  // Une page blanche apres la couverture, pour que les doubles pages
  // tombent en vis-a-vis dans un lecteur qui affiche deux pages a la fois.
  // Elle est INSEREE DANS LE HTML, la ou la methode par captures l ajoutait
  // au moment de l assemblage.
  //
  // Sans spreadIndex : ce n est pas une page du livre, elle ne doit pas
  // participer au calcul des moities d une photo en double page.
  const enPlanches = input.spreadLayout === true;
  const commenceParUneCouverture = pages[0]?.content?.kind === 'front-cover';
  // En planches, la feuille porte deja les deux pages : la page blanche
  // qui servait a decaler l appariement dans un lecteur deviendrait une
  // feuille vide au milieu du livre.
  const pagesAImprimer = (input.insertInsideCover && commenceParUneCouverture && !enPlanches)
    ? [pages[0], { page_index: 0.5, layout_id: null, content: {} }, ...pages.slice(1)]
    : pages;

  // Le fichier d impression garde les photos d origine ; le PDF de lecture
  // les recoit allegees (voir allegerLesPhotos). On se sert du fond perdu
  // comme signal : seul le fichier destine au massicot en a un.
  const items = bleedMm > 0
    ? input.items
    : allegerLesPhotos(input.items, input.imageMaxWidth ?? LARGEUR_PHOTO_LECTURE);

  const html = pageRenderer.renderBookHtml({
    book: input.book,
    pages: pagesAImprimer,
    items,
    layouts: input.layouts,
    format,
    bleedMm,
    spreadLayout: enPlanches
  });

  await fsp.mkdir(PDF_PREVIEW_DIR, { recursive: true });
  const stamp = Date.now();
  const htmlPath = path.join(PDF_PREVIEW_DIR, `${input.fileBaseName || 'book'}-${stamp}.html`);
  const outputPath = path.join(PDF_PREVIEW_DIR, `${input.fileBaseName || 'book'}-${stamp}.pdf`);
  await fsp.writeFile(htmlPath, html, 'utf8');

  const port = cdpPort();
  const child = spawn(browserPath, argumentsDuNavigateur(port), { stdio: 'ignore' });
  // Sous ce nom, l espace d administration peut arreter ce rendu.
  const renderId = String(input.renderId || '');
  if (renderId) navigateursEnCours.set(renderId, child);

  try {
    const wsUrl = await openCdpTarget(port);
    const cdp = cdpClient(wsUrl);
    await cdp.call('Page.enable', {});

    // Meme precaution que pour les captures : Page.navigate rend la main
    // des que la navigation COMMENCE. Sans attendre le chargement puis le
    // decodage des images, on imprimerait des pages vides.
    const chargement = cdp.waitForEvent('Page.loadEventFired', PAGE_LOAD_TIMEOUT_MS);
    await cdp.call('Page.navigate', { url: pathToFileURL(htmlPath).href });
    await chargement;
    const photos = await waitForImages(cdp, ({ done, total }) => {
      if (typeof input.onProgress !== 'function') return;
      try {
        input.onProgress({ phase: 'photos', done, total });
      } catch (_error) { /* jamais bloquant */ }
    });

    // MIEUX VAUT UNE ERREUR QU UN LIVRE TRONQUE.
    //
    // Un PDF ou les photos sont coupees ressemble a un PDF : rien ne le
    // signale, et c'est l'utilisateur qui le decouvre en le feuilletant
    // (2026-09-19). Une generation qui echoue, elle, se voit et se relance.
    if (photos.incomplet) {
      throw new Error(
        `Rendu interrompu : ${photos.total - photos.reglees} photo(s) sur `
        + `${photos.total} ne sont pas arrivees a temps. Le livre aurait ete `
        + 'incomplet. Relancez la generation.'
      );
    }

    if (typeof input.onProgress === 'function') {
      try {
        input.onProgress({ phase: 'assembling', done: pagesAImprimer.length, total: pagesAImprimer.length });
      } catch (_error) { /* jamais bloquant */ }
    }

    const resultat = await cdp.call('Page.printToPDF', {
      printBackground: true,
      // En flux : voir lirePdfEnFlux. Sans ca, un livre de photos ne
      // revient tout simplement pas.
      transferMode: 'ReturnAsStream',
      // Taille de feuille EXPLICITE, en pouces. Le fond perdu est deja dans
      // la regle @page du document : les deux doivent concorder.
      paperWidth: ((format.trimWidthMm + bleedMm * 2) * (enPlanches ? 2 : 1)) / MM_PAR_POUCE,
      paperHeight: (format.trimHeightMm + bleedMm * 2) / MM_PAR_POUCE,
      marginTop: 0,
      marginBottom: 0,
      marginLeft: 0,
      marginRight: 0,
      preferCSSPageSize: false
    });

    if (resultat?.stream) {
      await lirePdfEnFlux(cdp, resultat.stream, outputPath);
    } else {
      // Repli : un navigateur qui ignore transferMode repond encore en
      // base64. Ca marche tant que le fichier reste petit.
      await fsp.writeFile(outputPath, Buffer.from(resultat.data, 'base64'));
    }

    cdp.close();
    return outputPath;
  } finally {
    if (renderId) navigateursEnCours.delete(renderId);
    child.kill();
    fsp.unlink(htmlPath).catch(() => {});
  }
}

// Les enveloppes : c est ce que le reste de l application appelle. Seules
// ces trois fonctions lancent un navigateur, donc seules elles ont besoin
// d un tour de file. renderPdfFromPages, lui, passe par
// capturePagesAsImages : le mettre aussi dans la file le ferait attendre
// son propre tour, indefiniment.
const renderPdfFromHtml = (html, options) => unSeulRenduALaFois(
  () => renderPdfFromHtmlDirect(html, options)
);
const capturePagesAsImages = (input) => unSeulRenduALaFois(
  () => capturePagesAsImagesDirect(input)
);
const renderPdfByPrinting = (input) => unSeulRenduALaFois(
  () => renderPdfByPrintingDirect(input)
);

module.exports = {
  resolveBrowserPath,
  describeBrowserResolution,
  renderPdfFromHtml,
  renderPdfFromPages,
  renderPdfByPrinting,
  // capturePagesAsImages/SCREENSHOT_SCALE exportes le 2026-09-09 pour
  // services/printing/gelatoCoverComposer.js (couverture wraparound Gelato,
  // capture front/back cover a la taille exacte des panneaux imprimeur —
  // meme primitive, format juste different de celui d'un livre standard).
  capturePagesAsImages,
  nombreDeRendusEnFile,
  arreterLeRendu,
  rendusEnCours,
  // Expose pour les tests : la file se verifie sans lancer de navigateur.
  __filePourLesTests: { unSeulRenduALaFois },
  // Expose pour les scripts de mesure : reproduire EXACTEMENT le document
  // envoye a l impression, photos allegees comprises.
  __allegerPourLesTests: allegerLesPhotos,
  SCREENSHOT_SCALE,
  PDF_PREVIEW_DIR
};
