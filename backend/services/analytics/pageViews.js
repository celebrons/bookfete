// backend/services/analytics/pageViews.js
//
// Suivi de trafic minimal (2026-10-06, voir sql/phase28_page_views.sql pour
// le choix de ne rien stocker d'identifiant). Deux operations : enregistrer
// une visite, et en tirer un resume pour l'espace d'administration.

const supabase = require('../../config/supabase');

const texte = (valeur, max) => {
  if (valeur === null || valeur === undefined) return null;
  const s = String(valeur).trim();
  return s ? s.slice(0, max) : null;
};

// N'enregistre qu'un CHEMIN (jamais de query string) : un chemin ne doit
// jamais pouvoir porter de jeton/identifiant qui trainerait dans l'URL.
function cheminSeul(valeur, max) {
  const brut = texte(valeur, max + 200);
  if (!brut) return null;
  try {
    // Un chemin relatif ("/book/abc") n'est pas une URL valide pour `new URL`
    // sans base : on en fournit une factice, seule la partie chemin compte.
    const url = new URL(brut, 'https://bookipix.com');
    return url.pathname.slice(0, max) || '/';
  } catch (_error) {
    return brut.split('?')[0].slice(0, max) || null;
  }
}

// Pour un REFERRER externe, le CHEMIN sur l'autre site n'apporte presque
// rien (et peut meme porter une requete de recherche sensible cote
// visiteur, ex. google.com/search?q=...) : ce qui compte est QUEL site a
// envoye le visiteur. On ne garde donc que l'origine (protocole+domaine).
// Un referrer a schema exotique (android-app://, ou qui ne parse pas du
// tout) est garde tel quel plutot que reduit a rien.
function origineSeule(valeur, max) {
  const brut = texte(valeur, max + 200);
  if (!brut) return null;
  try {
    const url = new URL(brut);
    // Pour un schema "opaque" (android-app:, mailto:...), le standard WHATWG
    // impose `.origin === "null"` (la CHAINE, pas l'absence de valeur) —
    // sans ce cas particulier, ce "null" textuel passerait pour une vraie
    // origine.
    if (!url.origin || url.origin === 'null') return brut.slice(0, max);
    return url.origin.slice(0, max);
  } catch (_error) {
    return brut.slice(0, max);
  }
}

/**
 * Enregistre une visite. Ne leve jamais (meme philosophie que logEvent) : une
 * ecriture de trafic ratee ne doit jamais faire echouer la navigation d'un
 * visiteur.
 */
async function recordPageView({ path, referrer } = {}) {
  const ligne = {
    path: cheminSeul(path, 300) || '/',
    referrer: referrer ? origineSeule(referrer, 300) : null
  };
  try {
    await supabase.from('page_views').insert(ligne);
  } catch (error) {
    console.warn('[trafic] visite non enregistree :', error?.message || error);
  }
}

/**
 * Resume pour l'espace d'administration : total, visites par jour (30
 * derniers jours), pages et referrers les plus frequents.
 */
async function pageViewsSummary({ days = 30 } = {}) {
  const depuis = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('page_views')
    .select('path, referrer, created_at')
    .gte('created_at', depuis)
    .order('created_at', { ascending: false })
    .limit(20000);
  if (error) throw error;

  const rows = data || [];
  const parJour = new Map();
  const parChemin = new Map();
  const parReferrer = new Map();

  rows.forEach((row) => {
    const jour = (row.created_at || '').slice(0, 10);
    if (jour) parJour.set(jour, (parJour.get(jour) || 0) + 1);
    parChemin.set(row.path, (parChemin.get(row.path) || 0) + 1);
    const ref = row.referrer || '(direct)';
    parReferrer.set(ref, (parReferrer.get(ref) || 0) + 1);
  });

  const topN = (map, n) => [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([key, count]) => ({ key, count }));

  return {
    total: rows.length,
    windowDays: days,
    byDay: [...parJour.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, count]) => ({ date, count })),
    topPaths: topN(parChemin, 15),
    topReferrers: topN(parReferrer, 15)
  };
}

module.exports = { recordPageView, pageViewsSummary };
