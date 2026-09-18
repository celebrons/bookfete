// L'ecran « Mes commandes » dit-il la verite ?
//
//   node scripts/check-liste-commandes.js
//
// Trois questions posees le 2026-09-18 :
//   - Gelato est-il interroge depuis cet ecran ? (il ne l'etait pas)
//   - a quoi sert « Marquer expedie » ? (un vestige d'avant le suivi reel)
//   - comment voir le detail du suivi ? (nulle part depuis cet ecran)
//
// On MONTE reellement l'ecran dans un DOM et on laisse ses effets s'executer.
// Un rendu serveur ne suffirait pas : il n'execute aucun effet, la liste
// resterait sur son ecran de chargement, et « aucun bouton Marquer » serait
// vrai sans rien prouver — premiere version de ce controle, corrigee.

const path = require('path');
const fs = require('fs');
const babel = require('@babel/core');

require.extensions['.css'] = () => {};
require.extensions['.js'] = (module_, filename) => {
  if (filename.includes('node_modules')) {
    return module_._compile(fs.readFileSync(filename, 'utf8'), filename);
  }
  const code = babel.transformFileSync(filename, {
    presets: [require.resolve('babel-preset-react-app')],
    babelrc: false,
    configFile: false
  }).code;
  return module_._compile(code, filename);
};

process.env.NODE_ENV = 'test';
// Le client Supabase est construit au chargement du module et refuse de
// demarrer sans URL. Aucune requete n'est faite ici : des valeurs factices
// suffisent a le laisser se construire.
process.env.REACT_APP_SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL || 'https://exemple.supabase.co';
process.env.REACT_APP_SUPABASE_ANON_KEY = process.env.REACT_APP_SUPABASE_ANON_KEY || 'cle-factice';

const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body><div id="racine"></div></body></html>', { url: 'http://localhost/' });
global.window = dom.window;
global.document = dom.window.document;
global.navigator = dom.window.navigator;
global.IS_REACT_ACT_ENVIRONMENT = true;

const React = require('react');
const { createRoot } = require('react-dom/client');
const { act } = require('react-dom/test-utils');
const { MemoryRouter } = require('react-router-dom');

// On remplace les appels reseau AVANT de charger l'ecran : le module est
// ensuite partage, donc ce sont bien ces versions qu'il utilisera.
const racine = path.join(__dirname, '..');
const ordersApi = require(path.join(racine, 'src/services/ordersApi.js'));

const COMMANDES = [
  { id: 'o-print', book_id: 'b1', book_title: 'Voyage a Montreal', order_number: 'CMD-1', status: 'printed', type: 'print', total_cents: 10800, currency: 'EUR', created_at: '2026-09-17T23:40:31Z' },
  { id: 'o-pdf', book_id: 'b2', book_title: 'Mon livre', order_number: 'CMD-2', status: 'pdf_ready', type: 'pdf', total_cents: 3900, currency: 'EUR', created_at: '2026-09-11T20:10:15Z' },
  { id: 'o-livree', book_id: 'b3', book_title: 'Deja livre', order_number: 'CMD-3', status: 'delivered', type: 'print', total_cents: 10800, currency: 'EUR', created_at: '2026-09-01T10:00:00Z' }
];

const suivisDemandes = [];
ordersApi.listOrders = async () => COMMANDES;
ordersApi.getOrderTracking = async (id) => {
  suivisDemandes.push(id);
  return { status: 'shipped' };
};

const OrdersLuxe = require(path.join(racine, 'src/components/orders/OrdersLuxe.js')).default;

let echecs = 0;
const check = (cond, msg) => { if (!cond) echecs += 1; console.log((cond ? '  OK  ' : ' ECHEC') + ' ' + msg); };

(async () => {
  const conteneur = document.getElementById('racine');
  const root = createRoot(conteneur);

  await act(async () => {
    root.render(React.createElement(MemoryRouter, null, React.createElement(OrdersLuxe)));
  });
  // Laisse les appels de suivi se resoudre.
  await act(async () => { await new Promise((r) => setTimeout(r, 30)); });

  const texte = conteneur.textContent;
  const boutons = [...conteneur.querySelectorAll('button')].map((b) => b.textContent.trim());

  console.log("Ecran « Mes commandes » monte, effets executes\n");
  console.log('  info  boutons affiches : ' + [...new Set(boutons)].join(' | '));
  console.log('');

  // La liste s'est bien affichee : sans ca, tout le reste ne prouverait rien.
  check(texte.includes('CMD-1'), 'les commandes sont affichees (pas l ecran de chargement)');

  check(!/Marquer/i.test(texte), 'plus aucun bouton « Marquer ... » (avance manuelle du statut)');
  check(boutons.includes('Voir le suivi'), 'un lien « Voir le suivi » est propose sur la commande imprimee');
  check(boutons.includes('Supprimer'), 'le bouton Supprimer reste');

  console.log('');
  console.log('  info  imprimeur interroge pour : ' + (suivisDemandes.join(', ') || '(aucune)'));

  check(suivisDemandes.includes('o-print'), 'une commande imprimee en cours est rafraichie depuis Gelato');
  check(!suivisDemandes.includes('o-pdf'), "une commande PDF ne declenche aucun appel — elle n'a rien a imprimer");
  check(!suivisDemandes.includes('o-livree'), 'une commande livree ne declenche aucun appel — plus rien ne bougera');

  // Le statut renvoye par l'imprimeur doit remplacer celui de notre base.
  check(texte.includes('Expedie') || texte.includes('Expédié'), 'le statut affiche devient celui de l imprimeur (expedie)');

  console.log(echecs === 0 ? '\nRESULTAT : OK' : `\nRESULTAT : ${echecs} echec(s)`);
  process.exit(echecs === 0 ? 0 : 1);
})();
