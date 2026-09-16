import React from 'react';

// Barre de progression d'une fabrication longue (plusieurs minutes).
//
// Extraite de StepTracking le 2026-09-15 : la generation du PDF client et
// l'envoi de test a l'imprimeur font le MEME travail (rendre chaque page en
// haute resolution) et publient desormais la meme forme de progression
// — { phase, done, total, updatedAt }. Deux barres distinctes auraient
// diverge au premier ajustement.

// Libelle de chaque phase. Le rendu des pages est de loin la plus longue :
// c'est la seule qui a une progression chiffree, les autres sont annoncees
// pour que la barre ne reste jamais figee sans explication.
const PROGRESS_LABELS = {
  starting: 'Preparation...',
  cover: 'Rendu de la couverture...',
  pages: 'Rendu des pages',
  assembling: 'Assemblage du PDF...',
  uploading: 'Envoi du fichier a l\'imprimeur...',
  submitting: 'Creation de la commande chez Gelato...'
};

function GenerationProgress({ progress, label }) {
  // Premier point de mesure de la phase "pages", garde d'un rendu a
  // l'autre. Il sert a deduire la CADENCE REELLE de la machine qui rend le
  // livre : elle n'a rien a voir en local et sur Render (CPU bien plus
  // lent), une constante en dur donnerait une promesse fausse la moitie du
  // temps. Les horodatages viennent du serveur (progress.updatedAt), pas de
  // l'horloge du navigateur : l'estimation reste juste meme si une reponse
  // de sondage arrive en retard.
  const paceRef = React.useRef(null);

  const phase = progress?.phase;
  const done = progress?.done || 0;
  const total = progress?.total || 0;
  const updatedAtMs = progress?.updatedAt ? Date.parse(progress.updatedAt) : NaN;

  if (phase === 'pages' && done > 0 && !paceRef.current && !Number.isNaN(updatedAtMs)) {
    paceRef.current = { done, at: updatedAtMs };
  }

  if (!progress) return null;

  const hasCount = phase === 'pages' && total > 0;
  // Pourcentage REEL quand on le connait (pages rendues / total). Pour les
  // phases sans decompte, on n'invente pas de chiffre : barre indeterminee.
  const percent = hasCount ? Math.round((done / total) * 100) : null;

  // Duree restante : affichee seulement une fois qu'on a DEUX points de
  // mesure. Avant ca, le decompte "x / y pages" suffit — mieux vaut ne rien
  // annoncer qu'annoncer n'importe quoi.
  const pace = paceRef.current;
  let remainingLabel = null;
  if (hasCount && pace && done > pace.done && !Number.isNaN(updatedAtMs)) {
    const secondsPerPage = (updatedAtMs - pace.at) / 1000 / (done - pace.done);
    if (secondsPerPage > 0) {
      const remainingMin = Math.round(((total - done) * secondsPerPage) / 60);
      remainingLabel = remainingMin >= 1
        ? `Environ ${remainingMin} min restantes.`
        : 'Plus que quelques secondes.';
    }
  }

  return (
    <div className="gelato-progress">
      <div className="gelato-progress-head">
        <span>{PROGRESS_LABELS[phase] || label || 'Generation en cours...'}</span>
        {hasCount && <span className="gelato-progress-count">{done} / {total} pages</span>}
      </div>
      <div className={`gelato-progress-bar ${percent === null ? 'is-indeterminate' : ''}`}>
        <div
          className="gelato-progress-fill"
          style={percent === null ? undefined : { width: `${percent}%` }}
        />
      </div>
      {remainingLabel && <p className="gelato-progress-note">{remainingLabel}</p>}
    </div>
  );
}

export default GenerationProgress;
