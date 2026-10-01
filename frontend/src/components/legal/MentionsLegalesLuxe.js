import React from 'react';
import { useTranslation } from 'react-i18next';
import LegalPageLuxe from './LegalPageLuxe';

// Contenu rempli avec ce qui est connu aujourd'hui (hebergeur, contact,
// statut juridique — micro-entreprise, retour utilisateur 2026-09-28) ;
// les champs propres a l'entreprise (SIRET, adresse, nom du dirigeant) ne
// sont pas devinables et restent marques "[À COMPLÉTER]"/"[TO BE COMPLETED]"
// — jamais inventes. Traduction : voir la note de CGVLuxe.js (chantier
// bilingue phase 5, relecture humaine requise avant publication).
export default function MentionsLegalesLuxe() {
  const { t } = useTranslation('legal');
  const sectionKeys = ['s1', 's2', 's3', 's4', 's5'];
  return (
    <LegalPageLuxe
      title={t('mentions.title')}
      updated={t('mentions.updated')}
      sections={sectionKeys.map((key) => {
        const hasList = key === 's1' || key === 's3';
        return {
          heading: t(`mentions.sections.${key}.heading`),
          paragraphs: t(`mentions.sections.${key}.paragraphs`, { returnObjects: true }),
          ...(hasList ? { list: t(`mentions.sections.${key}.list`, { returnObjects: true }) } : {})
        };
      })}
    />
  );
}
