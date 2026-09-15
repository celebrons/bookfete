// Gabarits des emails transactionnels de Celebrons.
//
// UN SEUL HABILLAGE, decline par message : meme en-tete, meme pied, meme
// typographie. Un email de confirmation qui ne ressemble pas au site fait
// douter de son authenticite — et c'est precisement ce qu'on ne veut pas
// pour un message qui parle d'argent et de livraison.
//
// HTML VOLONTAIREMENT PAUVRE : tableaux, styles en ligne, aucune police
// externe, aucune image distante. Les clients de messagerie (Outlook en
// tete) ignorent les feuilles de style, le flex et le grid ; tout ce qui
// n'est pas en ligne finit par ne pas s'appliquer. Ce fichier est donc
// deliberement moins elegant que le reste du projet — c'est le prix d'un
// rendu fiable partout.
//
// CHAQUE EMAIL A UNE VERSION TEXTE : certains clients ne lisent que
// celle-la, et c'est aussi elle qui est indexee par les filtres anti-spam.
//
// Le TON suit celui du produit : simple, chaleureux, jamais commercial. On
// dit ce qui s'est passe et ce qui va suivre, rien de plus.

const OR = '#c9a35f';
const ENCRE = '#241f18';
const GRIS = '#7a7266';
const PAPIER = '#fffdf8';

