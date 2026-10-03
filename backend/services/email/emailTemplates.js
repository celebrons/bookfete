// Gabarits des emails transactionnels de Bookipix.
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
//
// BILINGUE (chantier phase 6, 2026-10-01) : chaque gabarit CLIENT prend un
// `lang` optionnel ('fr'|'en', defaut 'fr' — jamais une erreur si omis, les
// appels existants restent valables). Qui resout CETTE langue pour quel
// envoi est la responsabilite de transactionalEmails.js, pas de ce fichier
// (fonctions pures). Seul alerteAdmin reste volontairement francais-seul :
// le destinataire est toujours le fondateur (ADMIN_EMAILS), jamais un
// client — hors perimetre du chantier bilingue, comme /admin cote frontend.

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
  fr: {
    createur: 'Vous recevez cet email parce que vous avez créé un livre sur Bookipix.',
    invite: 'Vous recevez cet email parce que quelqu’un vous a invité à contribuer à son livre souvenir.',
    interne: 'Alerte technique interne — envoyée aux adresses listées dans ADMIN_EMAILS.'
  },
  en: {
    createur: 'You are receiving this email because you created a book on Bookipix.',
    invite: 'You are receiving this email because someone invited you to contribute to their memory book.',
    interne: 'Internal technical alert — sent to the addresses listed in ADMIN_EMAILS.'
  }
};

function habillage({ titre, corps, bouton, details, pied = 'createur', lang = 'fr' }) {
  const pieds = PIEDS[lang] || PIEDS.fr;
  const lignesDetails = (details || [])
    .filter(Boolean)
    .map(([cle, valeur]) => `
      <tr>
        <td style="padding:4px 0;color:${GRIS};font-size:14px;">${echapper(cle)}</td>
        <td style="padding:4px 0;color:${ENCRE};font-size:14px;text-align:right;font-weight:600;">${echapper(valeur)}</td>
      </tr>`)
    .join('');

  return `<!doctype html>
<html lang="${lang === 'en' ? 'en' : 'fr'}">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head>
<body style="margin:0;padding:0;background:#f4f0e6;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f0e6;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:${PAPIER};border-radius:14px;overflow:hidden;">
        <tr><td style="padding:28px 32px 0;">
          <div style="font-family:Georgia,'Times New Roman',serif;font-size:20px;letter-spacing:0.06em;color:${ENCRE};">Bookipix</div>
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
            ${pieds[pied] || pieds.createur}
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
  '— Bookipix'
].join('\n');

// --- Les messages ---------------------------------------------------------
//
// Chacun renvoie { subject, html, text }. Aucun n'envoie quoi que ce soit :
// ce fichier ne fait que rediger (fonctions pures, testables).

function retrouverSonLivre({ lien, titreLivre, lang = 'fr' }) {
  const en = lang === 'en';
  const nom = titreLivre ? (en ? `"${titreLivre}"` : `« ${titreLivre} »`) : (en ? 'your book' : 'votre livre');
  const titre = en ? 'Find your book' : 'Retrouvez votre livre';
  const lignes = en ? [
    `Here's the link to get back to ${nom} and continue where you left off.`,
    'This link recognizes you: no password to remember.'
  ] : [
    `Voici le lien pour revenir à ${nom} et continuer là où vous vous êtes arrêté.`,
    'Ce lien vous reconnaît : vous n’avez pas de mot de passe à retenir.'
  ];
  const bouton = { libelle: en ? 'Open my book' : 'Ouvrir mon livre', url: lien };
  return {
    subject: en ? 'Find your book on Bookipix' : 'Retrouvez votre livre sur Bookipix',
    html: habillage({ titre, corps: lignes.map((l) => `<p style="margin:0 0 12px;">${echapper(l)}</p>`).join(''), bouton, lang }),
    text: texteDe({ titre, lignes, bouton })
  };
}

function commandeConfirmee({ numero, titreLivre, format, pages, totalCents, lien, lang = 'fr' }) {
  const en = lang === 'en';
  const titre = en ? 'Your order has been recorded' : 'Votre commande est enregistrée';
  const lignes = en ? [
    `Thank you! We have received your order${titreLivre ? ` for "${titreLivre}"` : ''}.`,
    'You will receive a new email as soon as your book goes into production.'
  ] : [
    `Merci ! Nous avons bien reçu votre commande${titreLivre ? ` pour « ${titreLivre} »` : ''}.`,
    'Vous recevrez un nouvel email dès que votre livre partira en fabrication.'
  ];
  const details = [
    [en ? 'Order' : 'Commande', numero],
    format ? [en ? 'Format' : 'Format', format] : null,
    pages ? [en ? 'Pages' : 'Pages', String(pages)] : null,
    totalCents != null ? [en ? 'Total' : 'Total', prix(totalCents)] : null
  ];
  const bouton = lien ? { libelle: en ? 'Track my order' : 'Suivre ma commande', url: lien } : null;
  return {
    subject: en ? `Your order ${numero} has been recorded` : `Votre commande ${numero} est enregistrée`,
    html: habillage({ titre, corps: lignes.map((l) => `<p style="margin:0 0 12px;">${echapper(l)}</p>`).join(''), bouton, details, lang }),
    text: texteDe({ titre, lignes, bouton, details })
  };
}

