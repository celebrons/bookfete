// Page Exemples (plan de mise en production, "des livres reels valent
// mieux que n'importe quel argumentaire") : tant que LIVRES_EXEMPLES est
// vide, elle NE FABRIQUE AUCUN faux temoignage ni fausse photo PRESENTEE
// COMME VENANT D'UN VRAI CLIENT. Des qu'une vraie photo de livre existe,
// l'ajouter ICI (dans ce tableau) suffit a faire apparaitre la galerie :
// aucune autre modification de code n'est necessaire.
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

// MAQUETTES DE FORMAT (2026-10-04, v2 — demande explicite : "montrer des
// apercus des 3 formats EN VRAI, dimensions, couverture, dispositions
// possibles a l'interieur, pour que l'acheteur visualise reellement le
// livre"). Dimensions, type de couverture et couleurs d'accent REPRIS A
// L'IDENTIQUE de backend/services/composition/coverFormat.js (COVER_FORMATS)
// et coverTheme.js (applyFormatAccent) — jamais invente. Les photos sont
// des photos libres de droit (Picsum/Unsplash, voir public/images/
// exemples-stock/), choisies pour illustrer la MECANIQUE des dispositions
// reelles du moteur de mise en page (voir DISPOSITIONS ci-dessous, memes
// slugs que sql/phase08_layout_engine_v2.sql), jamais presentees comme un
// vrai livre d'un vrai client — contrairement a la v1 (maquettes
// abstraites), cette version montre une vraie apparence, avec de vraies
// proportions, parce que c'est ce qui permet VRAIMENT de visualiser le
// livre.
const STOCK = (nom) => `/images/exemples-stock/${nom}.jpg`;

// Dispositions reelles du moteur (layoutEngine/sql phase08) : FULL_PHOTO,
// TWO_PHOTOS, PHOTO_TEXT, FOUR_PHOTOS sont les slugs exacts.
const DISPOSITIONS = {
  FULL_PHOTO: { type: 'full' },
  TWO_PHOTOS: { type: 'duo' },
  PHOTO_TEXT: { type: 'phototext' },
  FOUR_PHOTOS: { type: 'grid4' }
};

const TEXTE_EXEMPLE_FR = 'Un bel après-midi, tous ensemble.';
const TEXTE_EXEMPLE_EN = 'A lovely afternoon, all together.';

// Les 3 VRAIS formats. trimWidthMm/trimHeightMm/accent/bg : copies de
// COVER_FORMATS et applyFormatAccent (backend). couverture : vrai type
// Gelato (soft-cover-photobooks / hard-cover-photobooks).
const FORMATS = [
  {
    id: 'livret',
    nomFr: 'Livret', nomEn: 'Booklet',
    trimWidthMm: 200, trimHeightMm: 200,
    couvertureFr: 'couverture souple', couvertureEn: 'soft cover',
    bg: '#fffdf8', accent: '#8f8a7c', ornement: false,
    pagesExemple: 32,
    spreads: [
      { disposition: 'FULL_PHOTO', photos: [STOCK('carre1')] },
      { disposition: 'TWO_PHOTOS', photos: [STOCK('carre2'), STOCK('plage1')] },
      { disposition: 'PHOTO_TEXT', photos: [STOCK('montagne1')] }
    ]
  },
  {
    id: 'standard',
    nomFr: 'Standard', nomEn: 'Standard',
    trimWidthMm: 210, trimHeightMm: 280,
    couvertureFr: 'couverture souple', couvertureEn: 'soft cover',
    bg: '#f4f0e6', accent: '#c9a35f', ornement: false,
    pagesExemple: 44,
    spreads: [
      { disposition: 'TWO_PHOTOS', photos: [STOCK('foret1'), STOCK('lac1')] },
      { disposition: 'FOUR_PHOTOS', photos: [STOCK('ville1'), STOCK('fete1'), STOCK('famille1'), STOCK('automne1')] },
      { disposition: 'FULL_PHOTO', photos: [STOCK('chemin1')] }
    ]
  },
  {
    id: 'luxe',
    nomFr: 'Luxe', nomEn: 'Luxe',
    trimWidthMm: 210, trimHeightMm: 280,
    couvertureFr: 'couverture rigide', couvertureEn: 'hard cover',
    bg: '#ede6d6', accent: '#c19a3d', ornement: true,
    pagesExemple: 50,
    spreads: [
      { disposition: 'FULL_PHOTO', photos: [STOCK('nature1')] },
      { disposition: 'PHOTO_TEXT', photos: [STOCK('voyage1')] },
      { disposition: 'TWO_PHOTOS', photos: [STOCK('voyage2'), STOCK('jardin1')] }
    ]
  }
];

