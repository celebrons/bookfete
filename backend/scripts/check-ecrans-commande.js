// Les ecrans de commande sont-ils REELLEMENT lisibles, ou seulement corriges
// dans le code ?
//
//   node scripts/check-ecrans-commande.js
//   node scripts/check-ecrans-commande.js --url https://78.232.5.181.sslip.io
//
// Ecrit le 2026-09-19, apres trois retours de suite sur la meme chose : une
// fenetre « pas affichee completement », un bouton « Continuer » introuvable,
// des prix qu'il fallait selectionner pour connaitre. Ces trois defauts sont
// des defauts de MISE EN PAGE : ni les tests unitaires ni une lecture du code
// ne les voient. Il faut ouvrir la page, dans un navigateur, a une vraie
// taille d'ecran, et mesurer.
//
// Le script ne passe pas par l'application : il charge la FEUILLE DE STYLE
// REELLEMENT SERVIE par le site, y pose la meme structure HTML que les
// composants React, et mesure. C'est ce qui permet de le lancer sans compte,
// sans livre finalise et sans commande — donc de le relancer a chaque
// deploiement.
//
// Ce qu'il verifie, et pourquoi :
//   1. Fenetre de recapitulatif avant commande : sur un petit ecran et avec
//      beaucoup de photos signalees, les deux boutons du bas doivent RESTER
//      visibles. C'est le seul chemin vers le paiement.
//   2. « Continuer » : doit se trouver SOUS le panneau, pas a cote, et
//      aligne sur son bord droit.
//   3. Choix du produit : le prix doit etre A GAUCHE du titre, et chaque
//      produit doit porter son detail.

const fs = require('fs');
const os = require('os');
const path = require('path');
const puppeteer = require('puppeteer');

const args = process.argv.slice(2);
const valeur = (nom, defaut) => {
  const i = args.indexOf(nom);
  return i > -1 ? args[i + 1] : defaut;
};
const BASE = String(valeur('--url', 'https://78.232.5.181.sslip.io')).replace(/\/$/, '');

let echecs = 0;
const verifier = (libelle, ok, detail) => {
  console.log(`  ${ok ? 'OK  ' : 'ECHEC'}  ${libelle}${detail ? ` — ${detail}` : ''}`);
  if (!ok) echecs += 1;
};

// Retrouve la feuille de style reellement servie (son nom porte une empreinte
// qui change a chaque build : la deviner reviendrait a tester un fichier qui
// n'existe plus).
async function trouverLaFeuilleDeStyle() {
  const reponse = await fetch(`${BASE}/`);
  const html = await reponse.text();
  const trouve = html.match(/href="(\/static\/css\/[^"]+\.css)"/);
  if (!trouve) throw new Error('Aucune feuille de style trouvee dans la page d accueil.');
  return `${BASE}${trouve[1]}`;
}

const lignesDeDoublon = (nombre) => Array.from({ length: nombre }, (_, i) => `
  <li class="pq-recap-item">
    <span class="pq-recap-thumb pq-recap-thumb-empty"></span>
    <span class="pq-recap-item-text">
      <span class="pq-recap-item-page">Page ${i + 1}</span>
      <span class="pq-recap-item-label">Photo un peu juste pour cette taille</span>
    </span>
  </li>`).join('');

const FENETRE_RECAP = (nombre) => `
<div class="pq-recap-backdrop">
  <div class="pq-recap-modal">
    <div class="pq-recap-head">
      <h2 class="pq-recap-title">${nombre} photos meritent votre attention</h2>
      <button class="pq-recap-close">x</button>
    </div>
    <div class="pq-recap-body">
      <p class="pq-recap-intro">Certaines photos ont une resolution trop faible.</p>
      <ul class="pq-recap-list">${lignesDeDoublon(nombre)}</ul>
    </div>
    <div class="pq-recap-actions">
      <button class="btn btn-outline" id="revoir">Revoir ces pages</button>
      <button class="btn btn-primary" id="continuer">Continuer quand meme</button>
    </div>
  </div>
</div>`;