// Le PDF d'un livre complet demande PLUSIEURS MINUTES de rendu (chaque
// page est capturee en haute resolution). On invite donc l'utilisateur a
// fermer la page pendant ce temps — promesse qui n'a de sens que si un
// email vient reellement le rappeler ensuite. C'est cet email.
function pdfPret({ titreLivre, lien, pages, lang = 'fr' }) {
  const en = lang === 'en';
  const titre = en ? 'Your PDF is ready' : 'Votre PDF est prêt';
  const lignes = en ? [
    `The PDF file${titreLivre ? ` for "${titreLivre}"` : ''} has finished being generated.`,
    'You can download it now from your order.'
  ] : [
    `Le fichier PDF${titreLivre ? ` de « ${titreLivre} »` : ''} a fini d’être fabriqué.`,
    'Vous pouvez le télécharger dès maintenant depuis votre commande.'
  ];
  const details = [pages ? [en ? 'Pages' : 'Pages', String(pages)] : null];
  const bouton = lien ? { libelle: en ? 'Download my PDF' : 'Télécharger mon PDF', url: lien } : null;
  return {
    subject: en
      ? (titreLivre ? `Your PDF "${titreLivre}" is ready` : 'Your PDF is ready')
      : (titreLivre ? `Votre PDF « ${titreLivre} » est prêt` : 'Votre PDF est prêt'),
    html: habillage({ titre, corps: lignes.map((l) => `<p style="margin:0 0 12px;">${echapper(l)}</p>`).join(''), bouton, details, lang }),
    text: texteDe({ titre, lignes, bouton, details })
  };
}

function paiementRecu({ numero, totalCents, lien, lang = 'fr' }) {
  const en = lang === 'en';
  const titre = en ? 'Payment received' : 'Paiement reçu';
  const lignes = en ? [
    'Your payment has been received. Your book is now entering preparation.',
    'We will keep you posted at every step.'
  ] : [
    'Votre paiement a bien été reçu. Votre livre entre maintenant en préparation.',
    'Nous vous préviendrons à chaque étape.'
  ];
  const details = [
    [en ? 'Order' : 'Commande', numero],
    totalCents != null ? [en ? 'Amount' : 'Montant', prix(totalCents)] : null
  ];
  const bouton = lien ? { libelle: en ? 'Track my order' : 'Suivre ma commande', url: lien } : null;
  return {
    subject: en ? `Payment received — order ${numero}` : `Paiement reçu — commande ${numero}`,
    html: habillage({ titre, corps: lignes.map((l) => `<p style="margin:0 0 12px;">${echapper(l)}</p>`).join(''), bouton, details, lang }),
    text: texteDe({ titre, lignes, bouton, details })
  };
}

/** Facture emise (PDF en piece jointe, voir invoiceService.js/brevoClient.js). */
function factureEmise({ numeroFacture, numeroCommande, totalCents, lien, lang = 'fr' }) {
  const en = lang === 'en';
  const titre = en ? 'Your invoice' : 'Votre facture';
  const lignes = en ? [
    'Here is the invoice for your order, attached (PDF).',
    'Keep it safe: it may come in handy later.'
  ] : [
    'Voici la facture de votre commande, en pièce jointe (PDF).',
    'Conservez-la précieusement : elle vous sera utile en cas de besoin.'
  ];
  const details = [
    [en ? 'Invoice' : 'Facture', numeroFacture],
    [en ? 'Order' : 'Commande', numeroCommande],
    totalCents != null ? [en ? 'Amount' : 'Montant', prix(totalCents)] : null
  ];
  const bouton = lien ? { libelle: en ? 'View my order' : 'Voir ma commande', url: lien } : null;
  return {
    subject: en ? `Your invoice ${numeroFacture} — order ${numeroCommande}` : `Votre facture ${numeroFacture} — commande ${numeroCommande}`,
    html: habillage({ titre, corps: lignes.map((l) => `<p style="margin:0 0 12px;">${echapper(l)}</p>`).join(''), bouton, details, lang }),
    text: texteDe({ titre, lignes, bouton, details })
  };
}

