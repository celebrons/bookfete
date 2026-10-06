// Suivi de trafic minimal (2026-10-06) : une ligne par page vue, sans cookie
// ni identifiant (voir backend/sql/phase28_page_views.sql pour le choix).
// Meme structure que ScrollToTop, un composant = une seule responsabilite.
import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

const PageViewTracker = () => {
  const { pathname } = useLocation();
  // Le referrer n'a de sens qu'a la toute premiere page vue d'une session de
  // navigation (d'ou vient le visiteur) : les navigations internes
  // suivantes auraient pour "referrer" la page precedente DU MEME site, une
  // information deja portee par la succession des `path` eux-memes.
  const premierePage = useRef(true);

  useEffect(() => {
    const referrer = premierePage.current ? document.referrer || null : null;
    premierePage.current = false;

    // Jamais bloquant, jamais d'erreur remontee a l'utilisateur : une visite
    // non comptee n'est jamais un probleme pour qui visite le site.
    fetch('/api/analytics/pageview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: pathname, referrer })
    }).catch(() => {});
  }, [pathname]);

  return null;
};

export default PageViewTracker;
