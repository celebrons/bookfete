// backend/services/composition/pdfService.js
//
// HTML -> PDF via Chrome/Edge headless. Meme mecanisme, eprouve en
// production, que backend/routes/books.js (resolvePdfBrowserPath /
// renderPdfFromHtmlWithBrowser) : execFile + --print-to-pdf, pas de
// puppeteer (non installe). Copie volontairement independante plutot que
// de reutiliser books.js, qui sera demantele en phase 10.
//
// Ne pas supposer que Chrome/Edge est installe sur l'environnement cible
// (ex. Render) : resolveBrowserPath() peut renvoyer null, a gerer par
// l'appelant (repli sur l'apercu HTML, qui ne depend d'aucun binaire).

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { execFile } = require('child_process');
const { pathToFileURL } = require('url');

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

function resolveBrowserPath() {
  const explicit = process.env.PDF_BROWSER_PATH || process.env.CHROME_BIN || process.env.GOOGLE_CHROME_BIN;
  if (explicit && fs.existsSync(explicit)) return explicit;

  const candidates = CANDIDATE_BROWSER_PATHS[process.platform] || CANDIDATE_BROWSER_PATHS.linux;
  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
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
  const browserPath = resolveBrowserPath();
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

module.exports = {
  resolveBrowserPath,
  renderPdfFromHtml,
  PDF_PREVIEW_DIR
};
