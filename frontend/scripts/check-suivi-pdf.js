// L'ecran de suivi affiche-t-il VRAIMENT la barre de fabrication ?
//
//   node scripts/check-suivi-pdf.js
//
// Signale le 2026-09-16 : « il n'y a pas de barre de progression, il y a
// juste ce message ». Cause : la reponse du serveur qui lance le rendu avait
// expire (20 s), donc l'ecran n'avait aucun job a suivre — et le bloc ne
// s'affichait QUE s'il en avait un. Le message, lui, venait d'ailleurs.
//
// On ne relit donc pas le code : on REND le composant dans les trois etats
// qui comptent et on regarde le HTML produit.

const path = require('path');
const babel = require('@babel/core');
const fs = require('fs');

// Les imports de feuilles de style n'ont pas de sens hors du navigateur.
require.extensions['.css'] = () => {};
const compiler = (module_, filename) => {
  const code = babel.transformFileSync(filename, {
    presets: [require.resolve('babel-preset-react-app')],
    babelrc: false,
    configFile: false
  }).code;
  return module_._compile(code, filename);
};
require.extensions['.js'] = (module_, filename) => (
  filename.includes('node_modules')
    ? module_._compile(fs.readFileSync(filename, 'utf8'), filename)
    : compiler(module_, filename)
);

process.env.NODE_ENV = 'test';
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const StepTracking = require(path.join(__dirname, '..', 'src/components/orders/checkout/StepTracking.js')).default;

let echecs = 0;
const check = (cond, msg) => { if (!cond) echecs += 1; console.log((cond ? '  OK  ' : ' ECHEC') + ' ' + msg); };

const rendre = (props) => renderToStaticMarkup(React.createElement(StepTracking, {
  order: { id: 'o1', order_number: 'CMD-1', type: 'pdf', status: 'paid', metadata: {} },
  tracking: null,
  loadingTracking: false,
  onRefreshTracking: () => {},
  onDownloadPdf: () => {},
  onRegeneratePdf: () => {},
  regeneratingPdf: false,
  pdfJob: null,
  downloadingKind: null,
  gelatoTestAvailable: false,
  gelatoSending: false,
  gelatoProgress: null,
  gelatoResult: null,
  gelatoError: null,
  onSendGelatoTest: () => {},
  ...props
}));

console.log('Cas 1 — la reponse du serveur a ete perdue : la commande dit');
console.log('        « en fabrication », mais l ecran n a AUCUN job a suivre.');
console.log('        C est exactement le cas signale.\n');
let html = rendre({ order: { id: 'o1', order_number: 'CMD-1', type: 'pdf', status: 'pdf_generating', metadata: {} }, pdfJob: null });
check(html.includes('pdf-build-block'), 'le bloc de fabrication est affiche');
check(html.includes('gelato-progress-bar'), 'la BARRE de progression est affichee');
check(html.includes('Vous serez informé par email'), 'le message accompagne la barre');
check(html.includes('Relancer la fabrication'), 'une issue est proposee si rien n avance');

console.log('\nCas 2 — le rendu avance : 19 pages sur 32.\n');
html = rendre({
  order: { id: 'o1', order_number: 'CMD-1', type: 'pdf', status: 'pdf_generating', metadata: {} },
  pdfJob: { status: 'rendering', progress: { phase: 'pages', done: 19, total: 32, updatedAt: new Date().toISOString() } }
});
check(html.includes('19 / 32 pages'), 'le decompte reel des pages est affiche');
check(/width:\s*59(\.\d+)?%/.test(html) || html.includes('width:59%'), `la barre est remplie a 59% (${(html.match(/width:[^;"]*/) || ['(aucune largeur)'])[0]})`);

console.log('\nCas 3 — le PDF est pret : plus de barre, un bouton de telechargement.\n');
html = rendre({
  order: { id: 'o1', order_number: 'CMD-1', type: 'pdf', status: 'pdf_ready', metadata: { pdfReady: true } },
  pdfJob: { status: 'ready' }
});
check(!html.includes('pdf-build-block'), 'le bloc de fabrication a disparu');
check(html.includes('Telecharger le PDF final'), 'le telechargement est propose');

console.log(echecs === 0 ? '\nRESULTAT : OK' : `\nRESULTAT : ${echecs} echec(s)`);
process.exit(echecs === 0 ? 0 : 1);
