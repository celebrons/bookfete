// frontend/src/components/legal/exemplesData.js
//
// Contenu de la page "Exemples" v2 (refonte 2026-10-10, a partir de
// l'artefact Claude "Bookipix Exemples") : 4 albums fictifs complets (30
// pages chacun), un par format reel, utilisant TOUTES les mises en page de
// l'atelier. Jamais presentes comme venant d'un vrai client (meme principe
// que la v1 de cette page) — uniquement pour montrer, en conditions reelles,
// ce qu'un album compose avec Bookipix peut donner.
//
// Photos : vraies photos libres de droits (Wikimedia Commons, licences
// CC0/CC BY/CC BY-SA — voir le credit en pied de page), remplacant les
// illustrations procedurales de l'artefact d'origine. Un petit nombre de
// photos par album (6 environ), reutilisees plusieurs fois sur les 30 pages
// — exactement comme l'artefact reutilisait chaque "genre" d'illustration
// plusieurs fois plutot que d'en generer une par emplacement.
const PHOTO_BASE = '/images/exemples-stock/';
const ph = (nom) => `${PHOTO_BASE}${nom}.jpg`;

// Un jeu de photos par format, indexe par le meme nom de "genre" que
// l'artefact (peaks/night/sea/... ) pour garder son systeme de cycle tel
// quel (voir buildAlbum: A.kinds[c % A.kinds.length]).
export const PHOTOS = {
  carre: {
    peaks: ph('montagne1'), night: ph('aurore1'), sea: ph('plage1'),
    road: ph('chemin1'), town: ph('ville1'), forest: ph('foret1')
  },
  paysage: {
    flowers: ph('jardin1'), arch: ph('mariage-ceremonie1'), bokeh: ph('mariage-fete1'),
    group: ph('famille1'), rings: ph('mariage-alliances1'), balloons: ph('fete1')
  },
  portrait: {
    rainbow: ph('bebe1'), balloons: ph('fete1'), moon: ph('aurore1'),
    flowers: ph('jardin1'), group: ph('famille1')
  },
  grand: {
    road: ph('chemin1'), dunes: ph('desert1'), peaks: ph('montagne1'),
    sea: ph('plage1'), town: ph('ville1'), night: ph('aurore1')
  }
};

