// Placeholder assume : aucune vraie photo de livre Celebrons n'est
// disponible aujourd'hui (retour utilisateur, plan de mise en production —
// "des livres reels valent mieux que n'importe quel argumentaire"). Cette
// page NE FABRIQUE AUCUN faux temoignage ni fausse photo pour combler
// l'attente : elle dit honnetement que le contenu arrive, et reste prete a
// accueillir de vraies photos des qu'elles existeront.
import React from 'react';
import { Link } from 'react-router-dom';
import '../../styles/luxe-theme.css';
import './ExemplesLuxe.css';

export default function ExemplesLuxe() {
  return (
    <div className="exemples-page">
      <div className="container-luxe exemples-inner">
        <span className="label-gold">CÉLÉBRONS</span>
        <h1>Exemples de livres</h1>
        <p className="exemples-texte">
          Nous préparons une sélection de vrais livres Célébrons à vous montrer très prochainement —
          anniversaires, mariages, départs, projets collectifs. En attendant, la meilleure façon de
          voir ce que donne votre livre est de commencer le vôtre : l'aperçu se met à jour en direct,
          à l'échelle réelle, pendant toute la composition.
        </p>
        <Link to="/create-book" className="btn btn-primary exemples-cta">Créer mon livre</Link>
      </div>
    </div>
  );
}
