// C:\Users\USER\bookfete\frontend\src\components\common\ScrollToTop.js
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const ScrollToTop = () => {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    // Un lien avec ancre (ex. le "FAQ" du pied de page vers
    // /how-it-works#faq) doit amener JUSQU'A cette section — ce
    // composant remontait systematiquement en haut de page juste apres,
    // quelle que soit l'ancre demandee, puisqu'il ne regardait que
    // `pathname`. On cible l'element de l'ancre s'il existe ; sinon,
    // comportement inchange (haut de page).
    if (hash) {
      const cible = document.getElementById(hash.slice(1));
      if (cible) {
        cible.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
    }

    window.scrollTo({
      top: 0,
      left: 0,
      behavior: 'smooth'
    });
  }, [pathname, hash]);

  return null;
};

export default ScrollToTop;