export const FORMATS = [
  {
    id: 'carre', name: 'Carré', size: '21 × 21 cm', ratio: 1,
    album: {
      title: 'Islande, huit jours', sub: 'Août 2026', theme: 'Voyage entre amis',
      kinds: ['peaks', 'night', 'sea', 'road', 'town', 'forest'], pano: ['peaks', 'sea'],
      people: [
        { id: 'camille', name: 'Camille', ini: 'C', color: '#d9482d' },
        { id: 'marc', name: 'Marc', ini: 'M', color: '#0b8a7b' },
        { id: 'ines', name: 'Inès', ini: 'I', color: '#7b5cf0' },
        { id: 'lea', name: 'Léa', ini: 'L', color: '#b98300' },
        { id: 'tom', name: 'Tom', ini: 'T', color: '#2f7de1' }
      ],
      tx: {
        dedT: 'Pour', ded: 'les huit jours où la météo a changé toutes les dix minutes, et où personne ne s\'est plaint.',
        ch1: { n: 'Chapitre 1', t: 'Reykjavik et la route du sud' }, ch2: { n: 'Chapitre 2', t: 'Le grand nord' },
        caps: ['Première cascade, premier fou rire.', 'Dîner à 23 h, il fait encore jour.', 'Plage de sable noir, vent de face.'],
        full: ['Les aurores n\'étaient pas prévues.', 'Fin de la route, début des souvenirs.'],
        tp: [
          { t: 'Jour 3, le glacier', p: 'On a marché deux heures sur la langue de glace. Marc a perdu un gant, Inès a trouvé une grotte bleue, Tom a tout filmé à l\'envers.', who: 'marc' },
          { t: 'Jour 6, les sources chaudes', p: 'Quarante degrés dans l\'eau, six dehors. Le meilleur moment du voyage, selon le vote à main levée du soir.', who: 'ines' }
        ],
        q: [
          { t: 'On a roulé 1 400 km et il n\'y a eu qu\'une seule dispute, à propos de la playlist.', who: 'lea' },
          { t: 'Les aurores n\'étaient pas prévues. Elles sont venues quand même.', who: 'camille' }
        ],
        note: ['Jour 4 !', 'Sur la route'], back: 'Islande, août 2026'
      }
    }
  },
  {
    id: 'paysage', name: 'Paysage', size: '30 × 21 cm', ratio: 30 / 21,
    album: {
      title: 'Sarah & Hugo', sub: 'Le mariage · 20 septembre 2026', theme: 'Mariage',
      kinds: ['flowers', 'arch', 'bokeh', 'group', 'rings', 'balloons'], pano: ['bokeh', 'flowers'],
      people: [
        { id: 'sarah', name: 'Sarah', ini: 'S', color: '#d4476b' },
        { id: 'hugo', name: 'Hugo', ini: 'H', color: '#2f7de1' },
        { id: 'claire', name: 'Claire', ini: 'C', color: '#0b8a7b' },
        { id: 'julien', name: 'Julien', ini: 'J', color: '#7b5cf0' },
        { id: 'jean', name: 'Papi Jean', ini: 'P', color: '#b98300' }
      ],
      tx: {
        dedT: 'À tous ceux', ded: 'qui ont dansé jusqu\'à la dernière chanson.',
        ch1: { n: 'Première partie', t: 'La cérémonie' }, ch2: { n: 'Deuxième partie', t: 'La fête' },
        caps: ['Le moment où Hugo a vu Sarah.', 'Le bouquet, juste avant qu\'il ne vole.', 'Papi Jean sur la piste, évidemment.'],
        full: ['Le soleil a attendu la fin des vœux.', 'La dernière danse.'],
        tp: [
          { t: 'Le discours du témoin', p: 'Julien avait promis cinq minutes, il en a pris douze. Personne n\'a regardé sa montre. Les photos viennent de la table 4, qui a tout capturé.', who: 'julien' },
          { t: 'Le gâteau', p: 'Trois étages, un fraisier, et une bougie que Papi Jean a voulu allumer lui-même.', who: 'claire' }
        ],
        q: [
          { t: 'On voulait un mariage simple. On a eu cent trente témoins de notre bonheur.', who: 'sarah' },
          { t: 'Merci d\'avoir pris des photos à notre place pendant qu\'on dansait.', who: 'hugo' }
        ],
        note: ['Table 4 !', 'Premier slow'], back: 'Sarah & Hugo, 20 septembre 2026'
      }
    }
  },
  {
    id: 'portrait', name: 'Portrait', size: '21 × 30 cm', ratio: 21 / 30,
    album: {
      title: 'Louise', sub: 'Les premiers mois', theme: 'Naissance',
      kinds: ['rainbow', 'balloons', 'moon', 'flowers', 'group'], pano: ['flowers', 'rainbow'],
      people: [
        { id: 'papa', name: 'Papa', ini: 'P', color: '#2f7de1' },
        { id: 'maman', name: 'Maman', ini: 'M', color: '#d4476b' },
        { id: 'mamie', name: 'Mamie Odile', ini: 'O', color: '#b98300' },
        { id: 'leo', name: 'Tonton Léo', ini: 'L', color: '#0b8a7b' }
      ],
      tx: {
        dedT: 'Pour Louise', ded: 'pour qu\'elle sache combien on l\'attendait.',
        ch1: { n: 'Chapitre 1', t: 'Les premières semaines' }, ch2: { n: 'Chapitre 2', t: 'Les premiers sourires' },
        caps: ['Premier bain, premières larmes (les nôtres).', 'La couverture de Mamie Odile.', 'Dix doigts, dix orteils, un bonnet trop grand.'],
        full: ['Dimanche, jour de câlins.', 'Elle dort, on la regarde.'],
        tp: [
          { t: 'Le premier mois', p: 'Les nuits sont courtes, les photos sont nombreuses. Mamie a tout tricoté, Tonton Léo a tout photographié.', who: 'papa' },
          { t: 'Premier sourire', p: 'Un mardi, 7 h 40. Papa jure que c\'était pour lui. Maman a la photo.', who: 'leo' }
        ],
        q: [
          { t: 'Elle tient mon doigt comme si elle ne voulait plus jamais le lâcher.', who: 'maman' },
          { t: 'Mes petits-enfants m\'ont appris qu\'on pouvait aimer plus fort chaque jour.', who: 'mamie' }
        ],
        note: ['Dodo', '7 h 40'], back: 'Louise, née au printemps 2026'
      }
    }
  },
  {
    id: 'grand', name: 'Grand carré', size: '30 × 30 cm', ratio: 1,
    album: {
      title: 'Ouest américain', sub: 'Road trip · trois semaines', theme: 'Road trip',
      kinds: ['road', 'dunes', 'peaks', 'sea', 'town', 'night'], pano: ['dunes', 'road'],
      people: [
        { id: 'nina', name: 'Nina', ini: 'N', color: '#d4476b' },
        { id: 'sam', name: 'Sam', ini: 'S', color: '#2f7de1' },
        { id: 'yanis', name: 'Yanis', ini: 'Y', color: '#0b8a7b' },
        { id: 'chloe', name: 'Chloé', ini: 'C', color: '#7b5cf0' }
      ],
      tx: {
        dedT: 'À la voiture', ded: 'de location, qui n\'est jamais tombée en panne. Presque.',
        ch1: { n: 'Chapitre 1', t: 'Désert et canyons' }, ch2: { n: 'Chapitre 2', t: 'La route de la côte' },
        caps: ['Kilomètre 2 400, toujours pas de réseau.', 'Lever de soleil à 4 h 50, pour cinq minutes de magie.', 'Le diner où Yanis a commandé trois fois le même burger.'],
        full: ['Route 1, fenêtres ouvertes.', 'Dernier coucher de soleil.'],
        tp: [
          { t: 'Le canyon au petit matin', p: 'On est partis avant tout le monde. Chloé a pris la photo de couverture ici, le téléphone posé sur un rocher.', who: 'chloe' },
          { t: 'Les derniers kilomètres', p: 'La route longeait l\'océan sur 200 km. On a roulé fenêtres ouvertes, en silence, pour une fois.', who: 'yanis' }
        ],
        q: [
          { t: 'Le plus beau paysage, c\'était l\'arrière de la voiture, avec tout le monde endormi.', who: 'sam' },
          { t: 'Trois semaines, quatre amis, un seul coffre. On a réussi.', who: 'nina' }
        ],
        note: ['4 h 50', 'Route 1'], back: 'Road trip, ouest américain'
      }
    }
  }
];

