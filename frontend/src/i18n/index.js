import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import commonFr from '../locales/fr/common.json';
import commonEn from '../locales/en/common.json';
import authFr from '../locales/fr/auth.json';
import authEn from '../locales/en/auth.json';
import homeFr from '../locales/fr/home.json';
import homeEn from '../locales/en/home.json';
import createBookFr from '../locales/fr/createBook.json';
import createBookEn from '../locales/en/createBook.json';
import checkoutFr from '../locales/fr/checkout.json';
import checkoutEn from '../locales/en/checkout.json';
import accountFr from '../locales/fr/account.json';
import accountEn from '../locales/en/account.json';
import atelierFr from '../locales/fr/atelier.json';
import atelierEn from '../locales/en/atelier.json';
import previewFr from '../locales/fr/preview.json';
import previewEn from '../locales/en/preview.json';
import dashboardFr from '../locales/fr/dashboard.json';
import dashboardEn from '../locales/en/dashboard.json';
import collectiveFr from '../locales/fr/collective.json';
import collectiveEn from '../locales/en/collective.json';
import legalFr from '../locales/fr/legal.json';
import legalEn from '../locales/en/legal.json';

// Chantier bilingue (2026-09-30) : un namespace par grand domaine de l'app
// (mirroring frontend/src/components/<dossier>) plutot qu'un fichier de
// traduction unique et geant, vu le volume de texte a terme (~82 fichiers de
// composants recenses avant ce chantier). Un seul namespace ("common",
// l'en-tete/pied de page commun a toutes les pages) existe pour l'instant ;
// chaque phase suivante ajoute le sien (checkout, atelier, collective,
// legal...) sans jamais toucher a celui-ci.
const resources = {
  fr: { common: commonFr, auth: authFr, home: homeFr, createBook: createBookFr, checkout: checkoutFr, account: accountFr, atelier: atelierFr, preview: previewFr, dashboard: dashboardFr, collective: collectiveFr, legal: legalFr },
  en: { common: commonEn, auth: authEn, home: homeEn, createBook: createBookEn, checkout: checkoutEn, account: accountEn, atelier: atelierEn, preview: previewEn, dashboard: dashboardEn, collective: collectiveEn, legal: legalEn }
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'fr',
    supportedLngs: ['fr', 'en'],
    // 'fr-FR'/'fr-CA' du navigateur doivent resoudre vers la ressource
    // 'fr' (on n'a qu'une seule variante de chaque langue) — meme raison
    // pour 'en-US'/'en-GB'.
    nonExplicitSupportedLngs: true,
    load: 'languageOnly',
    ns: ['common', 'auth', 'home', 'createBook', 'checkout', 'account', 'atelier', 'preview', 'dashboard', 'collective', 'legal'],
    defaultNS: 'common',
    detection: {
      // localStorage d'abord (dernier choix explicite fait sur CE
      // navigateur), puis la langue du navigateur — jamais de detection
      // par sous-domaine ou prefixe d'URL : les URLs du site restent les
      // memes dans les deux langues (voir le plan du chantier).
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'bookipix_language',
      caches: ['localStorage']
    },
    interpolation: {
      escapeValue: false // React echappe deja le HTML lui-meme.
    }
  });

export default i18n;
