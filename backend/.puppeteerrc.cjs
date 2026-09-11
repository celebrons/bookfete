const path = require('path');

// Puppeteer telecharge son propre Chromium a l'installation (npm install).
// Par defaut il le range dans ~/.cache/puppeteer — un dossier QUI N'EXISTE
// PLUS au moment ou Render demarre le service (le home de l'etape de build
// n'est pas conserve), ce qui donne un "Could not find Chrome" en
// production alors que le build s'est bien passe.
//
// En le rangeant DANS le projet, le binaire fait partie de ce que Render
// conserve entre le build et l'execution — recette documentee cote
// Puppeteer/Render. Aucun effet en local (juste un autre dossier).
module.exports = {
  cacheDirectory: path.join(__dirname, '.cache', 'puppeteer')
};