const ECRAN_PRODUIT = `
<div class="orders-grid" style="padding:20px">
  <article class="orders-panel" id="panneau">
    <h2>Choix du produit</h2>
    <div class="product-choice-grid">
      <button class="product-choice is-active" id="carte-pdf">
        <span class="product-choice-price">39,00 EUR<span class="product-choice-price-unit">par exemplaire</span></span>
        <span class="product-choice-text">
          <strong id="titre-pdf">PDF seul</strong>
          <span class="product-choice-note">Rien n est expedie</span>
          <span class="product-choice-details">
            <span class="product-choice-detail">Le livre entier en fichier PDF</span>
            <span class="product-choice-detail">Telechargeable des le paiement</span>
          </span>
        </span>
      </button>
      <button class="product-choice">
        <span class="product-choice-price">99,00 EUR<span class="product-choice-price-unit">par exemplaire</span></span>
        <span class="product-choice-text">
          <strong>Livre imprime</strong>
          <span class="product-choice-note">Imprime et livre chez vous</span>
          <span class="product-choice-details">
            <span class="product-choice-detail">Imprime et relie par notre imprimeur</span>
          </span>
        </span>
      </button>
    </div>
  </article>
  <div class="orders-step-nav" id="barre">
    <button class="btn btn-outline">Retour</button>
    <button class="btn btn-primary" id="continuer">Continuer</button>
  </div>
</div>`;

// Ouvre la VRAIE page du site et y pose la maquette.
//
// Poser la maquette dans une page vide qui se contente de LIER la feuille
// de style du site ne donne pas le meme rendu : cette feuille est alors
// d'une autre origine, et le resultat mesure n'est plus celui du site (un
// bouton dore y ressortait beige, constate le 2026-09-20). On garde donc
// le document reel et on ne remplace que son contenu.
async function poserLaMaquette(onglet, corps, fond) {
  if (onglet.url() === 'about:blank') {
    await onglet.goto(BASE, { waitUntil: 'networkidle2' });
  }
  await onglet.evaluate((html, couleur) => {
    document.body.innerHTML = html;
    document.body.style.margin = '0';
    document.body.style.padding = '24px';
    if (couleur) document.body.style.background = couleur;
  }, corps, fond || null);
}

async function mesurer(page, selecteur) {
  return page.$eval(selecteur, (el) => {
    const r = el.getBoundingClientRect();
    return { top: r.top, left: r.left, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
  });
}

// Chrome "assombrit automatiquement" certains elements qu il juge trop
// clairs — une carte blanche, typiquement. Le drapeau de lancement ne
// suffit pas : il faut le dire a l onglet. Sans ca, un bouton dore est
// mesure et capture en beige grisatre, et on verifie l interpretation de
// Chrome au lieu de verifier le site (constate le 2026-09-20 : le meme
// bouton sortait dore dans un panneau et gris dans une fenetre modale).
async function neutraliserLeModeSombre(onglet) {
  const session = await onglet.createCDPSession();
  await session.send("Emulation.setAutoDarkModeOverride", { enabled: false });
  await onglet.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "light" }]);
}

