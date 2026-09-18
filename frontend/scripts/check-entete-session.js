// L'en-tete dit-il QUI est connecte ?
//
//   node scripts/check-entete-session.js
//
// Demande du 2026-09-18 : « il faut une indication pour savoir qui est
// connecte, a cote du bouton deconnexion ». Rien ne distinguait deux comptes
// a l'ecran — genant des qu'on teste avec plusieurs adresses.
//
// Trois etats comptent : connecte avec un compte, connecte SANS compte (une
// session anonyme, que l'application autorise pour composer avant de
// s'inscrire), et deconnecte.
//
// On MONTE l'en-tete dans un DOM et on lit ce qui sort. Un rendu serveur ne
// suffirait pas : il n'execute aucun effet, donc l'utilisateur ne serait
// jamais charge et les trois cas se ressembleraient.

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
process.env.REACT_APP_SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL || 'https://exemple.supabase.co';
process.env.REACT_APP_SUPABASE_ANON_KEY = process.env.REACT_APP_SUPABASE_ANON_KEY || 'cle-factice';

const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body><div id="racine"></div></body></html>', { url: 'http://localhost/' });
global.window = dom.window;
global.document = dom.window.document;
global.navigator = dom.window.navigator;
global.IS_REACT_ACT_ENVIRONMENT = true;

// jsdom ne fournit pas matchMedia, dont l en-tete se sert pour decider s il
// passe en mode compact. On le simule en mode large : c est la disposition
// ou l indication de session doit tenir a cote du bouton.
global.window.matchMedia = (requete) => ({
  matches: false,
  media: requete,
  addEventListener() {},
  removeEventListener() {},
  addListener() {},
  removeListener() {}
});

const React = require('react');
const { createRoot } = require('react-dom/client');
const { act } = require('react-dom/test-utils');
const { MemoryRouter } = require('react-router-dom');

const racine = path.join(__dirname, '..');

// On remplace l'authentification AVANT de charger l'en-tete.
const supabaseModule = require(path.join(racine, 'src/services/supabaseClient.js'));
let utilisateurCourant = null;
supabaseModule.supabase.auth.getUser = async () => ({ data: { user: utilisateurCourant } });
supabaseModule.supabase.auth.onAuthStateChange = () => ({ data: { subscription: { unsubscribe() {} } } });

// L'appel qui demande au serveur si l'utilisateur est administrateur ne doit
// pas partir sur le reseau pendant ce controle.
const adminApi = require(path.join(racine, 'src/services/adminApi.js'));
adminApi.checkIsAdmin = async () => false;

const HeaderLuxe = require(path.join(racine, 'src/components/layout/HeaderLuxe.js')).default;

let echecs = 0;
const check = (cond, msg) => { if (!cond) echecs += 1; console.log((cond ? '  OK  ' : ' ECHEC') + ' ' + msg); };

const rendre = async (utilisateur) => {
  utilisateurCourant = utilisateur;
  const conteneur = document.getElementById('racine');
  conteneur.innerHTML = '';
  const root = createRoot(conteneur);
  await act(async () => {
    root.render(React.createElement(MemoryRouter, null, React.createElement(HeaderLuxe)));
  });
  await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
  return conteneur;
};

(async () => {
  console.log('Cas 1 — connecte avec un compte\n');
  let el = await rendre({ id: 'u1', email: 'marie.dupont@exemple.fr' });
  let texte = el.textContent;
  check(texte.includes('marie.dupont@exemple.fr'), "l'adresse du compte connecte est affichee");
  check(texte.includes('Déconnexion'), 'le bouton Deconnexion est toujours la');
  check(Boolean(el.querySelector('.site-nav-user')), "l'indication a sa propre place dans la barre");

  console.log('\nCas 2 — connecte SANS compte (session anonyme)\n');
  el = await rendre({ id: 'u2', email: null, is_anonymous: true });
  texte = el.textContent;
  check(texte.includes('Sans compte'), "l'etat « sans compte » est dit clairement");
  check(
    Boolean(el.querySelector('.site-nav-user.is-anonyme')),
    'il se distingue visuellement d un compte ordinaire'
  );

  console.log('\nCas 3 — deconnecte\n');
  el = await rendre(null);
  texte = el.textContent;
  check(!el.querySelector('.site-nav-user'), "aucune indication de session quand personne n'est connecte");
  check(texte.includes('Connexion'), 'le bouton Connexion est propose a la place');

  console.log(echecs === 0 ? '\nRESULTAT : OK' : `\nRESULTAT : ${echecs} echec(s)`);
  process.exit(echecs === 0 ? 0 : 1);
})();
