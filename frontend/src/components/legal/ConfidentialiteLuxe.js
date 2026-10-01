import React from 'react';
import { useTranslation } from 'react-i18next';
import LegalPageLuxe from './LegalPageLuxe';

// Sous-traitants nommes explicitement (retour utilisateur, plan de mise en
// production) : Supabase, Stripe, Gelato, le service d'e-mail (Resend), et
// Scaleway. Duree de conservation encore ouverte ailleurs dans le plan
// (point "conservation") : marquee A COMPLETER plutot que devinee.
// Traduction : voir la note de CGVLuxe.js (chantier bilingue phase 5,
// relecture humaine requise avant publication).
export default function ConfidentialiteLuxe() {
  const { t } = useTranslation('legal');
  const sectionKeys = ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8'];
  const listOnlyKeys = new Set(['s2']);
  const withListKeys = new Set(['s4']);
  return (
    <LegalPageLuxe
      title={t('confidentialite.title')}
      updated={t('confidentialite.updated')}
      intro={t('confidentialite.intro')}
      sections={sectionKeys.map((key) => ({
        heading: t(`confidentialite.sections.${key}.heading`),
        ...(listOnlyKeys.has(key) ? {} : { paragraphs: t(`confidentialite.sections.${key}.paragraphs`, { returnObjects: true }) }),
        ...(listOnlyKeys.has(key) || withListKeys.has(key) ? { list: t(`confidentialite.sections.${key}.list`, { returnObjects: true }) } : {})
      }))}
    />
  );
}