async function main() {
  console.log(`\nEcrans de commande sur ${BASE}\n`);
  const css = await trouverLaFeuilleDeStyle();
  console.log(`  feuille de style servie : ${css.replace(BASE, '')}\n`);

  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'celebrons-ecrans-'));
  const navigateur = await puppeteer.launch({
    headless: 'new',
    // Chrome peut 'assombrir automatiquement' une page qu'il juge claire :
    // les couleurs mesurees ne sont alors plus celles du site (constate le
    // 2026-09-20 sur un bouton dore rendu beige). On le desactive, sinon on
    // verifie l'interpretation de Chrome au lieu de verifier le site.
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-features=WebContentsForceDark', `--user-data-dir=${dossier}`]
  });

  try {
    // --- 1. La fenetre avant commande, sur un ecran volontairement court ---
    const page = await navigateur.newPage();
    await neutraliserLeModeSombre(page);
    await page.setViewport({ width: 1280, height: 620 });
    await poserLaMaquette(page, FENETRE_RECAP(14));

    const fenetre = await mesurer(page, '.pq-recap-modal');
    const boutonContinuer = await mesurer(page, '#continuer');
    const corps = await page.$eval('.pq-recap-body', (el) => ({
      defile: el.scrollHeight > el.clientHeight + 1
    }));

    verifier(
      'la fenetre tient dans la hauteur de l ecran',
      fenetre.bottom <= 620 + 1,
      `bas de la fenetre a ${Math.round(fenetre.bottom)} px pour 620 px d ecran`
    );
    verifier(
      '« Continuer quand meme » est visible sans faire defiler',
      boutonContinuer.bottom <= 620 + 1 && boutonContinuer.top >= 0,
      `bouton entre ${Math.round(boutonContinuer.top)} et ${Math.round(boutonContinuer.bottom)} px`
    );
    verifier(
      'c est bien la LISTE qui defile, pas la fenetre entiere',
      corps.defile,
      corps.defile ? '14 photos, liste plus haute que sa zone' : 'la liste ne defile pas'
    );

    // Et sur un telephone, ou la place manque vraiment.
    await page.setViewport({ width: 390, height: 640 });
    await poserLaMaquette(page, FENETRE_RECAP(14));
    const boutonTelephone = await mesurer(page, '#continuer');
    verifier(
      'sur telephone aussi, le bouton reste a l ecran',
      boutonTelephone.bottom <= 640 + 1 && boutonTelephone.top >= 0,
      `bouton entre ${Math.round(boutonTelephone.top)} et ${Math.round(boutonTelephone.bottom)} px`
    );

    // --- 2 et 3. L ecran de choix du produit -------------------------------
    await page.setViewport({ width: 1280, height: 900 });
    await poserLaMaquette(page, ECRAN_PRODUIT);

    const panneau = await mesurer(page, '#panneau');
    const barre = await mesurer(page, '#barre');
    const continuer = await mesurer(page, '#barre #continuer');

    verifier(
      '« Continuer » est SOUS le panneau, pas a cote',
      barre.top >= panneau.bottom - 1,
      `barre a ${Math.round(barre.top)} px, panneau jusqu a ${Math.round(panneau.bottom)} px`
    );
    verifier(
      'la barre partage le bord droit du panneau (le bouton tient a ce qu il valide)',
      Math.abs(barre.right - panneau.right) < 2,
      `barre jusqu a ${Math.round(barre.right)} px, panneau jusqu a ${Math.round(panneau.right)} px`
    );
    verifier(
      '« Continuer » est a droite',
      continuer.right >= barre.right - 4,
      `bouton jusqu a ${Math.round(continuer.right)} px, barre jusqu a ${Math.round(barre.right)} px`
    );
    verifier(
      '« Continuer » est mis en evidence (plus large qu un bouton ordinaire)',
      continuer.width >= 170,
      `${Math.round(continuer.width)} px de large`
    );

    const prix = await mesurer(page, '#carte-pdf .product-choice-price');
    const titre = await mesurer(page, '#titre-pdf');
    const details = await page.$$eval('#carte-pdf .product-choice-detail', (els) => els.length);

    verifier(
      'le prix est DEVANT le produit (a sa gauche)',
      prix.right <= titre.left + 1,
      `prix jusqu a ${Math.round(prix.right)} px, titre a partir de ${Math.round(titre.left)} px`
    );
    verifier(
      'le prix est sur la meme ligne que le titre (pas au-dessus)',
      Math.abs(prix.top - titre.top) < 24,
      `prix a ${Math.round(prix.top)} px, titre a ${Math.round(titre.top)} px`
    );
    verifier('le produit est detaille', details >= 2, `${details} lignes de detail`);
  } finally {
    await navigateur.close();
    fs.rmSync(dossier, { recursive: true, force: true });
  }

  console.log(`\nRESULTAT : ${echecs === 0 ? 'OK — les trois ecrans sont lisibles' : `${echecs} ECHEC(S)`}\n`);
  process.exit(echecs === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(`\nECHEC : ${error.message}\n`);
  process.exit(1);
});
