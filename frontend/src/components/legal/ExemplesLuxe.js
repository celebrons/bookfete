// Page Exemples (plan de mise en production, "des livres reels valent
// mieux que n'importe quel argumentaire") : tant que LIVRES_EXEMPLES est
// vide, elle NE FABRIQUE AUCUN faux temoignage ni fausse photo pour combler
// l'attente — elle dit honnetement que le contenu arrive. Des qu'une vraie
// photo de livre existe, l'ajouter ICI (dans ce tableau, voir la forme d'un
// exemple en commentaire juste en dessous) suffit a faire apparaitre la
// galerie : aucune autre modification de code n'est necessaire.
//
// Forme attendue de chaque entree :
//   {
//     image: '/images/exemples/anniversaire-marie.jpg',  // fichier dans public/
//     captionFr: 'Les 60 ans de Marie — livret, 32 pages',
//     captionEn: "Marie's 60th birthday — booklet, 32 pages"
//   }
import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import '../../styles/luxe-theme.css';
import './ExemplesLuxe.css';

const LIVRES_EXEMPLES = [];

export default function ExemplesLuxe() {
  const { t, i18n } = useTranslation('legal');
  const aDesExemples = LIVRES_EXEMPLES.length > 0;
  const langue = i18n.language === 'en' ? 'en' : 'fr';

  return (
    <div className="exemples-page">
      <div className="container-luxe exemples-inner">
        <span className="label-gold">{t('common.eyebrow')}</span>
        <h1>{t('exemples.title')}</h1>
        <p className="exemples-texte">
          {aDesExemples ? t('exemples.galleryIntro') : t('exemples.text')}
        </p>

        {aDesExemples && (
          <div className="exemples-grille">
            {LIVRES_EXEMPLES.map((livre) => (
              <figure className="exemples-carte" key={livre.image}>
                <img src={livre.image} alt={langue === 'en' ? livre.captionEn : livre.captionFr} loading="lazy" />
                <figcaption>{langue === 'en' ? livre.captionEn : livre.captionFr}</figcaption>
              </figure>
            ))}
          </div>
        )}

        <Link to="/create-book" className="btn btn-primary exemples-cta">{t('exemples.cta')}</Link>
      </div>
    </div>
  );
}
