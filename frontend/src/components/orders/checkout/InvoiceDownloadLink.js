import React, { useEffect, useState } from 'react';
import { getOrderInvoice } from '../../../services/ordersApi';

// Lien de telechargement de la facture, sur l'ecran de suivi (StepTracking.js).
//
// SELF-CONTENUE A DESSEIN : StepTracking.js est purement presentatif (voir
// son entete), pilote par le sondage principal de BookCheckoutLuxe.js — la
// facture, elle, arrive a un moment independant (juste apres le paiement,
// cote serveur) et n'a pas besoin d'etre couplee a ce sondage. Un seul petit
// fetch ici, avec sa propre gestion d'etat, plutot que d'alourdir l'etat
// principal pour un element optionnel.
//
// Generation JAMAIS declenchee depuis le frontend (voir
// backend/services/invoicing/invoiceService.js) : ce composant lit
// seulement ; un 404 veut dire "pas encore prete", pas une erreur a afficher.
function InvoiceDownloadLink({ orderId }) {
  const [etat, setEtat] = useState({ chargement: true, invoice: null });

  useEffect(() => {
    let annule = false;
    // Un seul essai supplementaire apres un court delai : la facture est
    // generee de facon asynchrone au moment du paiement (voir
    // triggerInvoiceIfNeeded, routes/orders.js) et peut ne pas encore
    // exister au premier chargement de cet ecran.
    const essayer = async (dernierEssai) => {
      try {
        const invoice = await getOrderInvoice(orderId);
        if (!annule) setEtat({ chargement: false, invoice });
      } catch (erreur) {
        if (annule) return;
        if (erreur.status === 404 && !dernierEssai) {
          setTimeout(() => essayer(true), 6000);
          return;
        }
        setEtat({ chargement: false, invoice: null });
      }
    };
    essayer(false);
    return () => { annule = true; };
  }, [orderId]);

  if (etat.chargement || !etat.invoice) return null;

  return (
    <div className="tracking-invoice">
      <a href={etat.invoice.url} target="_blank" rel="noreferrer" className="tracking-invoice-link">
        📄 Télécharger la facture ({etat.invoice.invoiceNumber})
      </a>
    </div>
  );
}

export default InvoiceDownloadLink;