export const LAY = {
  cover: 'Couverture', ded: 'Dédicace', chap: 'Titre de chapitre', pano: 'Double page',
  four: '4 photos', three: '3 photos', six: '6 photos', two: '2 photos',
  cap: 'Photo + légende', tp: 'Texte + photo', full: 'Pleine page', quote: 'Citation',
  collage: 'Collage', thanks: 'Remerciements', back: '4ème de couverture'
};
export const LAST = 29;

// ---------- Construction des 30 pages d'un album --------------------------
// Port direct de la logique de l'artefact (meme sequence de mises en page,
// meme cycle sur les "genres" de photo) — seule differe la source de
// l'image (PHOTOS[fmt.id][genre] au lieu d'un generateur SVG).
export function buildAlbum(fmt) {
  const A = fmt.album, T = A.tx, people = A.people, n = people.length;
  const photos = PHOTOS[fmt.id];
  let c = 0;
  const f = () => {
    const kind = A.kinds[c % A.kinds.length];
    const o = { kind, url: photos[kind], by: people[(c * 3 + 1) % n].id };
    c += 1;
    return o;
  };
  const pano = (k) => {
    const kind = A.pano[k];
    return { kind, url: photos[kind], by: people[(k + 1) % n].id };
  };
  const fs = (k) => Array.from({ length: k }, f);
  const pg = [];
  pg[0] = { lay: 'cover', ph: f(), title: A.title, sub: A.sub };
  pg[1] = { lay: 'ded', t: T.dedT, text: T.ded };
  pg[2] = { lay: 'chap', ph: f(), n: T.ch1.n, t: T.ch1.t };
  const p1 = pano(0); pg[3] = { lay: 'pano', side: 'L', ph: p1 }; pg[4] = { lay: 'pano', side: 'R', ph: p1 };
  pg[5] = { lay: 'four', phs: fs(4) };
  pg[6] = { lay: 'cap', ph: f(), c: T.caps[0] };
  pg[7] = { lay: 'three', phs: fs(3) };
  pg[8] = { lay: 'tp', ph: f(), ...T.tp[0] };
  pg[9] = { lay: 'six', phs: fs(6) };
  pg[10] = { lay: 'full', ph: f(), c: T.full[0] };
  pg[11] = { lay: 'two', phs: fs(2) };
  pg[12] = { lay: 'quote', ...T.q[0] };
  pg[13] = { lay: 'chap', ph: f(), n: T.ch2.n, t: T.ch2.t };
  pg[14] = { lay: 'four', phs: fs(4) };
  pg[15] = { lay: 'cap', ph: f(), c: T.caps[1] };
  pg[16] = { lay: 'collage', phs: fs(4), note: T.note[0] };
  pg[17] = { lay: 'three', phs: fs(3) };
  pg[18] = { lay: 'tp', ph: f(), ...T.tp[1] };
  const p2 = pano(1); pg[19] = { lay: 'pano', side: 'L', ph: p2 }; pg[20] = { lay: 'pano', side: 'R', ph: p2 };
  pg[21] = { lay: 'six', phs: fs(6) };
  pg[22] = { lay: 'two', phs: fs(2) };
  pg[23] = { lay: 'full', ph: f(), c: T.full[1] };
  pg[24] = { lay: 'quote', ...T.q[1] };
  pg[25] = { lay: 'collage', phs: fs(4), note: T.note[1] };
  pg[26] = { lay: 'four', phs: fs(4) };
  pg[27] = { lay: 'cap', ph: f(), c: T.caps[2] };
  pg[28] = { lay: 'thanks' };
  pg[29] = { lay: 'back', ph: f() };

  // Decompte des contributions et pages par contributeur (alimente la
  // legende, le classement "Qui a ajoute quoi" et le saut direct au clic
  // sur un prenom).
  const counts = {}, first = {}, pageSets = pg.map(() => new Set());
  people.forEach((p) => { counts[p.id] = { photos: 0, texts: 0 }; });
  const seen = new Set();
  pg.forEach((s, i) => {
    [s.ph, ...(s.phs || [])].filter(Boolean).forEach((o) => {
      pageSets[i].add(o.by);
      if (!seen.has(o)) { seen.add(o); counts[o.by].photos += 1; }
    });
    if (s.lay === 'quote' || s.lay === 'tp') { pageSets[i].add(s.who); counts[s.who].texts += 1; }
  });
  people.forEach((p) => { first[p.id] = pg.findIndex((s, i) => i > 0 && pageSets[i].has(p.id)); });
  fmt.pages = pg; fmt.counts = counts; fmt.first = first; fmt.pageSets = pageSets;
}

