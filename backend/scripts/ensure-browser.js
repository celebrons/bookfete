// backend/scripts/ensure-browser.js
//
// Lance a chaque `npm install` (postinstall). Garantit que le Chromium de
// puppeteer est REELLEMENT present, dans le dossier du projet
// (.puppeteerrc.cjs : `.cache/puppeteer`), au lieu de dependre du script
// d'installation de puppeteer lui-meme.
//
// Pourquoi ce filet : sur Render, `GET /api/health/printing` renvoyait
// `browserAvailable: false` alors que puppeteer etait bien en dependance et
// le code deploye. Le cas typique est un `node_modules` restaure depuis le
// cache de build : le paquet est la, mais son script d'installation — donc
// le telechargement du navigateur — n'a jamais tourne. Sans navigateur, ni
// le PDF client ni le fichier d'impression Gelato ne peuvent etre produits.
//
// NE FAIT JAMAIS ECHOUER L'INSTALLATION. Un `npm install` qui casse parce
// qu'un telechargement de 150 Mo a echoue serait bien pire que l'absence de
// navigateur : le serveur ne demarrerait plus du tout, alors que tout le
// reste de l'application (creation, atelier, apercu) fonctionne sans lui.

const { execFile } = require('child_process');
const fs = require('fs');

function log(message) {
  console.log(`[ensure-browser] ${message}`);
}

async function currentExecutablePath() {
  try {
    // eslint-disable-next-line global-require
    const puppeteer = require('puppeteer');
    const executablePath = await puppeteer.executablePath();
    return executablePath && fs.existsSync(executablePath) ? executablePath : null;
  } catch (_error) {
    return null;
  }
}

function installChrome() {
  return new Promise((resolve) => {
    // `puppeteer browsers install chrome` respecte .puppeteerrc.cjs, donc
    // telecharge bien dans le dossier du projet.
    execFile(
      process.platform === 'win32' ? 'npx.cmd' : 'npx',
      ['--no-install', 'puppeteer', 'browsers', 'install', 'chrome'],
      { cwd: __dirname + '/..', timeout: 10 * 60 * 1000 },
      (error, stdout, stderr) => {
        if (error) {
          log(`telechargement impossible : ${error.message.split('\n')[0]}`);
          log((stderr || stdout || '').split('\n').slice(-3).join(' ').trim());
        }
        resolve(!error);
      }
    );
  });
}

(async () => {
  const existing = await currentExecutablePath();
  if (existing) {
    log(`navigateur deja present : ${existing}`);
    return;
  }

  log('navigateur absent, telechargement...');
  await installChrome();

  const after = await currentExecutablePath();
  if (after) {
    log(`navigateur installe : ${after}`);
  } else {
    // Volontairement un avertissement, jamais une erreur : voir l'en-tete.
    log('AVERTISSEMENT : aucun navigateur disponible. Le PDF et le fichier');
    log("d'impression Gelato ne pourront pas etre generes. Diagnostic complet :");
    log('GET /api/health/printing');
  }
})().catch((error) => {
  log(`ignore : ${error.message}`);
});
