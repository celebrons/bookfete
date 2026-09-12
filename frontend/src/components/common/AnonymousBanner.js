import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { isCurrentlyAnonymous } from '../../services/anonymousSession';
import './AnonymousBanner.css';

// Bandeau affiche tant que le visiteur travaille SANS COMPTE (session
// anonyme, voir services/anonymousSession.js).
//
// Il dit deux choses, et rien de plus : le travail est bien enregistre, mais
// il est lie a CE navigateur. C'est la seule vraie limite du demarrage sans
// compte — effacer ses cookies ou changer d'appareil fait tout perdre — et
// la taire serait une mauvaise surprise au pire moment.
//
// Volontairement PAS une modale ni un blocage : le principe du parcours est
// justement de ne rien exiger avant que la valeur soit visible. Le compte
// est demande au moment de commander (garde serveur dans routes/orders.js).
function AnonymousBanner({ compact = false }) {
  const [anonymous, setAnonymous] = useState(false);

  useEffect(() => {
    let cancelled = false;
    isCurrentlyAnonymous().then((value) => {
      if (!cancelled) setAnonymous(value);
    });
    return () => { cancelled = true; };
  }, []);

  if (!anonymous) return null;

  return (
    <div className={`anon-banner ${compact ? 'is-compact' : ''}`} role="status">
      <span className="anon-banner-text">
        <strong>Votre livre est enregistré</strong> — mais il n'existe que sur cet appareil.
        Créez votre compte pour le retrouver partout et le commander.
      </span>
      <Link className="anon-banner-action" to="/register">Créer mon compte</Link>
    </div>
  );
}

export default AnonymousBanner;
