import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import commonFr from '../locales/fr/common.json';
import commonEn from '../locales/en/common.json';

// Chantier bilingue (2026-09-30) : un namespace par grand domaine de l'app
// (mirroring frontend/src/components/<dossier>) plutot qu'un fichier de
// traduction unique et geant, vu le volume de texte a terme (~82 fichiers de
// composants recenses avant ce chantier). Un seul namespace ("common",
// l'en-tete/pied de page commun a toutes les pages) existe pour l'instant ;
// chaque phase suivante ajoute le sien (checkout, atelier, collective,
// legal...) sans jamais toucher a celui-ci.
const resources = {
  fr: { common: commonFr },
  en: { common: commonEn }
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
    ns: ['common'],
    defaultNS: 'common',
    detection: {
      // localStorage d'abord (dernier choix explicite fait sur CE
      // navigateur), puis la langue du navigateur — jamais de detection
      // par sous-domaine ou prefixe d'URL : les URLs du site restent les
      // memes dans les deux langues (voir le plan du chantier).
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'celebrons_language',
      caches: ['localStorage']
    },
    interpolation: {
      escapeValue: false // React echappe deja le HTML lui-meme.
    }
  });

export default i18n;
