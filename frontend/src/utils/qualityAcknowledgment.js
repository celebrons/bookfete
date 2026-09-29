// Evite de montrer DEUX FOIS le meme avertissement qualite photo au meme
// utilisateur, dans la meme session : une fois dans l'atelier ("Terminer
// mon livre"), une fois sur l'ecran Apercu final ("Commander mon livre")
// avant de payer (retour utilisateur, 2026-09-29 : "on va enlever
// l'alerte... vu qu'on l'affiche deja... dans l'atelier").
//
// NE SUPPRIME PAS LE VERROU : ce dernier reste OBLIGATOIRE (cahier des
// charges v2, §2 — voir BookPreviewFinalLuxe.js) pour qui arrive sur Apercu
// final SANS etre passe par l'atelier (lien direct, retour navigateur...).
// Il ne s'efface que si les MEMES photos, deja vues et confirmees dans
// l'atelier POUR CE LIVRE, sont encore celles signalees ici — un
// changement depuis (nouvelle photo basse resolution) redeclenche
// l'alerte normalement.
//
// sessionStorage, pas une colonne en base : c'est une commodite d'ecran,
// jamais une donnee metier a synchroniser/persister au-dela de l'onglet.
const PREFIX = 'celebrons:qualityAck:';

function lireEnsembleAcquitte(bookId) {
  try {
    const brut = window.sessionStorage.getItem(`${PREFIX}${bookId}`);
    const liste = brut ? JSON.parse(brut) : [];
    return new Set(Array.isArray(liste) ? liste : []);
  } catch (_err) {
    return new Set(); // stockage indisponible (navigation privee, etc.) -> jamais acquitte, le verrou reste actif
  }
}

// Appele depuis l'atelier (AtelierFinishModal) des que l'ecran recapitulatif
// a reellement charge son controle qualite et que l'utilisateur continue —
// meme si `itemIds` est vide (livre sans avertissement), enregistrer
// "controle vu, rien a signaler" evite de re-demander inutilement.
export function acquitterAvertissementsQualite(bookId, itemIds) {
  if (!bookId) return;
  try {
    window.sessionStorage.setItem(`${PREFIX}${bookId}`, JSON.stringify([...new Set(itemIds || [])]));
  } catch (_err) {
    // Non bloquant : au pire, l'ecran Apercu final re-demandera — jamais grave.
  }
}

// Vrai si TOUTES les photos actuellement signalees ont deja ete vues et
// confirmees pour ce livre — donc rien de NOUVEAU a montrer.
export function avertissementsDejaAcquittes(bookId, itemIdsActuels) {
  if (!bookId) return false;
  const acquittes = lireEnsembleAcquitte(bookId);
  return (itemIdsActuels || []).every((id) => acquittes.has(id));
}
