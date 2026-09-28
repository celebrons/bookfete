import React from 'react';
import LegalPageLuxe from './LegalPageLuxe';

// L'exclusion du droit de retractation (art. L221-28 3°) est le coeur de
// ce document : elle n'est opposable que si elle est ECRITE et ACCEPTEE
// AVANT le paiement (retour utilisateur, plan de mise en production) — la
// case a cocher a l'etape paiement (StepPayment.js) fournit cette preuve.
export default function CGVLuxe() {
  return (
    <LegalPageLuxe
      title="Conditions générales de vente"
      updated="28 septembre 2026"
      intro="Les présentes conditions générales de vente s'appliquent à toute commande passée sur Célébrons. En cochant la case d'acceptation au moment du paiement, vous déclarez les avoir lues et acceptées."
      sections={[
        {
          heading: '1. Objet',
          paragraphs: [
            "Célébrons propose la création de livres souvenirs personnalisés à partir des photos et textes déposés par le client (et, en mode collectif, par les personnes qu'il invite), composés automatiquement ou manuellement, puis livrés au format PDF, imprimé, ou les deux."
          ]
        },
        {
          heading: '2. Prix',
          paragraphs: [
            'Les prix sont indiqués en euros, toutes taxes comprises, et affichés en temps réel dans l\'atelier avant toute commande. Le détail des tarifs par format est consultable sur la page Tarifs.',
            'Célébrons exerçant sous le statut de micro-entreprise, la TVA n\'est pas applicable, conformément à l\'article 293 B du Code général des impôts (mention "TVA non applicable, art. 293 B du CGI").'
          ]
        },
        {
          heading: '3. Commande et paiement',
          paragraphs: [
            "La commande est validée après paiement intégral en ligne, par carte bancaire, via la solution sécurisée Stripe. Aucune donnée bancaire n'est stockée ou accessible par Célébrons.",
            "Le prix facturé au moment du paiement correspond exactement à l'état du livre à cet instant (nombre de pages, format) : il est figé pour cette commande et ne change plus ensuite, y compris si les tarifs généraux évoluent par la suite."
          ]
        },
        {
          heading: '4. Livraison',
          paragraphs: [
            "Les livres imprimés sont fabriqués et expédiés par notre partenaire d'impression. Les délais indiqués (fabrication puis expédition) sont donnés à titre indicatif et ne sont pas contractuels : ils dépendent de la charge de production du moment.",
            'Le suivi de fabrication et d\'expédition est visible à tout moment depuis votre espace de commande.'
          ]
        },
        {
          heading: '5. Droit de rétractation — exclusion',
          paragraphs: [
            "Conformément à l'article L221-28 3° du Code de la consommation, le droit de rétractation de 14 jours ne s'applique pas aux contrats de fourniture de biens confectionnés selon les spécifications du consommateur ou nettement personnalisés.",
            "Votre livre étant composé à partir de vos propres photos et textes (et, le cas échéant, de ceux des personnes que vous invitez), il constitue un bien nettement personnalisé au sens de cet article : sa fabrication ne peut pas être annulée une fois la commande validée et payée.",
            "En cochant la case d'acceptation des présentes CGV avant de payer, vous reconnaissez avoir été informé de cette exclusion et y consentir expressément, avant même que le paiement ne soit demandé."
          ]
        },
        {
          heading: '6. Qualité des photos',
          paragraphs: [
            "L'atelier signale automatiquement les photos dont la résolution est insuffisante pour une impression nette au format choisi. Un écran récapitulatif liste ces photos avant toute commande : vous pouvez les remplacer, ou choisir de commander malgré l'avertissement. Célébrons ne peut être tenu responsable du rendu d'une photo dont la faible qualité a été signalée puis maintenue sciemment."
          ]
        },
        {
          heading: '7. Responsabilité sur le contenu déposé',
          paragraphs: [
            "Vous êtes seul responsable des photos et textes que vous déposez, ainsi que de ceux déposés par les personnes que vous invitez en mode collectif : vous garantissez disposer des droits nécessaires sur ce contenu et vous engagez à ne déposer aucun contenu illicite."
          ]
        },
        {
          heading: '8. Réclamations et service client',
          paragraphs: [
            'Pour toute question ou réclamation concernant une commande, écrivez à bonjour@celebrons.com en indiquant votre numéro de commande.'
          ]
        },
        {
          heading: '9. Médiation de la consommation',
          paragraphs: [
            "Conformément à l'article L616-1 du Code de la consommation, en cas de litige non résolu directement avec notre service client, vous pouvez recourir gratuitement au médiateur de la consommation suivant : [À COMPLÉTER : nom et coordonnées du médiateur de la consommation]."
          ]
        },
        {
          heading: '10. Droit applicable',
          paragraphs: [
            'Les présentes conditions générales de vente sont soumises au droit français. En cas de litige, et à défaut de résolution amiable, les tribunaux français compétents seront seuls saisis.'
          ]
        },
        {
          heading: '11. Éditeur',
          paragraphs: [
            "L'identité complète de l'éditeur du site figure dans les mentions légales."
          ]
        }
      ]}
    />
  );
}
