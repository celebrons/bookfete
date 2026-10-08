// backend/services/analytics/pageViews.js
//
// Suivi de trafic minimal (2026-10-06, voir sql/phase28_page_views.sql pour
// le choix initial de ne rien stocker d'identifiant). L'IP a ete ajoutee le
// 2026-10-07 (sql/phase29_page_views_ip.sql, demande : "afficher les @IP") —
// seule donnee personnelle du lot, anonymisee automatiquement au bout de 90
// jours (voir purgeOldIps/scripts/anonymiser-ip-trafic.js) plutot que
// conservee indefiniment. Trois operations : enregistrer une visite, en
// tirer un resume pour l'espace d'administration, et anonymiser les IP
// anciennes.

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
async function recordPageView({ path, referrer, ip } = {}) {
  const ligne = {
    path: cheminSeul(path, 300) || '/',
    referrer: referrer ? origineSeule(referrer, 300) : null,
    ip: texte(ip, 64)
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
    .select('path, referrer, ip, created_at')
    .gte('created_at', depuis)
    .order('created_at', { ascending: false })
    .limit(20000);
  if (error) throw error;

  const rows = data || [];
  const parJour = new Map();
  const parChemin = new Map();
  const parReferrer = new Map();
  const parIp = new Map();

  rows.forEach((row) => {
    const jour = (row.created_at || '').slice(0, 10);
    if (jour) parJour.set(jour, (parJour.get(jour) || 0) + 1);
    parChemin.set(row.path, (parChemin.get(row.path) || 0) + 1);
    const ref = row.referrer || '(direct)';
    parReferrer.set(ref, (parReferrer.get(ref) || 0) + 1);
    const ip = row.ip || '(inconnue)';
    parIp.set(ip, (parIp.get(ip) || 0) + 1);
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
    topReferrers: topN(parReferrer, 15),
    topIps: topN(parIp, 15),
    // Visites individuelles les plus recentes, IP comprise — demande du
    // 2026-10-07 ("afficher les @IP"). Le resume par IP ci-dessus repond a
    // "qui revient souvent", cette liste repond a "qui vient de passer".
    recent: rows.slice(0, 50).map((row) => ({
      path: row.path,
      referrer: row.referrer,
      ip: row.ip || null,
      createdAt: row.created_at
    }))
  };
}

/**
 * Purge les visites trop anciennes — une IP est une donnee personnelle,
 * elle ne doit pas s'accumuler indefiniment (meme principe que
 * purgeEvents). N'efface PAS le reste (path/referrer/created_at), qui reste
 * utile aux statistiques agregees sur une duree plus longue : seule l'IP
 * est effacee passe ce delai.
 */
async function purgeOldIps({ jours = 90 } = {}) {
  const limite = new Date(Date.now() - jours * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('page_views')
    .update({ ip: null })
    .lt('created_at', limite)
    .not('ip', 'is', null)
    .select('id');
  if (error) throw error;
  return { anonymized: Array.isArray(data) ? data.length : 0 };
}

module.exports = { recordPageView, pageViewsSummary, purgeOldIps };
