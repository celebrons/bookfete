import React from 'react';
import { useTranslation } from 'react-i18next';
import LegalPageLuxe from './LegalPageLuxe';

// Sous-traitants nommes explicitement (retour utilisateur, plan de mise en
// production) : Supabase, Stripe, Gelato, le service d'e-mail (Brevo, corrige
// le 2026-10-02 — le nom d'origine ici etait Resend, jamais reellement
// branche, voir services/email/transactionalEmails.js), et Scaleway.
//
// Durees de conservation (s5, 2026-10-04) : ecrites apres AUDIT du code
// reel (pas devinees) — voir le detail dans les commentaires des cles
// legal.json correspondantes. Deux points (livres/photos abandonnes 12
// mois, photos de commande terminee 12 mois) sont des ENGAGEMENTS de
// politique, pas encore une suppression automatique programmee : seule la
// purge des comptes anonymes (7 jours) et celle des journaux techniques
// (90 jours) tournent reellement sans intervention humaine aujourd'hui.
// Traduction : voir la note de CGVLuxe.js (chantier bilingue phase 5,
// relecture humaine requise avant publication).
export default function ConfidentialiteLuxe() {
  const { t } = useTranslation('legal');
  const sectionKeys = ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8'];
  const listOnlyKeys = new Set(['s2']);
  const withListKeys = new Set(['s4', 's5']);
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
