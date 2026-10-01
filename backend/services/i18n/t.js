// backend/services/i18n/t.js
//
// Traduction au point d'appel, pas un dictionnaire separe : vu le volume
// (~160 messages d'erreur disperses dans routes/controllers/middleware,
// chantier bilingue phase 6), extraire chaque chaine vers une cle dans un
// fichier a part aurait impose un aller-retour permanent entre le code et
// le dictionnaire, pour un total qui reste largement en dessous de la
// taille ou cet aller-retour se justifie (contrairement au frontend, voir
// src/locales/, qui en a des centaines par domaine).
//
// t(req, fr, en) renvoie la version francaise ou anglaise selon la langue
// resolue pour CETTE requete (voir resolveLanguage.js) — le francais reste
// la source de verite lue dans le code, l'anglais vient juste a cote.
const { resolveLanguage } = require('./resolveLanguage');

function t(req, fr, en) {
  return resolveLanguage(req) === 'en' ? en : fr;
}

module.exports = { t };
