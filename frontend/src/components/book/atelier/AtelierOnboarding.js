import React from 'react';
import { useTranslation } from 'react-i18next';

// Explications de prise en main de l'atelier — affichees par defaut a la
// premiere visite (voir BookAtelierLuxe.js: SEEN_KEY en localStorage,
// jamais reaffiche automatiquement une fois ferme), reouvrables ensuite via
// le bouton "?" du header. Volontairement une carte compacte plutot qu'une
// fenetre modale bloquante : l'atelier reste utilisable derriere.
//
// Reecrites pour la refonte visuelle du 2026-09-26 : "A gauche"/"A droite"
// decrivaient des colonnes fixes qui n'existent plus — la bibliotheque et
// la mise en page vivent desormais dans des tiroirs ouverts a la demande
// (voir AtelierToolsBar.js/AtelierDrawer.js), et le mode automatique n'est
// plus un bouton visible en permanence.
//
// Reecrites a nouveau le meme jour, apres la deuxieme passe de finition
// (retour utilisateur : "mets a jour le contenu de l'aide pour qu'il
// s'adapte a tout ce qu'on a modifie") : la navigation de page est devenue
// tres discrete (‹ N / M ›, plus de gros boutons Couverture/Precedente/
// Suivante/4e) — sans explication, l'acces a la couverture/4e depuis le
// tiroir Pages n'a plus rien d'evident. Nouvelle 5e carte dediee.
const STEPS = [
  { id: 'photos', icon: '🖼️' },
  { id: 'dragDrop', icon: '🖱️' },
  { id: 'layout', icon: '▦' },
  { id: 'navigate', icon: '↔' },
  { id: 'auto', icon: '✨' }
];

function AtelierOnboarding({ onDismiss }) {
  const { t } = useTranslation('atelier');
  return (
    <div className="atelier-onboarding">
      <button type="button" className="atelier-onboarding-close" onClick={onDismiss} aria-label={t('onboarding.close')}>×</button>
      <p className="atelier-onboarding-title">{t('onboarding.title')}</p>
      <div className="atelier-onboarding-steps">
        {STEPS.map((step) => (
          <div key={step.id} className="atelier-onboarding-step">
            <span className="atelier-onboarding-step-icon" aria-hidden="true">{step.icon}</span>
            <div>
              <p className="atelier-onboarding-step-title">{t(`onboarding.steps.${step.id}.title`)}</p>
              <p className="atelier-onboarding-step-text">{t(`onboarding.steps.${step.id}.text`)}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default AtelierOnboarding;
