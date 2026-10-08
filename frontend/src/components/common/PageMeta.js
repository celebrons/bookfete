// Titre et description par page (2026-10-08) : une appli React ne sert
// qu'UN SEUL index.html, donc UN SEUL <title>/<meta description> pour
// TOUTES les routes — /tarifs, /exemples, /how-it-works affichaient tous
// le meme titre generique que la page d'accueil, aussi bien dans l'onglet
// du navigateur que dans un resultat Google. Seules les pages PUBLIQUES et
// reellement indexables (voir public/robots.txt — jamais /dashboard,
// /book/:id, /account...) figurent ici ; une route absente de cette table
// garde le titre par defaut d'index.html, comportement inchange.
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const SUFFIXE = ' – Bookipix';
const DESCRIPTION_DEFAUT = "Bookipix : créez un album photo collaboratif ou un livre souvenir avec vos proches, puis commandez-le imprimé en quelques clics.";

const PAGES = {
  '/how-it-works': {
    title: `Comment ça marche${SUFFIXE}`,
    description: "Découvrez comment créer votre album photo collaboratif ou votre livre souvenir avec Bookipix, de l'ajout des photos jusqu'à la réception du livre imprimé."
  },
  '/tarifs': {
    title: `Tarifs${SUFFIXE}`,
    description: 'Les tarifs Bookipix pour votre album photo collaboratif ou votre livre souvenir imprimé : formats Livret, Standard et Luxe, prix à la page.'
  },
  '/exemples': {
    title: `Exemples de livres${SUFFIXE}`,
    description: 'Des exemples de livres photo et albums collaboratifs créés avec Bookipix, pour vous inspirer avant de commencer le vôtre.'
  },
  '/login': { title: `Connexion${SUFFIXE}`, description: DESCRIPTION_DEFAUT },
  '/register': { title: `Créer un compte${SUFFIXE}`, description: DESCRIPTION_DEFAUT },
  '/mentions-legales': { title: `Mentions légales${SUFFIXE}`, description: DESCRIPTION_DEFAUT },
  '/cgv': { title: `Conditions générales de vente${SUFFIXE}`, description: DESCRIPTION_DEFAUT },
  '/confidentialite': { title: `Politique de confidentialité${SUFFIXE}`, description: DESCRIPTION_DEFAUT }
};

const TITRE_DEFAUT = document.title;
const DESCRIPTION_META = document.querySelector('meta[name="description"]');
const DESCRIPTION_PAR_DEFAUT_INITIALE = DESCRIPTION_META?.getAttribute('content') || DESCRIPTION_DEFAUT;

const PageMeta = () => {
  const { pathname } = useLocation();

  useEffect(() => {
    const page = PAGES[pathname];
    document.title = page?.title || TITRE_DEFAUT;
    if (DESCRIPTION_META) {
      DESCRIPTION_META.setAttribute('content', page?.description || DESCRIPTION_PAR_DEFAUT_INITIALE);
    }
  }, [pathname]);

  return null;
};

export default PageMeta;