// Une seule fonction pour les etapes de fabrication : elles racontent la meme
// chose a des moments differents, et trois gabarits presque identiques
// auraient diverge au premier changement de ton.
const ETAPES = {
  fr: {
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
  },
  en: {
    print_queued: {
      sujet: 'Your book is being prepared',
      titre: 'Your book is being prepared',
      lignes: ['We are preparing the print file for your book.', 'Production starts right after.']
    },
    sent_to_printer: {
      sujet: 'Your book has gone into production',
      titre: 'Your book is being manufactured',
      lignes: ['Your book is in the hands of our printer.', 'Allow a few days before shipping.']
    },
    printed: {
      sujet: 'Your book is printed',
      titre: 'Your book is printed',
      lignes: ['Your book is printed and ready to be shipped.']
    },
    shipped: {
      sujet: 'Your book has shipped',
      titre: 'Your book is on its way',
      lignes: ['Your book has left the print workshop.']
    },
    delivered: {
      sujet: 'Your book has been delivered',
      titre: 'Your book has arrived',
      lignes: ['Your book has been delivered. We hope you love it.']
    }
  }
};

function etapeDeFabrication({ statut, numero, lien, suivi, lang = 'fr' }) {
  const en = lang === 'en';
  const etape = (ETAPES[lang] || ETAPES.fr)[statut];
  if (!etape) return null; // statut sans email dedie : on n'invente pas de message

  const lignes = [...etape.lignes];
  const details = [
    [en ? 'Order' : 'Commande', numero],
    suivi?.code ? [en ? 'Tracking number' : 'Numéro de suivi', suivi.code] : null
  ];
  // Le lien de suivi du transporteur prime sur celui du site : c'est
  // l'information la plus utile a ce moment precis.
  const bouton = suivi?.url
    ? { libelle: en ? 'Track my package' : 'Suivre mon colis', url: suivi.url }
    : (lien ? { libelle: en ? 'Track my order' : 'Suivre ma commande', url: lien } : null);

  return {
    subject: en ? `${etape.sujet} — order ${numero}` : `${etape.sujet} — commande ${numero}`,
    html: habillage({ titre: etape.titre, corps: lignes.map((l) => `<p style="margin:0 0 12px;">${echapper(l)}</p>`).join(''), bouton, details, lang }),
    text: texteDe({ titre: etape.titre, lignes, bouton, details })
  };
}

// --- Mode collectif -------------------------------------------------------
//
// Ces trois messages sortent du cadre « une commande » : ils s'adressent aux
// PROCHES du createur, pas au client. Le ton change donc : on explique en deux
// phrases de quoi il s'agit, parce que le destinataire n'a peut-etre jamais
// entendu parler de Bookipix et ne s'attend pas a cet email.

function invitationParticipant({ lien, titreLivre, pourQui, deLaPart, message, dateLimite, lang = 'fr' }) {
  const en = lang === 'en';
  const sujet = en
    ? (pourQui ? `Take part in the memory book for ${pourQui}` : 'Take part in a memory book')
    : (pourQui ? `Participez au livre souvenir pour ${pourQui}` : 'Participez a un livre souvenir');
  const titre = en
    ? (pourQui ? `A book for ${pourQui}` : 'A memory book is waiting for you')
    : (pourQui ? `Un livre pour ${pourQui}` : 'Un livre souvenir vous attend');

  const lignes = en ? [
    `${deLaPart ? `${deLaPart} is preparing` : 'Someone is preparing'} a memory book${pourQui ? ` for ${pourQui}` : ''}${titreLivre ? `: "${titreLivre}"` : ''}.`,
    "Add your photos and memories — a few minutes is enough, and there's no account to create."
  ] : [
    `${deLaPart ? deLaPart + ' prepare' : 'Quelqu’un prepare'} un livre souvenir${pourQui ? ` pour ${pourQui}` : ''}${titreLivre ? ` : « ${titreLivre} »` : ''}.`,
    'Ajoutez vos photos et vos souvenirs — quelques minutes suffisent, et il n’y a pas de compte a creer.'
  ];
  // Le mot du createur, quand il y en a un : c'est ce qui fait la difference
  // entre un email personnel et un envoi automatique.
  if (message) lignes.push(`« ${message} »`);

  const details = dateLimite ? [[en ? 'Send before' : 'A envoyer avant le', dateLimite]] : [];
  const bouton = { libelle: en ? 'Add my memories' : 'Ajouter mes souvenirs', url: lien };

  return {
    subject: sujet,
    html: habillage({ titre, corps: lignes.map((l) => `<p style="margin:0 0 12px;">${echapper(l)}</p>`).join(''), bouton, details, pied: 'invite', lang }),
    text: texteDe({ titre, lignes, bouton, details })
  };
}

