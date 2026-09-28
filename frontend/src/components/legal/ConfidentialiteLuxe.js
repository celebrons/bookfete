import React from 'react';
import LegalPageLuxe from './LegalPageLuxe';

// Sous-traitants nommes explicitement (retour utilisateur, plan de mise en
// production) : Supabase, Stripe, Gelato, le service d'e-mail (Resend), et
// Scaleway. Duree de conservation encore ouverte ailleurs dans le plan
// (point "conservation") : marquee A COMPLETER plutot que devinee.
export default function ConfidentialiteLuxe() {
  return (
    <LegalPageLuxe
      title="Politique de confidentialité"
      updated="28 septembre 2026"
      intro="Cette page explique quelles données Célébrons collecte, pourquoi, et avec qui elles sont partagées pour fabriquer et livrer votre livre."
      sections={[
        {
          heading: 'Responsable du traitement',
          paragraphs: [
            'Le responsable du traitement des données est l\'éditeur du site, identifié dans les mentions légales. Pour toute question, contactez bonjour@celebrons.com.'
          ]
        },
        {
          heading: 'Données collectées',
          list: [
            'Adresse email (identification, communication sur votre commande)',
            "Photos et textes que vous déposez, ainsi que ceux déposés par les personnes que vous invitez en mode collectif",
            "Adresse de livraison et, si distincte, adresse de facturation",
            "Historique de vos livres et de vos commandes"
          ]
        },
        {
          heading: 'Pourquoi ces données sont collectées',
          paragraphs: [
            "Ces données sont utilisées exclusivement pour créer votre compte, composer votre livre, traiter et livrer votre commande, et vous informer de son avancement. Aucune donnée n'est vendue ni utilisée à des fins publicitaires."
          ]
        },
        {
          heading: 'Qui reçoit vos données (sous-traitants)',
          paragraphs: [
            'Certaines de vos données sont partagées avec les prestataires suivants, chacun pour la seule mission qui le concerne :'
          ],
          list: [
            'Supabase — hébergement de la base de données, authentification, stockage des photos',
            'Stripe — traitement sécurisé du paiement par carte bancaire',
            'Gelato — fabrication et expédition des livres imprimés (reçoit l\'adresse de livraison et le fichier du livre)',
            'Resend — envoi des emails transactionnels (confirmation de commande, PDF prêt, suivi de fabrication)',
            'Scaleway — hébergement du serveur applicatif (France)'
          ]
        },
        {
          heading: 'Durée de conservation',
          paragraphs: [
            'Vos données sont conservées [À COMPLÉTER : durée de conservation par type de donnée — livre, commande, photo].'
          ]
        },
        {
          heading: 'Vos droits',
          paragraphs: [
            "Conformément au règlement général sur la protection des données (RGPD), vous disposez d'un droit d'accès, de rectification, d'effacement et de portabilité de vos données, ainsi que d'un droit d'opposition. Pour l'exercer, écrivez à bonjour@celebrons.com.",
            "Si vous estimez que vos droits ne sont pas respectés, vous pouvez introduire une réclamation auprès de la CNIL (www.cnil.fr)."
          ]
        },
        {
          heading: 'Cookies',
          paragraphs: [
            "Célébrons n'utilise aucun cookie publicitaire ni de traceur à des fins de mesure d'audience commerciale. Seuls des éléments techniques strictement nécessaires au fonctionnement du site (maintien de votre connexion) sont utilisés."
          ]
        },
        {
          heading: 'Sécurité',
          paragraphs: [
            "L'accès à vos données est protégé par des règles de sécurité au niveau de la base de données (chaque livre n'est visible que par son propriétaire) et par une connexion chiffrée (HTTPS) sur l'ensemble du site."
          ]
        }
      ]}
    />
  );
}
