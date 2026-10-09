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
// illustrations procedurales de l'artefact d'origine.
//
// 2026-10-11 (chantier bilingue) : tout le texte narratif (titres,
// dedicaces, citations, prenoms des contributeurs...) vient desormais de
// locales/{fr,en}/exemples.json via la fonction `t` passee a buildFormats —
// plus rien de fixe en francais ici. Les ids/couleurs/photos des
// contributeurs restent structurels (identiques dans les deux langues),
// seul leur NOM affiche change ; l'initiale de l'avatar se deduit du nom
// traduit (voir `initiale`) plutot que d'etre fixee a part, pour rester
// coherente meme quand la traduction change le mot (ex. "Papi Jean" ->
// "Grandpa Jean").
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

// Structure fixe (jamais traduite) : ids, couleurs, genres de photo cycles,
// panoramas. Tout le texte vient de `t('exemples.formats.<id>...')`.
const STRUCTURE = [
  {
    id: 'carre', ratio: 1, size: '21 × 21 cm',
    kinds: ['peaks', 'night', 'sea', 'road', 'town', 'forest'], pano: ['peaks', 'sea'],
    // tpWho/qWho : qui a ecrit chaque texte+photo / citation — un choix
    // narratif structurel, identique dans les deux langues (seul le TEXTE
    // vient de la traduction).
    tpWho: ['marc', 'ines'], qWho: ['lea', 'camille'],
    people: [
      { id: 'camille', color: '#d9482d' }, { id: 'marc', color: '#0b8a7b' },
      { id: 'ines', color: '#7b5cf0' }, { id: 'lea', color: '#b98300' }, { id: 'tom', color: '#2f7de1' }
    ]
  },
  {
    id: 'paysage', ratio: 30 / 21, size: '30 × 21 cm',
    kinds: ['flowers', 'arch', 'bokeh', 'group', 'rings', 'balloons'], pano: ['bokeh', 'flowers'],
    tpWho: ['julien', 'claire'], qWho: ['sarah', 'hugo'],
    people: [
      { id: 'sarah', color: '#d4476b' }, { id: 'hugo', color: '#2f7de1' }, { id: 'claire', color: '#0b8a7b' },
      { id: 'julien', color: '#7b5cf0' }, { id: 'jean', color: '#b98300' }
    ]
  },
  {
    id: 'portrait', ratio: 21 / 30, size: '21 × 30 cm',
    kinds: ['rainbow', 'balloons', 'moon', 'flowers', 'group'], pano: ['flowers', 'rainbow'],
    tpWho: ['papa', 'leo'], qWho: ['maman', 'mamie'],
    people: [
      { id: 'papa', color: '#2f7de1' }, { id: 'maman', color: '#d4476b' },
      { id: 'mamie', color: '#b98300' }, { id: 'leo', color: '#0b8a7b' }
    ]
  },
  {
    id: 'grand', ratio: 1, size: '30 × 30 cm',
    kinds: ['road', 'dunes', 'peaks', 'sea', 'town', 'night'], pano: ['dunes', 'road'],
    tpWho: ['chloe', 'yanis'], qWho: ['sam', 'nina'],
    people: [
      { id: 'nina', color: '#d4476b' }, { id: 'sam', color: '#2f7de1' },
      { id: 'yanis', color: '#0b8a7b' }, { id: 'chloe', color: '#7b5cf0' }
    ]
  }
];

const initiale = (nom) => (nom || '?').trim().charAt(0).toUpperCase();

export const LAST = 29;

// ---------- Construction des 4 albums dans la langue courante -------------
// Appelee a chaque chargement de page ET a chaque changement de langue (voir
// ExemplesLuxe.js) : `t` est deja namespace sur 'exemples' (useTranslation
// ('exemples')). Reconstruit tout depuis zero (le cout est negligeable : 4
// albums x 30 pages de donnees, pas de rendu).
export function buildFormats(t) {
  return STRUCTURE.map((s) => {
    const name = t(`formats.${s.id}.name`);
    const theme = t(`formats.${s.id}.theme`);
    const people = s.people.map((p) => ({ ...p, name: t(`formats.${s.id}.people.${p.id}`), ini: initiale(t(`formats.${s.id}.people.${p.id}`)) }));
    const A = {
      title: t(`formats.${s.id}.album.title`), sub: t(`formats.${s.id}.album.sub`), theme,
      kinds: s.kinds, pano: s.pano, people,
      tx: {
        dedT: t(`formats.${s.id}.album.dedT`), ded: t(`formats.${s.id}.album.ded`),
        ch1: { n: t(`formats.${s.id}.album.ch1n`), t: t(`formats.${s.id}.album.ch1t`) },
        ch2: { n: t(`formats.${s.id}.album.ch2n`), t: t(`formats.${s.id}.album.ch2t`) },
        caps: [t(`formats.${s.id}.album.cap1`), t(`formats.${s.id}.album.cap2`), t(`formats.${s.id}.album.cap3`)],
        full: [t(`formats.${s.id}.album.full1`), t(`formats.${s.id}.album.full2`)],
        tp: [
          { t: t(`formats.${s.id}.album.tp1t`), p: t(`formats.${s.id}.album.tp1p`), who: s.tpWho[0] },
          { t: t(`formats.${s.id}.album.tp2t`), p: t(`formats.${s.id}.album.tp2p`), who: s.tpWho[1] }
        ],
        q: [
          { t: t(`formats.${s.id}.album.q1`), who: s.qWho[0] }, { t: t(`formats.${s.id}.album.q2`), who: s.qWho[1] }
        ],
        note: [t(`formats.${s.id}.album.note1`), t(`formats.${s.id}.album.note2`)],
        back: t(`formats.${s.id}.album.back`)
      }
    };
    const fmt = { id: s.id, name, size: s.size, ratio: s.ratio, album: A };
    buildAlbum(fmt);
    return fmt;
  });
}

