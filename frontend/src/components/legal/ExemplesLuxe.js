// Placeholder assume : aucune vraie photo de livre Bookipix n'est
// disponible aujourd'hui (retour utilisateur, plan de mise en production —
// "des livres reels valent mieux que n'importe quel argumentaire"). Cette
// page NE FABRIQUE AUCUN faux temoignage ni fausse photo pour combler
// l'attente : elle dit honnetement que le contenu arrive, et reste prete a
// accueillir de vraies photos des qu'elles existeront.
import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import '../../styles/luxe-theme.css';
import './ExemplesLuxe.css';

export default function ExemplesLuxe() {
  const { t } = useTranslation('legal');
  return (
    <div className="exemples-page">
      <div className="container-luxe exemples-inner">
        <span className="label-gold">{t('common.eyebrow')}</span>
        <h1>{t('exemples.title')}</h1>
        <p className="exemples-texte">
          {t('exemples.text')}
        </p>
        <Link to="/create-book" className="btn btn-primary exemples-cta">{t('exemples.cta')}</Link>
      </div>
    </div>
  );
}