FORMATS.forEach(buildAlbum);
export const personOf = (fmt, id) => fmt.album.people.find((p) => p.id === id);

// ---------- Rendu HTML d'une page ------------------------------------------
// Retourne une CHAINE HTML (pas du JSX) : ces pages sont injectees via
// innerHTML puis prises en charge directement par page-flip (bibliotheque
// qui gere elle-meme le DOM de ses pages) — exactement le meme choix que
// l'artefact d'origine, indispensable pour que page-flip fonctionne.
export function pageHTML(s, i, fmt, opt = {}) {
  const side = i % 2 ? 'ex-pl' : 'ex-pr';
  const person = (id) => personOf(fmt, id);
  const bgs = (o) => `background-image:url('${o.url}')`;
  const badge = (o) => `<span class="ex-by" style="--c:${person(o.by).color}">${person(o.by).ini}</span>`;
  const ph = (o, extra = '') => `<div class="ex-ph" data-by="${o.by}" style="${bgs(o)}${extra}">${badge(o)}</div>`;
  const big = (o, cls, inner = '') => `<div class="ex-in ex-ph ${cls}" data-by="${o.by}" style="${bgs(o)}">${inner}${badge(o)}</div>`;
  let h = '';
  switch (s.lay) {
    case 'cover':
      h = big(s.ph, 'ex-cover', `<div class="ex-cv-top">Album collaboratif</div><div class="ex-cv-bot"><h3>${s.title}</h3><p>${s.sub}</p><div class="ex-avs">${fmt.album.people.map((p) => `<i style="--c:${p.color}">${p.ini}</i>`).join('')}</div></div>`);
      break;
    case 'ded':
      h = `<div class="ex-in ex-ded"><div class="ex-orn"></div><h4>${s.t}</h4><p>${s.text}</p><div class="ex-orn"></div></div>`;
      break;
    case 'chap':
      h = big(s.ph, 'ex-chap', `<div class="ex-ct"><span>${s.n}</span><h4>${s.t}</h4></div>`);
      break;
    case 'pano':
      h = `<div class="ex-in ex-ph ex-pano ex-pano${s.side}" data-by="${s.ph.by}" style="${bgs(s.ph)}">${badge(s.ph)}</div>`;
      break;
    case 'four': case 'three': case 'six': case 'two':
      h = `<div class="ex-in ex-grid ex-${s.lay}">${s.phs.map((o) => ph(o)).join('')}</div>`;
      break;
    case 'cap':
      h = `<div class="ex-in ex-cap"><div class="ex-frame">${ph(s.ph)}</div><p class="ex-c">${s.c}</p></div>`;
      break;
    case 'tp': {
      const w = person(s.who);
      h = `<div class="ex-in ex-tp">${ph(s.ph)}<div class="ex-tx" data-by="${s.who}"><h4>${s.t}</h4><p>${s.p}</p><span class="ex-wr" style="--c:${w.color}"><i>${w.ini}</i>Texte de ${w.name}</span></div></div>`;
      break;
    }
    case 'full':
      h = big(s.ph, 'ex-full', `<div class="ex-fc">${s.c}</div>`);
      break;
    case 'quote': {
      const w = person(s.who);
      h = `<div class="ex-in ex-quote" data-by="${s.who}"><div class="ex-qm">“</div><p class="ex-qt">${s.t}</p><div class="ex-qa"><i style="--c:${w.color}">${w.ini}</i>${w.name}</div></div>`;
      break;
    }
    case 'collage': {
      const pos = [
        'left:5%;top:9%;width:46%;height:36%;transform:rotate(-3deg)',
        'left:47%;top:15%;width:44%;height:32%;transform:rotate(2.5deg)',
        'left:8%;top:51%;width:38%;height:36%;transform:rotate(2deg)',
        'left:43%;top:53%;width:49%;height:34%;transform:rotate(-2deg)'
      ];
      h = `<div class="ex-in ex-collage">${s.phs.map((o, k) => ph(o, ';' + pos[k])).join('')}<div class="ex-note">${s.note}</div></div>`;
      break;
    }
    case 'thanks':
      h = `<div class="ex-in ex-thanks"><h4>Merci</h4><p>À tous ceux qui ont rempli cet album.</p><ul>${fmt.album.people.map((p) => {
        const cnt = fmt.counts[p.id];
        return `<li><i style="--c:${p.color}">${p.ini}</i><b>${p.name}</b><span>${cnt.photos} photo${cnt.photos > 1 ? 's' : ''}${cnt.texts ? ` · ${cnt.texts} texte${cnt.texts > 1 ? 's' : ''}` : ''}</span></li>`;
      }).join('')}</ul><small>Un seul album, commandé ensemble.</small></div>`;
      break;
    case 'back':
      h = `<div class="ex-in ex-back"><div class="ex-bk" style="${bgs(s.ph)}"></div><p>${fmt.album.tx.back}</p><div class="ex-bc"></div><span class="ex-mk">Fait avec Bookipix</span></div>`;
      break;
    default:
      h = '';
  }
  const num = (i > 0 && i < LAST) ? `<span class="ex-num">${i}</span>` : '';
  const lbl = opt.bare ? '' : `<span class="ex-lbl">${LAY[s.lay]}</span>`;
  return `<div class="ex-pg ${side}${fmt.ratio > 1.2 ? ' ex-wide' : ''}">${h}${num}${lbl}</div>`;
}
