// Page Exemples (plan de mise en production, "des livres reels valent
// mieux que n'importe quel argumentaire") : tant que LIVRES_EXEMPLES est
// vide, elle NE FABRIQUE AUCUN faux temoignage ni fausse photo pour combler
// l'attente. Des qu'une vraie photo de livre existe, l'ajouter ICI (dans ce
// tableau, voir la forme d'un exemple en commentaire juste en dessous)
// suffit a faire apparaitre la galerie : aucune autre modification de code
// n'est necessaire.
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

// MAQUETTES ILLUSTRATIVES (2026-10-04, demande explicite "remplis la en
// inventant des exemples qui collent avec le site") — en l'absence de
// vraies photos, le choix a ete de montrer honnetement des SCENARIOS
// inventes avec les 3 VRAIS styles du produit (memes slugs/couleurs que
// services/composition/coverTheme.js), plutot que de fausses photos ou de
// faux temoignages clients attribues a des gens qui n'existent pas — la
// meme raison que le retrait des statistiques fictives ("10k+ livres
// crees") le meme jour. Chaque carte affiche un disclaimer explicite
// (exemples.mockupDisclaimer) : aucune confusion possible avec un vrai
// livre ou un vrai client.
const MAQUETTES_ILLUSTRATIVES = [
  {
    id: 'anniversaire-60',
    theme: 'elegance',
    format: 'standard',
    pages: 32,
    eventFr: 'Anniversaire — 60 ans',
    eventEn: '60th birthday',
    blocs: [1.4, 0.8, 1, 0.6]
  },
  {
    id: 'mariage',
    theme: 'elegance',
    format: 'luxe',
    pages: 48,
    eventFr: 'Mariage',
    eventEn: 'Wedding',
    blocs: [1, 1, 1.6, 0.7]
  },
  {
    id: 'naissance',
    theme: 'editorial',
    format: 'livret',
    pages: 24,
    eventFr: 'Naissance',
    eventEn: 'New baby',
    blocs: [0.9, 1.3, 0.9]
  },
  {
    id: 'voyage',
    theme: 'minimal',
    format: 'standard',
    pages: 36,
    eventFr: 'Voyage en famille',
    eventEn: 'Family trip',
    blocs: [1, 1, 1, 1]
  },
  {
    id: 'retraite',
    theme: 'editorial',
    format: 'standard',
    pages: 28,
    eventFr: 'Départ à la retraite',
    eventEn: 'Retirement',
    blocs: [1.5, 0.7, 0.9]
  },
  {
    id: 'collectif',
    theme: 'elegance',
    format: 'luxe',
    pages: 40,
    eventFr: 'Projet collectif entre amis',
    eventEn: 'Group project with friends',
    blocs: [0.8, 0.8, 0.8, 1.2]
  }
];

const FORMAT_LABELS = {
  fr: { livret: 'Livret', standard: 'Standard', luxe: 'Luxe' },
  en: { livret: 'Booklet', standard: 'Standard', luxe: 'Luxe' }
};

const STYLE_LABELS = {
  fr: { elegance: 'Élégance', editorial: 'Éditorial', minimal: 'Minimaliste' },
  en: { elegance: 'Elegance', editorial: 'Editorial', minimal: 'Minimal' }
};

function MaquetteCarte({ maquette, langue, disclaimer }) {
  const evenement = langue === 'en' ? maquette.eventEn : maquette.eventFr;
  const formatLabel = FORMAT_LABELS[langue][maquette.format];
  const styleLabel = STYLE_LABELS[langue][maquette.theme];
  const pagesLabel = langue === 'en' ? `${maquette.pages} pages` : `${maquette.pages} pages`;

  return (
    <figure className={`exemples-maquette theme-${maquette.theme}`}>
      <div className="exemples-maquette-spread" aria-hidden="true">
        {maquette.blocs.map((flex, index) => (
          <span key={index} className="exemples-maquette-bloc" style={{ flexGrow: flex }} />
        ))}
      </div>
      <figcaption>
        <span className="exemples-maquette-event">{evenement}</span>
        <span className="exemples-maquette-meta">{styleLabel} · {formatLabel} · {pagesLabel}</span>
        <span className="exemples-maquette-disclaimer">{disclaimer}</span>
      </figcaption>
    </figure>
  );
}

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
          {aDesExemples ? t('exemples.galleryIntro') : t('exemples.mockupIntro')}
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

        {!aDesExemples && (
          <div className="exemples-grille exemples-grille-maquettes">
            {MAQUETTES_ILLUSTRATIVES.map((maquette) => (
              <MaquetteCarte
                key={maquette.id}
                maquette={maquette}
                langue={langue}
                disclaimer={t('exemples.mockupDisclaimer')}
              />
            ))}
          </div>
        )}

        <Link to="/create-book" className="btn btn-primary exemples-cta">{t('exemples.cta')}</Link>
      </div>
    </div>
  );
}
