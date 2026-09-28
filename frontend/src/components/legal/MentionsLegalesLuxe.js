import React from 'react';
import LegalPageLuxe from './LegalPageLuxe';

// Contenu rempli avec ce qui est connu aujourd'hui (hebergeur, contact,
// statut juridique — micro-entreprise, retour utilisateur 2026-09-28) ;
// les champs propres a l'entreprise (SIRET, adresse, nom du dirigeant) ne
// sont pas devinables et restent marques "[À COMPLÉTER]" — jamais inventes.
export default function MentionsLegalesLuxe() {
  return (
    <LegalPageLuxe
      title="Mentions légales"
      updated="28 septembre 2026"
      sections={[
        {
          heading: 'Éditeur du site',
          paragraphs: [
            'Le site Célébrons (celebrons.com) est édité par [À COMPLÉTER : nom et prénom du dirigeant], exerçant sous le statut de micro-entreprise.',
          ],
          list: [
            'SIRET : [À COMPLÉTER]',
            'Adresse du siège : [À COMPLÉTER]',
            'Contact : bonjour@celebrons.com'
          ]
        },
        {
          heading: 'Directeur de la publication',
          paragraphs: [
            '[À COMPLÉTER : nom et prénom du dirigeant].'
          ]
        },
        {
          heading: 'Hébergement',
          paragraphs: [
            "Le site et les données sont hébergés par :"
          ],
          list: [
            'Scaleway SAS',
            "8 rue de la Ville l'Évêque, 75008 Paris, France",
            'https://www.scaleway.com'
          ]
        },
        {
          heading: 'Propriété intellectuelle',
          paragraphs: [
            "L'ensemble des éléments du site Célébrons (textes, mises en page, moteur de composition, identité visuelle) est protégé par le droit de la propriété intellectuelle. Les photos et textes que vous déposez dans votre livre restent votre propriété : vous nous accordez uniquement le droit de les traiter techniquement pour composer et imprimer votre livre."
          ]
        },
        {
          heading: 'Données personnelles',
          paragraphs: [
            'Le traitement de vos données personnelles est décrit dans notre politique de confidentialité, accessible depuis le pied de page du site.'
          ]
        }
      ]}
    />
  );
}
