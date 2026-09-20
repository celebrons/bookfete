// Capture d'ecran des ecrans corriges, pour les REGARDER plutot que les
// supposer corrects.
//
//   node scripts/capture-ecrans.js            -> /tmp/ecran-*.png
//   node scripts/capture-ecrans.js --url ...  -> contre un autre site
//
// Meme principe que check-ecrans-commande.js : on charge la feuille de
// style REELLEMENT servie par le site et on y pose la meme structure que
// les composants React. Ca permet de voir des ecrans qui, autrement,
// demanderaient un compte, un livre fini, une commande payee et un envoi
// chez l'imprimeur.
//
// Les images ne sont pas versionnees : c'est un outil de regard, pas une
// reference de non-regression (ce role est tenu par check-ecrans-commande).

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
const SORTIE = String(valeur('--sortie', '/tmp'));

// --- Fenetre « ces photos sont deja dans votre livre » ---------------------
const vignette = (nom) => `<figure class="atelier-doublons-item">
<img src="data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="88" height="88"><rect width="88" height="88" fill="rgb(216,207,190)"/></svg>')}" alt="">
<figcaption>${nom}</figcaption></figure>`;

const DOUBLONS = `
<div class="atelier-modal-backdrop" style="position:static">
  <div class="atelier-modal atelier-doublons">
    <div class="atelier-modal-head">
      <h2 class="atelier-modal-title">Ces 4 photos sont déjà dans votre livre</h2>
      <button class="atelier-modal-close">&times;</button>
    </div>
    <p class="atelier-doublons-intro">Elles portent le même nom et la même taille que des photos déjà déposées. Votre sélection contient aussi <strong>6 photos nouvelles</strong>.</p>
    <div class="atelier-doublons-grid">
      ${vignette('IMG_20190812_154233.jpg')}${vignette('IMG_20190812_154240.jpg')}${vignette('plage-soir.jpg')}${vignette('lisboa-01.jpg')}
    </div>
    <div class="atelier-modal-actions">
      <button class="btn btn-outline">Annuler</button>
      <button class="btn btn-outline">Ajouter quand même</button>
      <button class="btn btn-primary">N’ajouter que les 6 nouvelles</button>
    </div>
    <p class="atelier-doublons-note">« Ajouter quand même » remet aussi les photos déjà présentes. « Annuler » n’ajoute rien du tout.</p>
  </div>
</div>`;

// --- Suivi apres paiement, commande « Pack » (deux volets) ----------------
const etape = (libelle, etat) => `<li class="tracking-step ${etat}"><span class="tracking-dot"></span><span class="tracking-label">${libelle}</span></li>`;

const FLECHE_BAS = '<svg class="btn-icone" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="m7 11 5 5 5-5"/><path d="M4 19h16"/></svg>';
const DEUX_FLECHES = '<svg class="btn-icone" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11a8 8 0 0 0-13.8-5.5L3 8.5"/><path d="M4 13a8 8 0 0 0 13.8 5.5L21 15.5"/><path d="M3 4v4.5h4.5"/><path d="M21 20v-4.5h-4.5"/></svg>';

const SUIVI = `
<div class="orders-grid">
<article class="orders-panel">
  <h2>Votre commande</h2>
  <div class="orders-result-grid">
    <div><span>Numero</span><strong>CMD-260920-XK4P2M-118</strong></div>
    <div><span>Statut</span><strong class="is-info">En production</strong></div>
  </div>
  <div class="tracking-panes is-double">
    <section class="tracking-pane">
      <h3 class="tracking-pane-title">Votre PDF</h3>
      <p class="tracking-ready"><span class="tracking-ready-dot"></span>PDF disponible</p>
      <div class="tracking-pane-actions">
        <button class="btn btn-primary">${FLECHE_BAS}Télécharger</button>
        <button class="btn btn-outline">${DEUX_FLECHES}Régénérer</button>
      </div>
    </section>
    <section class="tracking-pane">
      <h3 class="tracking-pane-title">Votre livre imprimé</h3>
      <p class="tracking-sent"><span class="tracking-ready-dot"></span>Reçu par l’imprimeur le 20 septembre à 14:32<span class="tracking-sent-ref">n° 17e804f9-4361-468c</span></p>
      <ol class="tracking-timeline">
        ${etape('Payée', 'is-done')}${etape('En file d’impression', 'is-done')}${etape('Chez l’imprimeur', 'is-current')}${etape('Imprimée', '')}${etape('Expédiée', '')}${etape('Livrée', '')}
      </ol>
      <p class="tracking-carrier">Livraison annoncée : entre le 24 septembre et le 29 septembre</p>
      <p class="tracking-freshness">Vérifié le 20 septembre à 14:41 · <button class="tracking-refresh">Vérifier maintenant</button></p>
    </section>
  </div>
</article>
</div>`;

async function trouverLaFeuilleDeStyle() {
  const reponse = await fetch(`${BASE}/`);
  const html = await reponse.text();
  const trouve = html.match(/href="(\/static\/css\/[^"]+\.css)"/);
  if (!trouve) throw new Error('Aucune feuille de style trouvee dans la page d accueil.');
  return `${BASE}${trouve[1]}`;
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

async function main() {
  const css = await trouverLaFeuilleDeStyle();
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'celebrons-capture-'));
  const navigateur = await puppeteer.launch({
    headless: 'new',
    // Chrome peut 'assombrir automatiquement' une page qu'il juge claire :
    // les couleurs mesurees ne sont alors plus celles du site (constate le
    // 2026-09-20 sur un bouton dore rendu beige). On le desactive, sinon on
    // verifie l'interpretation de Chrome au lieu de verifier le site.
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-features=WebContentsForceDark', `--user-data-dir=${dossier}`]
  });

  try {
    const onglet = await navigateur.newPage();
    await neutraliserLeModeSombre(onglet);

    await onglet.setViewport({ width: 640, height: 520 });
    await poserLaMaquette(onglet, DOUBLONS, '#efe9dd');
    await onglet.screenshot({ path: path.join(SORTIE, 'ecran-doublons.png') });

    await onglet.setViewport({ width: 860, height: 520 });
    await poserLaMaquette(onglet, SUIVI, '#f6f3ee');
    await onglet.screenshot({ path: path.join(SORTIE, 'ecran-suivi.png') });
  } finally {
    await navigateur.close();
    fs.rmSync(dossier, { recursive: true, force: true });
  }

  console.log(`captures ecrites dans ${SORTIE} (feuille de style : ${css.replace(BASE, '')})`);
}

main().catch((error) => { console.error(`ECHEC : ${error.message}`); process.exit(1); });
