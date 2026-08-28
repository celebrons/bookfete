// Prototype du validateur deterministe de l'etape F — ZERO appel IA.
// Preuve de faisabilite pour l'etape 06 du plan de migration.
// Usage: node docs/demo-v2/valider.js
'use strict';

const memoire = require('./03-memoire-editoriale.json');
const plan = require('./04-plan.json');

// Fichier de chapitres a valider (defaut : la version corrigee).
// Passer ./07-premier-jet-fautif.json pour verifier que les controles mordent.
const cible = process.argv[2] || './05-chapitres-generes.json';
const generes = require(cible);

// ─────────────────────────────────────────────────────────────
// Outils
// ─────────────────────────────────────────────────────────────
const deaccent = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const canon = (s) => deaccent(String(s || '').toLowerCase()).replace(/[^a-z0-9]+/g, ' ').trim();

// Mots capitalisés courants qui ne sont pas des noms de personnes
const STOPWORDS = new Set([
  'il', 'elle', 'ils', 'elles', 'le', 'la', 'les', 'un', 'une', 'des', 'ce', 'cette', 'ces',
  'et', 'ou', 'mais', 'donc', 'car', 'que', 'qui', 'quoi', 'dont', 'ou', 'a', 'de', 'du',
  'dans', 'sur', 'sous', 'pour', 'par', 'avec', 'sans', 'chez', 'vers', 'depuis', 'pendant',
  'quand', 'comme', 'si', 'ne', 'pas', 'plus', 'moins', 'tres', 'tout', 'toute', 'tous',
  'aucun', 'aucune', 'rien', 'personne', 'on', 'nous', 'vous', 'je', 'tu', 'son', 'sa', 'ses',
  'leur', 'leurs', 'mon', 'ma', 'mes', 'noel', 'aujourd', 'hui', 'puis', 'entre', 'apres',
  'avant', 'encore', 'jamais', 'toujours', 'deja', 'ainsi', 'cela', 'ceux', 'celle', 'celui',
  'trente', 'vingt', 'dix', 'sept', 'huit', 'quatre', 'deux', 'six', 'onze', 'douze',
  'lendemain', 'matin', 'soir', 'jour', 'nuit', 'annee', 'mois', 'semaine',
  'directeur', 'chef', 'atelier', 'bureau', 'bureaux', 'client', 'clients', 'carnet',
  'ressources', 'humaines', 'comptabilite', 'maintenance', 'standard', 'quai', 'usine',
  'plaque', 'offset', 'devis', 'tarif', 'geranium', 'tomates', 'gaufres', 'tarte', 'sucre',
  'apprentissage', 'alternance', 'retraite', 'incendie', 'papier', 'stock', 'poste', 'postes',
  'fiche', 'fiches', 'logiciel', 'prenom', 'prenoms', 'voix', 'phrase', 'mots', 'mot',
  'livre', 'chapitre', 'page', 'temoignages', 'temoignage', 'entreprise', 'societe',
  'nationalite', 'prefecture', 'dossier', 'pieces', 'piece', 'gateaux', 'cafe', 'ecole',
  'danse', 'galas', 'tournee', 'livraison', 'livraisons', 'reveillon', 'enveloppe',
  'organigramme', 'indicateurs', 'delegue', 'syndical', 'mandat', 'mandats', 'salaries',
  'bottes', 'inventaire', 'heures', 'heure', 'minutes', 'portable', 'couloir', 'table',
  'statue', 'eloge', 'pente', 'crise', 'crises', 'erreur', 'erreurs', 'betises', 'trace',
  'memoire', 'jardin', 'grand', 'grande', 'petit', 'fils', 'fille', 'mari', 'grand mere',
  'agent', 'entretien', 'magasinier', 'cariste', 'standardiste', 'commercial', 'assistante',
  'alternante', 'collegue', 'collegues', 'manager', 'garcon', 'homme', 'hommes', 'femme',
  'methode', 'ressort', 'attention', 'debutant', 'debutants', 'generations', 'episodes',
  'episode', 'chose', 'choses', 'facon', 'facons', 'maniere', 'periode', 'carriere'
]);

// Registre : toutes les entites connues, par canonical_key et par variantes
function buildRegistry() {
  const known = new Set();
  const add = (label) => { const k = canon(label); if (k) known.add(k); };

  memoire.persons.forEach((p) => {
    add(p.label); add(p.canonical_key);
    (p.variants || []).forEach(add);
    // Prenom et nom separement : « Kevin » et « Dubois » doivent etre reconnus
    String(p.label).split(/[\s-]+/).forEach(add);
  });
  memoire.places.forEach((l) => { add(l.label); add(l.canonical_key); String(l.label).split(/\s+/).forEach(add); });
  memoire.objects.forEach((o) => { add(o.label); add(o.canonical_key); });
  // Entites issues de la configuration du livre et non des temoignages :
  // legitimes, mais aucun fait ne peut leur etre rattache.
  (memoire.persons_hors_temoignages || []).forEach((p) => add(p.label));
  (memoire.places_hors_temoignages || []).forEach((l) => add(l.label));
  return known;
}