function Spread({ spread, langue, ratio }) {
  const { type } = DISPOSITIONS[spread.disposition];
  const texte = langue === 'en' ? TEXTE_EXEMPLE_EN : TEXTE_EXEMPLE_FR;
  const style = { aspectRatio: ratio };

  if (type === 'full') {
    return (
      <div className="exemples-spread exemples-spread-full" style={style}>
        <img src={spread.photos[0]} alt="" loading="lazy" />
      </div>
    );
  }
  if (type === 'duo') {
    return (
      <div className="exemples-spread exemples-spread-duo" style={style}>
        <img src={spread.photos[0]} alt="" loading="lazy" />
        <img src={spread.photos[1]} alt="" loading="lazy" />
      </div>
    );
  }
  if (type === 'grid4') {
    return (
      <div className="exemples-spread exemples-spread-grid4" style={style}>
        {spread.photos.map((src) => <img key={src} src={src} alt="" loading="lazy" />)}
      </div>
    );
  }
  // phototext
  return (
    <div className="exemples-spread exemples-spread-phototext" style={style}>
      <img src={spread.photos[0]} alt="" loading="lazy" />
      <div className="exemples-spread-texte">
        <span className="exemples-spread-ligne" />
        <span className="exemples-spread-ligne" />
        <span className="exemples-spread-citation">{texte}</span>
      </div>
    </div>
  );
}

function FormatCard({ format, langue, t }) {
  const nom = langue === 'en' ? format.nomEn : format.nomFr;
  const couverture = langue === 'en' ? format.couvertureEn : format.couvertureFr;
  const ratio = `${format.trimWidthMm} / ${format.trimHeightMm}`;
  const spreadRatio = `${format.trimWidthMm * 2} / ${format.trimHeightMm}`;
  const dims = `${format.trimWidthMm / 10} × ${format.trimHeightMm / 10} cm`;
  const coverPhoto = format.spreads[0].photos[0];

  return (
    <article className={`exemples-format${format.ornement ? ' is-luxe' : ''}`}>
      <div
        className="exemples-cover"
        style={{ aspectRatio: ratio, background: format.bg }}
      >
        <img className="exemples-cover-photo" src={coverPhoto} alt="" loading="lazy" />
        <div className="exemples-cover-overlay" style={{ borderColor: format.accent }}>
          <span className="exemples-cover-titre" style={{ color: format.accent }}>
            {t('exemples.coverSampleTitle')}
          </span>
        </div>
      </div>

      <div className="exemples-format-meta">
        <h2>{nom}</h2>
        <p>{dims} · {couverture} · {t('exemples.pagesExample', { count: format.pagesExemple })}</p>
      </div>

      <div className="exemples-spreads">
        {format.spreads.map((spread, index) => (
          <Spread key={index} spread={spread} langue={langue} ratio={spreadRatio} />
        ))}
      </div>
    </article>
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
          {aDesExemples ? t('exemples.galleryIntro') : t('exemples.formatsIntro')}
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
          <div className="exemples-formats">
            {FORMATS.map((format) => (
              <FormatCard key={format.id} format={format} langue={langue} t={t} />
            ))}
          </div>
        )}

        {!aDesExemples && (
          <p className="exemples-disclaimer">{t('exemples.photosDisclaimer')}</p>
        )}

        <Link to="/create-book" className="btn btn-primary exemples-cta">{t('exemples.cta')}</Link>
      </div>
    </div>
  );
}