// ---------- Construction des 30 pages d'un album --------------------------
// Port direct de la logique de l'artefact (meme sequence de mises en page,
// meme cycle sur les "genres" de photo) — seule differe la source de
// l'image (PHOTOS[fmt.id][genre] au lieu d'un generateur SVG) et le texte
// (deja traduit dans A.tx par buildFormats ci-dessus).
function buildAlbum(fmt) {
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

export const personOf = (fmt, id) => fmt.album.people.find((p) => p.id === id);

// ---------- Rendu HTML d'une page ------------------------------------------
// Retourne une CHAINE HTML (pas du JSX) : ces pages sont injectees via
// innerHTML puis prises en charge directement par page-flip (bibliotheque
// qui gere elle-meme le DOM de ses pages) — exactement le meme choix que
// l'artefact d'origine, indispensable pour que page-flip fonctionne.
// `lay` (le libelle de chaque mise en page, deja traduit) est fourni par
// l'appelant plutot que recalcule ici, pour ne pas dupliquer l'appel a `t`.
export function pageHTML(s, i, fmt, lay, opt = {}) {
  const side = i % 2 ? 'ex-pl' : 'ex-pr';
  const person = (id) => personOf(fmt, id);
  const bgs = (o) => `background-image:url('${o.url}')`;
  const badge = (o) => `<span class="ex-by" style="--c:${person(o.by).color}">${person(o.by).ini}</span>`;
  const ph = (o, extra = '') => `<div class="ex-ph" data-by="${o.by}" style="${bgs(o)}${extra}">${badge(o)}</div>`;
  const big = (o, cls, inner = '') => `<div class="ex-in ex-ph ${cls}" data-by="${o.by}" style="${bgs(o)}">${inner}${badge(o)}</div>`;
  let h = '';
  switch (s.lay) {
    case 'cover':
      h = big(s.ph, 'ex-cover', `<div class="ex-cv-top">${opt.collabEyebrow || ''}</div><div class="ex-cv-bot"><h3>${s.title}</h3><p>${s.sub}</p><div class="ex-avs">${fmt.album.people.map((p) => `<i style="--c:${p.color}">${p.ini}</i>`).join('')}</div></div>`);
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
      h = `<div class="ex-in ex-tp">${ph(s.ph)}<div class="ex-tx" data-by="${s.who}"><h4>${s.t}</h4><p>${s.p}</p><span class="ex-wr" style="--c:${w.color}"><i>${w.ini}</i>${w.name}</span></div></div>`;
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
      h = `<div class="ex-in ex-thanks"><h4>${opt.thanksTitle || ''}</h4><p>${opt.thanksLead || ''}</p><ul>${fmt.album.people.map((p) => {
        const cnt = fmt.counts[p.id];
        const photoWord = opt.photoWord ? opt.photoWord(cnt.photos) : '';
        const textWord = cnt.texts && opt.textWord ? ` · ${opt.textWord(cnt.texts)}` : '';
        return `<li><i style="--c:${p.color}">${p.ini}</i><b>${p.name}</b><span>${cnt.photos} ${photoWord}${textWord}</span></li>`;
      }).join('')}</ul><small>${opt.thanksFooter || ''}</small></div>`;
      break;
    case 'back':
      h = `<div class="ex-in ex-back"><div class="ex-bk" style="${bgs(s.ph)}"></div><p>${fmt.album.tx.back}</p><div class="ex-bc"></div><span class="ex-mk">${opt.madeWith || 'Bookipix'}</span></div>`;
      break;
    default:
      h = '';
  }
  const num = (i > 0 && i < LAST) ? `<span class="ex-num">${i}</span>` : '';
  const lbl = opt.bare ? '' : `<span class="ex-lbl">${lay}</span>`;
  return `<div class="ex-pg ${side}${fmt.ratio > 1.2 ? ' ex-wide' : ''}">${h}${num}${lbl}</div>`;
}