const echapper = (valeur) => String(valeur ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const prix = (cents) => {
  const n = Number(cents);
  if (!Number.isFinite(n)) return '';
  return `${(n / 100).toFixed(2).replace('.', ',')} €`;
};

// Enveloppe commune. `bouton` et `details` sont facultatifs.
// Pied de page. Il doit dire au destinataire POURQUOI il recoit ce message —
// c'est une obligation de forme, mais surtout ce qui distingue un email
// legitime d'un courrier non sollicite. « Vous avez cree un livre » serait
// faux pour un proche invite a contribuer : il n'a rien cree du tout.
const PIEDS = {
  createur: 'Vous recevez cet email parce que vous avez créé un livre sur Célébrons.',
  invite: 'Vous recevez cet email parce que quelqu’un vous a invité à contribuer à son livre souvenir.'
};

function habillage({ titre, corps, bouton, details, pied = 'createur' }) {
  const lignesDetails = (details || [])
    .filter(Boolean)
    .map(([cle, valeur]) => `
      <tr>
        <td style="padding:4px 0;color:${GRIS};font-size:14px;">${echapper(cle)}</td>
        <td style="padding:4px 0;color:${ENCRE};font-size:14px;text-align:right;font-weight:600;">${echapper(valeur)}</td>
      </tr>`)
    .join('');

  return `<!doctype html>
<html lang="fr">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head>
<body style="margin:0;padding:0;background:#f4f0e6;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f0e6;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:${PAPIER};border-radius:14px;overflow:hidden;">
        <tr><td style="padding:28px 32px 0;">
          <div style="font-family:Georgia,'Times New Roman',serif;font-size:20px;letter-spacing:0.06em;color:${ENCRE};">Célébrons</div>
          <div style="height:2px;width:36px;background:${OR};margin-top:8px;"></div>
        </td></tr>
        <tr><td style="padding:24px 32px 0;">
          <h1 style="margin:0 0 12px;font-family:Georgia,'Times New Roman',serif;font-size:22px;line-height:1.3;color:${ENCRE};font-weight:400;">${echapper(titre)}</h1>
          <div style="font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:${ENCRE};">${corps}</div>
        </td></tr>
        ${lignesDetails ? `<tr><td style="padding:20px 32px 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-family:Helvetica,Arial,sans-serif;border-top:1px solid #e3ddd0;padding-top:8px;">
            ${lignesDetails}
          </table>
        </td></tr>` : ''}
        ${bouton ? `<tr><td style="padding:24px 32px 0;">
          <a href="${echapper(bouton.url)}" style="display:inline-block;background:${OR};color:${ENCRE};font-family:Helvetica,Arial,sans-serif;font-size:15px;font-weight:700;text-decoration:none;padding:12px 24px;border-radius:999px;">${echapper(bouton.libelle)}</a>
        </td></tr>` : ''}
        <tr><td style="padding:28px 32px 28px;">
          <p style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:${GRIS};">
            ${PIEDS[pied] || PIEDS.createur}
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

const texteDe = ({ titre, lignes, bouton, details }) => [
  titre,
  '',
  ...lignes,
  ...(details && details.length ? ['', ...details.filter(Boolean).map(([c, v]) => `${c} : ${v}`)] : []),
  ...(bouton ? ['', `${bouton.libelle} : ${bouton.url}`] : []),
  '',
  '— Célébrons'
].join('\n');

// --- Les messages ---------------------------------------------------------
//
// Chacun renvoie { subject, html, text }. Aucun n'envoie quoi que ce soit :
// ce fichier ne fait que rediger (fonctions pures, testables).

function retrouverSonLivre({ lien, titreLivre }) {
  const nom = titreLivre ? `« ${titreLivre} »` : 'votre livre';
  const titre = 'Retrouvez votre livre';
  const lignes = [
    `Voici le lien pour revenir à ${nom} et continuer là où vous vous êtes arrêté.`,
    'Ce lien vous reconnaît : vous n’avez pas de mot de passe à retenir.'
  ];
  const bouton = { libelle: 'Ouvrir mon livre', url: lien };
  return {
    subject: 'Retrouvez votre livre sur Célébrons',
    html: habillage({ titre, corps: lignes.map((l) => `<p style="margin:0 0 12px;">${echapper(l)}</p>`).join(''), bouton }),
    text: texteDe({ titre, lignes, bouton })
  };
}

function commandeConfirmee({ numero, titreLivre, format, pages, totalCents, lien }) {
  const titre = 'Votre commande est enregistrée';
  const lignes = [
    `Merci ! Nous avons bien reçu votre commande${titreLivre ? ` pour « ${titreLivre} »` : ''}.`,
    'Vous recevrez un nouvel email dès que votre livre partira en fabrication.'
  ];
  const details = [
    ['Commande', numero],
    format ? ['Format', format] : null,
    pages ? ['Pages', String(pages)] : null,
    totalCents != null ? ['Total', prix(totalCents)] : null
  ];
  const bouton = lien ? { libelle: 'Suivre ma commande', url: lien } : null;
  return {
    subject: `Votre commande ${numero} est enregistrée`,
    html: habillage({ titre, corps: lignes.map((l) => `<p style="margin:0 0 12px;">${echapper(l)}</p>`).join(''), bouton, details }),
    text: texteDe({ titre, lignes, bouton, details })
  };
}

function paiementRecu({ numero, totalCents, lien }) {
  const titre = 'Paiement reçu';
  const lignes = [
    'Votre paiement a bien été reçu. Votre livre entre maintenant en préparation.',
    'Nous vous préviendrons à chaque étape.'
  ];
  const details = [['Commande', numero], totalCents != null ? ['Montant', prix(totalCents)] : null];
  const bouton = lien ? { libelle: 'Suivre ma commande', url: lien } : null;
  return {
    subject: `Paiement reçu — commande ${numero}`,
    html: habillage({ titre, corps: lignes.map((l) => `<p style="margin:0 0 12px;">${echapper(l)}</p>`).join(''), bouton, details }),
    text: texteDe({ titre, lignes, bouton, details })
  };
}

// Une seule fonction pour les etapes de fabrication : elles racontent la meme
// chose a des moments differents, et trois gabarits presque identiques
// auraient diverge au premier changement de ton.
const ETAPES = {
  print_queued: {
    sujet: 'Votre livre est en préparation',
    titre: 'Votre livre est en préparation',
    lignes: ['Nous préparons le fichier d’impression de votre livre.', 'La fabrication commence juste après.']
  },
  sent_to_printer: {
    sujet: 'Votre livre est parti en fabrication',
    titre: 'Votre livre est en fabrication',
    lignes: ['Votre livre est entre les mains de notre imprimeur.', 'Comptez quelques jours avant l’expédition.']
  },
  printed: {
    sujet: 'Votre livre est imprimé',
    titre: 'Votre livre est imprimé',
    lignes: ['Votre livre est imprimé et prêt à être expédié.']
  },
  shipped: {
    sujet: 'Votre livre est expédié',
    titre: 'Votre livre est en route',
    lignes: ['Votre livre a quitté l’atelier d’impression.']
  },
  delivered: {
    sujet: 'Votre livre est livré',
    titre: 'Votre livre est arrivé',
    lignes: ['Votre livre a été livré. Nous espérons qu’il vous plaira.']
  }
};

function etapeDeFabrication({ statut, numero, lien, suivi }) {
  const etape = ETAPES[statut];
  if (!etape) return null; // statut sans email dedie : on n'invente pas de message

  const lignes = [...etape.lignes];
  const details = [['Commande', numero], suivi?.code ? ['Numéro de suivi', suivi.code] : null];
  // Le lien de suivi du transporteur prime sur celui du site : c'est
  // l'information la plus utile a ce moment precis.
  const bouton = suivi?.url
    ? { libelle: 'Suivre mon colis', url: suivi.url }
    : (lien ? { libelle: 'Suivre ma commande', url: lien } : null);

  return {
    subject: `${etape.sujet} — commande ${numero}`,
    html: habillage({ titre: etape.titre, corps: lignes.map((l) => `<p style="margin:0 0 12px;">${echapper(l)}</p>`).join(''), bouton, details }),
    text: texteDe({ titre: etape.titre, lignes, bouton, details })
  };
}

// --- Mode collectif -------------------------------------------------------
//
// Ces trois messages sortent du cadre « une commande » : ils s'adressent aux
// PROCHES du createur, pas au client. Le ton change donc : on explique en deux
// phrases de quoi il s'agit, parce que le destinataire n'a peut-etre jamais
// entendu parler de Celebrons et ne s'attend pas a cet email.

function invitationParticipant({ lien, titreLivre, pourQui, deLaPart, message, dateLimite }) {
  const sujet = pourQui
    ? `Participez au livre souvenir pour ${pourQui}`
    : 'Participez a un livre souvenir';
  const titre = pourQui ? `Un livre pour ${pourQui}` : 'Un livre souvenir vous attend';

  const lignes = [
    `${deLaPart ? deLaPart + ' prepare' : 'Quelqu’un prepare'} un livre souvenir${pourQui ? ` pour ${pourQui}` : ''}${titreLivre ? ` : « ${titreLivre} »` : ''}.`,
    'Ajoutez vos photos et vos souvenirs — quelques minutes suffisent, et il n’y a pas de compte a creer.'
  ];
  // Le mot du createur, quand il y en a un : c'est ce qui fait la difference
  // entre un email personnel et un envoi automatique.
  if (message) lignes.push(`« ${message} »`);

  const details = dateLimite ? [['A envoyer avant le', dateLimite]] : [];
  const bouton = { libelle: 'Ajouter mes souvenirs', url: lien };

  return {
    subject: sujet,
    html: habillage({ titre, corps: lignes.map((l) => `<p style="margin:0 0 12px;">${echapper(l)}</p>`).join(''), bouton, details, pied: 'invite' }),
    text: texteDe({ titre, lignes, bouton, details })
  };
}

function relanceParticipant({ lien, titreLivre, pourQui, dateLimite, dejaCommence }) {
  const titre = dejaCommence ? 'Votre contribution est presque prete' : 'Il reste un peu de temps';
  const lignes = dejaCommence
    ? ['Vous avez commence a ajouter vos souvenirs — il ne manque que la suite.']
    : [`Le livre souvenir${pourQui ? ` pour ${pourQui}` : ''}${titreLivre ? ` (« ${titreLivre} »)` : ''} attend encore votre contribution.`];
  lignes.push('Quelques photos suffisent.');

  const details = dateLimite ? [['A envoyer avant le', dateLimite]] : [];
  const bouton = { libelle: 'Ajouter mes souvenirs', url: lien };

  return {
    subject: pourQui ? `Rappel : le livre pour ${pourQui}` : 'Rappel : votre livre souvenir',
    html: habillage({ titre, corps: lignes.map((l) => `<p style="margin:0 0 12px;">${echapper(l)}</p>`).join(''), bouton, details, pied: 'invite' }),
    text: texteDe({ titre, lignes, bouton, details })
  };
}

// Vers le CREATEUR, pas vers les proches : « quelqu'un vient de contribuer ».
function nouvelleContribution({ lien, titreLivre, contributeur, photos, souvenirs }) {
  const titre = 'Un nouveau souvenir dans votre livre';
  const lignes = [
    `${contributeur || 'Quelqu’un'} vient d’ajouter${titreLivre ? ` a « ${titreLivre} »` : ' a votre livre'}.`
  ];
  const details = [
    photos ? ['Photos ajoutees', String(photos)] : null,
    souvenirs ? ['Souvenirs ajoutes', String(souvenirs)] : null
  ];
  const bouton = lien ? { libelle: 'Voir mon livre', url: lien } : null;

  return {
    subject: `${contributeur || 'Quelqu’un'} a contribue a votre livre`,
    html: habillage({ titre, corps: lignes.map((l) => `<p style="margin:0 0 12px;">${echapper(l)}</p>`).join(''), bouton, details }),
    text: texteDe({ titre, lignes, bouton, details })
  };
}

function essai({ destinataire }) {
  const titre = 'Vos emails fonctionnent';
  const lignes = [
    'Si vous lisez ce message, Célébrons peut envoyer des emails en votre nom.',
    `Envoyé à ${destinataire}.`
  ];
  return {
    subject: 'Célébrons — test d’envoi',
    html: habillage({ titre, corps: lignes.map((l) => `<p style="margin:0 0 12px;">${echapper(l)}</p>`).join('') }),
    text: texteDe({ titre, lignes })
  };
}

module.exports = {
  PIEDS,
  invitationParticipant,
  relanceParticipant,
  nouvelleContribution,
  retrouverSonLivre,
  commandeConfirmee,
  paiementRecu,
  etapeDeFabrication,
  essai,
  ETAPES,
  prix
};