// Extraction heuristique des noms propres : mots capitalises hors debut de phrase
function extractProperNouns(text) {
  const found = new Map();
  // On neutralise les debuts de phrase et d'ouverture de citation
  const sentences = text.split(/(?<=[.!?:»])\s+|\n+/);
  sentences.forEach((sentence) => {
    const words = sentence.trim().split(/\s+/);
    words.forEach((raw, index) => {
      const word = raw.replace(/^[«"'(]+|[»"',.;:!?)]+$/g, '');
      if (!word || word.length < 3) return;
      if (index === 0) return;                      // debut de phrase : capitale non significative
      if (!/^[A-ZÀ-ÖØ-Þ]/.test(word)) return;       // pas une capitale
      const key = canon(word);
      if (!key || STOPWORDS.has(key)) return;
      if (/^\d/.test(word)) return;
      if (!found.has(key)) found.set(key, word);
    });
  });
  return found;
}

// Shingles de n mots + similarite de Jaccard
function shingles(text, n = 5) {
  const words = canon(text).split(' ').filter(Boolean);
  const set = new Set();
  for (let i = 0; i + n <= words.length; i += 1) set.add(words.slice(i, i + n).join(' '));
  return set;
}
function jaccard(a, b) {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  a.forEach((v) => { if (b.has(v)) inter += 1; });
  return inter / (a.size + b.size - inter);
}

// ─────────────────────────────────────────────────────────────
// Collecte des paragraphes generes
// ─────────────────────────────────────────────────────────────
function collectParagraphs() {
  const out = [];
  // Numerotation GLOBALE par chapitre : sans cela, ouverture[0] et corps[0]
  // portent tous deux le numero 1 et le rapport devient illisible.
  const pushAll = (arr, chapterLabel, counter, section) => {
    (arr || []).forEach((p) => {
      counter.n += 1;
      out.push({
        chapter: chapterLabel,
        section,
        index: counter.n,
        text: p.text,
        sources: p.sources || [],
        anecdote: p.anecdote || null
      });
    });
  };
  const introCounter = { n: 0 };
  pushAll(generes.introduction && generes.introduction.paragraphs, 'Introduction', introCounter, 'corps');
  generes.chapters.forEach((ch) => {
    const label = `Chapitre ${ch.order_index}`;
    const counter = { n: 0 };
    ['ouverture', 'corps', 'coda'].forEach((sec) => pushAll(ch.sections[sec], label, counter, sec));
  });
  const outroCounter = { n: 0 };
  pushAll(generes.conclusion && generes.conclusion.paragraphs, 'Conclusion', outroCounter, 'corps');
  return out;
}

// ─────────────────────────────────────────────────────────────
// Controles
// ─────────────────────────────────────────────────────────────
const registry = buildRegistry();
const paragraphs = collectParagraphs();
const violations = [];
const stats = { paragraphes: paragraphs.length, mots: 0, nomsVerifies: 0, pairesComparees: 0 };

// C1 — tout nom propre doit appartenir au registre
paragraphs.forEach((p) => {
  stats.mots += p.text.split(/\s+/).length;
  extractProperNouns(p.text).forEach((original, key) => {
    stats.nomsVerifies += 1;
    if (!registry.has(key)) {
      violations.push({
        check: 'C1 nom hors registre', severity: 'BLOCKING',
        where: `${p.chapter} §${p.index}`, detail: `« ${original} » absent de la mémoire éditoriale`
      });
    }
  });
});

// C2 — aucun element interdit
const FORBIDDEN_PATTERNS = [
  { label: "année 1994 pour l'arrivée", re: /\b1994\b/ },
  { label: 'signification de la fiche jaune', re: /jaune\s+pour/i },
  { label: 'âge de Martine', re: /Martine[^.]{0,40}\b(soixante|61|62|60)\s*ans/i },
  { label: 'date pour la naturalisation', re: /naturalisation[^.]{0,60}\b(19|20)\d{2}\b/i },
  { label: 'année pour le 24 décembre', re: /24\s+décembre[^.]{0,40}\b(19|20)\d{2}\b/i }
];
paragraphs.forEach((p) => {
  FORBIDDEN_PATTERNS.forEach((f) => {
    if (f.re.test(p.text)) {
      violations.push({ check: 'C2 élément interdit', severity: 'BLOCKING', where: `${p.chapter} §${p.index}`, detail: f.label });
    }
  });
});

// C3 — verrous d'attribution
// Deux sous-controles : cohabitation de deux anecdotes verrouillees dans un meme
// paragraphe (C3a), et citation servie au mauvais destinataire (C3b).
const locks = [];
plan.chapters.forEach((ch) => (ch.attribution_locks || []).forEach((l) => locks.push({ ...l, chapter: ch.order_index })));

// Presence d'une entite : tous ses mots significatifs, pas une egalite de chaine.
// « devis au mauvais tarif » doit matcher « devis avec le mauvais tarif ».
function mentions(text, label) {
  const parts = canon(label).split(' ').filter((w) => w.length >= 4);
  if (parts.length === 0) return false;
  return parts.every((w) => text.includes(w));
}
function mentionsPerson(text, label) {
  // Un nom de personne est reconnu par son prenom OU son nom de famille
  return canon(label).split(' ').filter((w) => w.length >= 4).some((w) => text.includes(w));
}

// Marqueurs de comparaison : « comme celle de Kevin », « sans etre la meme »…
// Nommer quelqu'un pour DISTINGUER deux histoires est legitime, et c'est meme
// exactement ce qu'on veut. Seule l'attribution silencieuse est une faute.
const COMPARISON_MARKERS = /\b(comme|ressembl\w+|sans etre la meme|a la difference|contrairement|autre que|de meme que|plus tard|des annees? avant|des annees? apres)\b/;

// Une citation citee de facon generique (« elle appelait les plus jeunes… »)
// n'est pas une attribution individuelle.
const GENERIC_QUOTE_CONTEXT = /\b(les plus jeunes|les jeunes|tout le monde|chacun|les nouveaux|aux caristes|les gens)\b/;

paragraphs.forEach((p) => {
  const t = canon(p.text);
  const hasComparison = COMPARISON_MARKERS.test(t);

  locks.forEach((lock) => {
    if (!mentions(t, lock.object)) return;

    // C3a — le paragraphe porte une anecdote DIFFERENTE de celle du verrou :
    // c'est un vrai vol d'anecdote, toujours bloquant.
    if (p.anecdote && p.anecdote !== lock.anecdote) {
      violations.push({
        check: 'C3 attribution croisée', severity: 'BLOCKING',
        where: `${p.chapter} §${p.index}`,
        detail: `« ${lock.object} » (verrouillé sur ${lock.exclusive_to}) apparaît dans le paragraphe de ${p.anecdote}`
      });
      return;
    }

    // C3b — un autre proprietaire de verrou est nomme dans le paragraphe
    locks
      .filter((other) => other.anecdote !== lock.anecdote)
      .forEach((other) => {
        if (!mentionsPerson(t, other.exclusive_to)) return;
        violations.push({
          check: 'C3 attribution croisée',
          severity: hasComparison ? 'WARNING' : 'BLOCKING',
          where: `${p.chapter} §${p.index}`,
          detail: hasComparison
            ? `${other.exclusive_to} cité en comparaison près de « ${lock.object} » — à relire`
            : `« ${lock.object} » (verrouillé sur ${lock.exclusive_to}) cohabite avec ${other.exclusive_to}`
        });
      });

    // C3c — le proprietaire legitime doit etre nomme dans son propre paragraphe
    if (p.anecdote === lock.anecdote && !mentionsPerson(t, lock.exclusive_to)) {
      violations.push({
        check: 'C3 attribution croisée', severity: 'BLOCKING',
        where: `${p.chapter} §${p.index}`,
        detail: `« ${lock.object} » évoqué sans nommer ${lock.exclusive_to}`
      });
    }
  });

  // C3d — citation a destinataire declare, dans un paragraphe porteur d'anecdote
  (memoire.quotes || []).forEach((q) => {
    if (!q.addressee) return;
    if (!t.includes(canon(q.text))) return;
    if (GENERIC_QUOTE_CONTEXT.test(t)) return;   // usage generique, pas une attribution
    const addressee = (memoire.persons.find((pp) => pp.id === q.addressee) || {}).label;
    if (!addressee) return;
    if (!mentionsPerson(t, addressee)) {
      violations.push({
        check: 'C3 attribution croisée', severity: 'BLOCKING',
        where: `${p.chapter} §${p.index}`,
        detail: `citation « ${q.text} » adressée à ${addressee}, absent de ce paragraphe`
      });
    }
  });
});

// C4 — repetition entre chapitres (Jaccard sur shingles de 5 mots)
const SEUIL = 0.25;
const withShingles = paragraphs.map((p) => ({ ...p, sh: shingles(p.text, 5) }));
let maxSim = 0; let maxPair = null;
for (let i = 0; i < withShingles.length; i += 1) {
  for (let j = i + 1; j < withShingles.length; j += 1) {
    if (withShingles[i].chapter === withShingles[j].chapter) continue;
    stats.pairesComparees += 1;
    const sim = jaccard(withShingles[i].sh, withShingles[j].sh);
    if (sim > maxSim) { maxSim = sim; maxPair = [withShingles[i], withShingles[j]]; }
    if (sim >= SEUIL) {
      violations.push({
        check: 'C4 répétition inter-chapitres', severity: 'WARNING',
        where: `${withShingles[i].chapter} §${withShingles[i].index} ↔ ${withShingles[j].chapter} §${withShingles[j].index}`,
        detail: `Jaccard ${sim.toFixed(3)} ≥ ${SEUIL}`
      });
    }
  }
}

// C5 — chaque paragraphe doit porter au moins une source
paragraphs.forEach((p) => {
  if (!p.sources.length) {
    violations.push({ check: 'C5 paragraphe sans source', severity: 'BLOCKING', where: `${p.chapter} §${p.index}`, detail: 'aucune source déclarée' });
  }
});

// C6 — motifs de remplissage (reprend CHAPTER_DRAFT_FILLER_PATTERNS de books.js)
const FILLERS = [
  /dans ce chapitre/i, /ce chapitre (?:montre|raconte|présente|met en lumière)/i,
  /il est important de/i, /nous allons/i, /cette anecdote montre/i,
  /tous s'accordent/i, /sans faille/i, /exceptionnelle?/i
];
paragraphs.forEach((p) => {
  FILLERS.forEach((re) => {
    if (re.test(p.text)) {
      violations.push({ check: 'C6 motif générique', severity: 'WARNING', where: `${p.chapter} §${p.index}`, detail: String(re) });
    }
  });
});

// C7 — couverture du plan : chaque anecdote assignee doit etre utilisee une seule fois
const assigned = new Map();
plan.chapters.forEach((ch) => (ch.assigned_anecdotes || []).forEach((a) => assigned.set(a, ch.order_index)));
const usedCount = new Map();
generes.chapters.forEach((ch) => (ch.anecdotes_used || []).forEach((a) => usedCount.set(a, (usedCount.get(a) || 0) + 1)));
usedCount.forEach((count, anecdote) => {
  if (count > 1) {
    violations.push({ check: 'C7 anecdote réutilisée', severity: 'BLOCKING', where: 'plan', detail: `${anecdote} utilisée ${count} fois` });
  }
});

// ─────────────────────────────────────────────────────────────
// Rapport
// ─────────────────────────────────────────────────────────────
const blocking = violations.filter((v) => v.severity === 'BLOCKING');
const warnings = violations.filter((v) => v.severity === 'WARNING');

console.log('\n╔══════════════════════════════════════════════════════════════╗');
console.log('║  VALIDATEUR DÉTERMINISTE — étape F        0 appel IA          ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');
console.log(`Registre        : ${registry.size} clés (${memoire.persons.length} personnes, ${memoire.places.length} lieux, ${memoire.objects.length} objets)`);
console.log(`Texte analysé   : ${stats.paragraphes} paragraphes, ${stats.mots} mots`);
console.log(`Noms vérifiés   : ${stats.nomsVerifies}`);
console.log(`Paires comparées: ${stats.pairesComparees} (similarité inter-chapitres)\n`);

const groups = {};
violations.forEach((v) => { (groups[v.check] = groups[v.check] || []).push(v); });

['C1 nom hors registre', 'C2 élément interdit', 'C3 attribution croisée', 'C5 paragraphe sans source',
 'C7 anecdote réutilisée', 'C4 répétition inter-chapitres', 'C6 motif générique'].forEach((check) => {
  const list = groups[check] || [];
  const mark = list.length === 0 ? '✓' : '✗';
  console.log(`${mark} ${check.padEnd(34)} ${list.length === 0 ? 'aucune' : list.length + ' détection(s)'}`);
  list.forEach((v) => console.log(`    → ${v.where.padEnd(24)} ${v.detail}`));
});

console.log(`\nSimilarité inter-chapitres maximale : ${maxSim.toFixed(3)} (seuil ${SEUIL})`);
if (maxPair) console.log(`    entre ${maxPair[0].chapter} §${maxPair[0].index} et ${maxPair[1].chapter} §${maxPair[1].index}`);

const score = Math.max(0, 100 - blocking.length * 15 - warnings.length * 4);
console.log(`\n──────────────────────────────────────────────────────────────`);
console.log(`Violations bloquantes : ${blocking.length}`);
console.log(`Avertissements        : ${warnings.length}`);
console.log(`Score de cohérence    : ${score}/100`);
console.log(`Verdict               : ${blocking.length === 0 ? 'ACCEPTÉ — soumis à validation humaine' : 'REFUSÉ — correction requise'}`);
console.log(`──────────────────────────────────────────────────────────────\n`);

process.exit(blocking.length === 0 ? 0 : 1);