function relanceParticipant({ lien, titreLivre, pourQui, dateLimite, dejaCommence, lang = 'fr' }) {
  const en = lang === 'en';
  const titre = en
    ? (dejaCommence ? 'Your contribution is almost ready' : "There's still a little time left")
    : (dejaCommence ? 'Votre contribution est presque prete' : 'Il reste un peu de temps');
  const lignes = en
    ? (dejaCommence
      ? ['You started adding your memories — only the rest is missing.']
      : [`The memory book${pourQui ? ` for ${pourQui}` : ''}${titreLivre ? ` ("${titreLivre}")` : ''} is still waiting for your contribution.`])
    : (dejaCommence
      ? ['Vous avez commence a ajouter vos souvenirs — il ne manque que la suite.']
      : [`Le livre souvenir${pourQui ? ` pour ${pourQui}` : ''}${titreLivre ? ` (« ${titreLivre} »)` : ''} attend encore votre contribution.`]);
  lignes.push(en ? 'A few photos are enough.' : 'Quelques photos suffisent.');

  const details = dateLimite ? [[en ? 'Send before' : 'A envoyer avant le', dateLimite]] : [];
  const bouton = { libelle: en ? 'Add my memories' : 'Ajouter mes souvenirs', url: lien };

  return {
    subject: en
      ? (pourQui ? `Reminder: the book for ${pourQui}` : 'Reminder: your memory book')
      : (pourQui ? `Rappel : le livre pour ${pourQui}` : 'Rappel : votre livre souvenir'),
    html: habillage({ titre, corps: lignes.map((l) => `<p style="margin:0 0 12px;">${echapper(l)}</p>`).join(''), bouton, details, pied: 'invite', lang }),
    text: texteDe({ titre, lignes, bouton, details })
  };
}

// Vers le CREATEUR, pas vers les proches : « quelqu'un vient de contribuer ».
function nouvelleContribution({ lien, titreLivre, contributeur, photos, souvenirs, lang = 'fr' }) {
  const en = lang === 'en';
  const titre = en ? 'A new memory in your book' : 'Un nouveau souvenir dans votre livre';
  const qui = contributeur || (en ? 'Someone' : 'Quelqu’un');
  const lignes = en ? [
    `${qui} just added something${titreLivre ? ` to "${titreLivre}"` : ' to your book'}.`
  ] : [
    `${qui} vient d’ajouter${titreLivre ? ` a « ${titreLivre} »` : ' a votre livre'}.`
  ];
  const details = [
    photos ? [en ? 'Photos added' : 'Photos ajoutees', String(photos)] : null,
    souvenirs ? [en ? 'Memories added' : 'Souvenirs ajoutes', String(souvenirs)] : null
  ];
  const bouton = lien ? { libelle: en ? 'View my book' : 'Voir mon livre', url: lien } : null;

  return {
    subject: en ? `${qui} contributed to your book` : `${qui} a contribue a votre livre`,
    html: habillage({ titre, corps: lignes.map((l) => `<p style="margin:0 0 12px;">${echapper(l)}</p>`).join(''), bouton, details, lang }),
    text: texteDe({ titre, lignes, bouton, details })
  };
}

// Alerte technique interne (retour utilisateur, 2026-09-27 — chantier
// "fiabilite de la commande de bout en bout") : paiement Stripe echoue/
// expire, generation PDF echouee apres nouvelles tentatives, etc. UN SEUL
// gabarit generique plutot qu'un par type d'incident — le sujet et les
// lignes portent deja le detail, dupliquer la mise en forme n'apporterait
// rien. `pied: 'interne'` (jamais 'createur'/'invite', qui n'auraient aucun
// sens pour un message qui ne parle pas d'un livre a son proprietaire).
function alerteAdmin({ sujet, lignes = [], details = [] }) {
  const titre = sujet;
  return {
    subject: `[Bookipix] ${sujet}`,
    html: habillage({
      titre,
      corps: lignes.map((l) => `<p style="margin:0 0 12px;">${echapper(l)}</p>`).join(''),
      details,
      pied: 'interne'
    }),
    text: texteDe({ titre, lignes, details })
  };
}

function essai({ destinataire, lang = 'fr' }) {
  const en = lang === 'en';
  const titre = en ? 'Your emails are working' : 'Vos emails fonctionnent';
  const lignes = en ? [
    'If you are reading this message, Bookipix can send emails on your behalf.',
    `Sent to ${destinataire}.`
  ] : [
    'Si vous lisez ce message, Bookipix peut envoyer des emails en votre nom.',
    `Envoyé à ${destinataire}.`
  ];
  return {
    subject: en ? 'Bookipix — test send' : 'Bookipix — test d’envoi',
    html: habillage({ titre, corps: lignes.map((l) => `<p style="margin:0 0 12px;">${echapper(l)}</p>`).join(''), lang }),
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
  factureEmise,
  pdfPret,
  etapeDeFabrication,
  alerteAdmin,
  essai,
  ETAPES,
  prix
};
