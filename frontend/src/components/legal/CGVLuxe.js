import React from 'react';
import { useTranslation } from 'react-i18next';
import LegalPageLuxe from './LegalPageLuxe';

// L'exclusion du droit de retractation (art. L221-28 3°) est le coeur de
// ce document : elle n'est opposable que si elle est ECRITE et ACCEPTEE
// AVANT le paiement (retour utilisateur, plan de mise en production) — la
// case a cocher a l'etape paiement (StepPayment.js) fournit cette preuve.
//
// Traduction livree au chantier bilingue phase 5 (2026-10-01) — CONTENU DE
// CONFORMITE, a faire relire par un anglophone avant toute publication
// reelle (voir le plan du chantier) : ceci est une traduction automatisee,
// pas une revue juridique.
export default function CGVLuxe() {
  const { t } = useTranslation('legal');
  const sectionKeys = ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9', 's10', 's11'];
  return (
    <LegalPageLuxe
      title={t('cgv.title')}
      updated={t('cgv.updated')}
      intro={t('cgv.intro')}
      sections={sectionKeys.map((key) => ({
        heading: t(`cgv.sections.${key}.heading`),
        paragraphs: t(`cgv.sections.${key}.paragraphs`, { returnObjects: true })
      }))}
    />
  );
}
