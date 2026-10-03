// backend/scripts/verifier-statuts-gelato.js
//
// Controle periodique du statut reel des commandes chez Gelato (recu,
// imprime, expedie, livre...) — SANS attendre qu'un client ou un admin
// ouvre l'ecran de suivi (voir services/printing/gelatoStatusSync.js).
//
// Pourquoi (2026-10-04) : avant ce script, un livre pouvait etre
// reellement expedie chez l'imprimeur sans que personne ne le sache avant
// une visite de l'ecran de suivi — et sans e-mail pour le client, puisque
// celui-ci n'etait declenche que par un changement de statut MANUEL depuis
// l'administration. Demande du fondateur : "que tout soit en auto".
//
// Lance par bookipix-gelato-suivi.timer (voir deploy/), jamais directement
// en production. Chaque commande est traitee independamment : l'echec
// d'une seule n'interrompt jamais les autres. Jamais de redemarrage de
// service, jamais d'ecriture hors de orders.metadata/orders.status — ce
// script ne fait qu'appeler exactement la meme fonction que l'ecran de
// suivi, pour une liste de commandes au lieu d'une seule.

require('dotenv').config();
const supabase = require('../config/supabase');
const { refreshGelatoTracking } = require('../services/printing/gelatoStatusSync');

// Pas de hate a enchainer les appels : une pause courte entre deux
// commandes suffit a rester poli envers l'API Gelato sans ralentir
// sensiblement un lot de quelques dizaines de commandes.
const PAUSE_ENTRE_COMMANDES_MS = 400;
const attendre = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function commandesAVerifier() {
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .in('type', ['print', 'pack'])
    .not('metadata->>gelatoOrderId', 'is', null)
    .not('status', 'in', '(delivered,cancelled,failed)');
  if (error) throw error;
  return data || [];
}

async function main() {
  const commandes = await commandesAVerifier();
  console.log(`[verifier-statuts-gelato] ${commandes.length} commande(s) a verifier.`);

  let avancees = 0;
  let echecs = 0;

  for (const commande of commandes) {
    try {
      const avant = commande.status;
      // eslint-disable-next-line no-await-in-loop
      const resultat = await refreshGelatoTracking(commande);
      if (resultat.status !== avant) {
        avancees += 1;
        console.log(`  ${commande.id} : ${avant} -> ${resultat.status}`);
      }
    } catch (error) {
      echecs += 1;
      console.error(`  ${commande.id} : ECHEC — ${error.message}`);
    }
    // eslint-disable-next-line no-await-in-loop
    await attendre(PAUSE_ENTRE_COMMANDES_MS);
  }

  console.log(`[verifier-statuts-gelato] termine : ${avancees} avancee(s), ${echecs} echec(s) sur ${commandes.length}.`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('[verifier-statuts-gelato] erreur fatale :', error.message);
    process.exit(1);
  });
