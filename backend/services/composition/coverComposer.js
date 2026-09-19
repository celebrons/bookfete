// backend/services/composition/coverComposer.js
//
// Decision + orchestration de la 1ere et 4eme de couverture. Seul fichier
// qui touche a la forme du tableau de pages (ajoute front/back autour des
// pages interieures) — layoutEngine.js (moteur des pages interieures)
// n'est ni importe ni modifie : DEFAULT_FIXED_PAGES y porte deja le
// commentaire "la couverture est un document a part", ce module concretise
// exactement cette separation.
//
// Les renderers (frontCoverRenderer.js/backCoverRenderer.js) restent
// purement des fonctions de rendu : toutes les decisions ("quelle
// variante", "quelle photo", "quelles stats") sont prises ICI, jamais dans
// le renderer — meme principe de separation que layoutEngine.js/
// layoutScoring.js (decision) vs pageRenderer.js (rendu).
//
// Fonctions pures, aucun acces reseau/disque.

const { rankPhotos } = require('./coverPhotoSelector');
const { PHOTO_ZOOM_MIN, PHOTO_ZOOM_MAX } = require('./pageRenderer');
const { resolveCoverTheme, applyFormatAccent, applyCoverColor } = require('./coverTheme');
const { pickClosingPhrase, formatStatsLine } = require('./coverCopy');
const { detectContentProfile } = require('./contentProfile');
const { resolveCoverFormat, DEFAULT_COVER_FORMAT_ID } = require('./coverFormat');
const { FRONT_COVER_VARIANTS } = require('./frontCoverRenderer');
const { BACK_COVER_VARIANTS } = require('./backCoverRenderer');
const { EVENT_TYPE_LABELS } = require('../../utils/bookCreationSchema');

// Format de reference pour le classement des photos de 4e de couverture.
// Fixe volontairement (voir composeBackCover) : la 4e ne doit pas changer de
// photo parce que le livre change de format. La valeur exacte importe peu —
// seul compte le fait quelle ne varie jamais ; on prend celle du format le
// plus courant.
const BACK_COVER_RANKING_FORMAT = resolveCoverFormat('standard');

// Seuils de score (coverPhotoSelector.scorePhoto, [0,1]) — points de depart,
// ajustables independamment.
const COVER_PHOTO_THRESHOLDS = {
  great: 0.72, // -> COVER_PHOTO_TITLE (traitement le plus exigeant, photo la plus fiable)
  good: 0.45, // -> COVER_PHOTO (bandeau separe, sans risque de lisibilite)
  highBarForMulti: 0.60, // barre haute pour qu'une photo compte comme "rivale serieuse"
  clearWinnerMargin: 0.08 // ecart en-dessous duquel on considere qu'il n'y a pas de gagnant net
};
const MULTI_PHOTO_TRIGGER_COUNT = 3; // nombre minimum de photos "rivales" pour envisager COVER_MULTI_PHOTO
const MULTI_PHOTO_MAX = 3; // jamais plus de 3 photos en couverture (pas de mosaique)

const FRONT_VARIANT_SET = new Set(FRONT_COVER_VARIANTS);
const BACK_VARIANT_SET = new Set(BACK_COVER_VARIANTS);

function cleanText(value, maxLength = 300) {
  const text = String(value ?? '').trim();
  return maxLength ? text.slice(0, maxLength) : text;
}

function formatEventYear(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return String(date.getFullYear());
}

// Surcharges manuelles legeres (voir sql/phase09_cover_overrides.sql) :
// toujours lues de facon defensive, jamais requises — un livre qui n'a
// jamais ouvert cet ecran se comporte exactement comme avant (objet vide).
// Cadrage manuel d'une photo de couverture ({focalX, focalY, zoom, fitMode}).
//
// LU DEFENSIVEMENT, toujours : `cover_overrides` est ecrit directement par le
// navigateur (voir BookAtelierLuxe.handleUpdateBook), il n'a donc jamais
// transite par une validation serveur. Une valeur absurde ne doit pas
// produire une couverture cassee — elle est simplement ramenee dans les
// bornes, ou ignoree. Les memes bornes que les photos interieures
// (pageRenderer PHOTO_ZOOM_MIN/MAX), volontairement : un seul reglage a
// comprendre dans toute l'application.
function resolveCoverPhotoAdjust(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const borne = (valeur, min, max, defaut) => {
    const n = Number(valeur);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : defaut;
  };
  return {
    focalX: borne(raw.focalX, 0, 1, 0.5),
    focalY: borne(raw.focalY, 0, 1, 0.5),
    zoom: borne(raw.zoom, PHOTO_ZOOM_MIN, PHOTO_ZOOM_MAX, 1),
    fitMode: raw.fitMode === 'contain' ? 'contain' : 'cover'
  };
}

function resolveCoverOverrides(book) {
  return (book?.cover_overrides && typeof book.cover_overrides === 'object') ? book.cover_overrides : {};
}

// book.event_type stocke le slug technique choisi dans le formulaire de
// creation (ex. "projet"), pas le libelle affiche dans ce meme formulaire
// (ex. "Fin de projet") — sans cette resolution, le slug brut apparaitrait
// tel quel sur la couverture. Slug inconnu (occasion ajoutee depuis, custom
// non catalogue) -> affiche tel quel plutot que de le faire disparaitre.
function resolveEventTypeLabel(eventType) {
  const slug = cleanText(eventType, 60);
  if (!slug) return '';
  return EVENT_TYPE_LABELS[slug] || slug;
}

// Kicker (petite ligne au-dessus du titre, ex. "ANNIVERSAIRE") : meme
// principe de surcharge que resolveClosingPhrase juste en-dessous —
// 'none' -> jamais de kicker (choix explicite) ; 'custom' -> le texte
// propre de l'utilisateur ; absent/'auto' -> comportement automatique
// inchange (occasion choisie a la creation du livre, voir
// resolveEventTypeLabel). Retour utilisateur : le kicker automatique
// (ex. "Fin de projet") n'etait modifiable nulle part — meme
// personnalisation legere que le reste de la couverture.
function resolveKicker(book, overrides) {
  if (overrides.kickerMode === 'none') return '';
  if (overrides.kickerMode === 'custom') {
    return cleanText(overrides.kickerText, 60);
  }
  return resolveEventTypeLabel(book?.event_type);
}

// Construit les elements textuels du recto. Jamais de texte invente
// automatiquement : le sous-titre/la date restent vides tant que
// l'utilisateur ne les a pas explicitement saisis (surcharge) — une
// couverture simple vaut mieux qu'une phrase artificielle (cahier des
// charges §6). Le titre lui-meme (book.title) n'a pas besoin d'une
// surcharge dediee : c'est deja une colonne modifiable directement
// (Configuration ET, depuis peu, le panneau couverture de l'atelier — voir
// AtelierCoverPanel.js), coverComposer.js la lit telle quelle.
function buildFrontTitleInfo(book, overrides) {
  return {
    title: cleanText(book?.title, 180) || 'Livre souvenir',
    kicker: resolveKicker(book, overrides),
    subtitle: cleanText(overrides.subtitle, 220),
    dateLabel: cleanText(overrides.dateLabel, 20) || formatEventYear(book?.event_date)
  };
}

// Phrase de 4eme de couverture : 'none' -> jamais de phrase (choix explicite
// de l'utilisateur, respecte a la lettre) ; 'custom' -> son propre texte ;
// absent/'auto' -> comportement automatique inchange (pickClosingPhrase).
function resolveClosingPhrase(book, overrides) {
  if (overrides.closingPhraseMode === 'none') return null;
  if (overrides.closingPhraseMode === 'custom') {
    return cleanText(overrides.closingPhraseText, 300) || null;
  }
  return pickClosingPhrase(book);
}

// Format de recto force explicitement par l'utilisateur (galerie de choix,
// cover_overrides.frontVariant) : absent/'AUTO'/valeur inconnue -> null,
// c'est-a-dire l'arbre de decision automatique existant, inchange.
function resolveForcedFrontVariant(overrides) {
  const value = typeof overrides.frontVariant === 'string' ? overrides.frontVariant.trim() : '';
  return value && value !== 'AUTO' && FRONT_VARIANT_SET.has(value) ? value : null;
}

// Meme principe pour la 4eme de couverture.
function resolveForcedBackVariant(overrides) {
  const value = typeof overrides.backVariant === 'string' ? overrides.backVariant.trim() : '';
  return value && value !== 'AUTO' && BACK_VARIANT_SET.has(value) ? value : null;
}

// Resout la composition (variante + photos) pour un format de recto force.
// Jamais d'erreur ni de page cassee si le contenu ne permet pas la variante
// demandee : degradation gracieuse vers une variante moins exigeante en
// photos. Un format choisi explicitement doit afficher une photo si le
// livre en a au moins une (contrairement a l'arbre automatique, aucun seuil
// de qualite n'est applique ici — le choix de l'utilisateur prime).
function resolveForcedFrontComposition(forcedVariant, { ranked, overridden }) {
  if (forcedVariant === 'COVER_MINIMAL') {
    return { variant: 'COVER_MINIMAL', photos: [] };
  }

  if (forcedVariant === 'COVER_MULTI_PHOTO') {
    if (ranked.length >= 2) {
      const rest = ranked.filter((entry) => !overridden || entry.item.id !== overridden.item.id);
      const ordered = overridden ? [overridden, ...rest] : rest;
      return { variant: 'COVER_MULTI_PHOTO', photos: ordered.slice(0, MULTI_PHOTO_MAX).map((entry) => entry.item) };
    }
    if (ranked.length === 1) {
      return { variant: 'COVER_PHOTO', photos: [(overridden || ranked[0]).item] };
    }
    return { variant: 'COVER_MINIMAL', photos: [] };
  }

  // Variantes a une seule photo : COVER_PHOTO / COVER_PHOTO_TITLE /
  // COVER_SPLIT / COVER_FRAMED.
  const chosen = overridden || ranked[0];
  return chosen
    ? { variant: forcedVariant, photos: [chosen.item] }
    : { variant: 'COVER_MINIMAL', photos: [] };
}

/**
 * @param {object} input - { book, items, template, format }
 * @returns {object} page-entry { page_index, layout_id, content }
 */
function composeFrontCover({ book, items, template, format }) {
  const overrides = resolveCoverOverrides(book);
  // Couleur choisie par l'utilisateur (cover_overrides.coverColor), appliquee
  // PAR-DESSUS le theme et l'habillage de format — voir coverTheme.js.
  // Absente : rien ne change, le rendu reste exactement celui d'avant.
  const theme = applyCoverColor(
    applyFormatAccent(resolveCoverTheme(template), format?.formatId),
    overrides.coverColor
  );
  const titleInfo = buildFrontTitleInfo(book, overrides);
  const ranked = rankPhotos(items, format);
  const best = ranked[0];

  // Photo choisie explicitement par l'utilisateur (surcharge) : toujours
  // utilisee telle quelle, jamais rejetee meme sous le seuil "correct" — un
  // choix assume, pas une suggestion. Si l'id ne correspond plus a rien
  // (photo supprimee depuis la surcharge), repli silencieux sur la
  // selection automatique ci-dessous, comportement inchange.
  const overridden = overrides.frontPhotoId
    ? ranked.find((entry) => entry.item.id === overrides.frontPhotoId)
    : null;

  const forcedVariant = resolveForcedFrontVariant(overrides);

  let variant;
  let photos;

  if (forcedVariant) {
    ({ variant, photos } = resolveForcedFrontComposition(forcedVariant, { ranked, overridden }));
  } else if (overridden) {
    // Jamais COVER_MULTI_PHOTO ici : une selection manuelle exprime un choix
    // unique, pas une composition a plusieurs photos.
    variant = overridden.score >= COVER_PHOTO_THRESHOLDS.great ? 'COVER_PHOTO_TITLE' : 'COVER_PHOTO';
    photos = [overridden.item];
  } else if (best && best.score >= COVER_PHOTO_THRESHOLDS.great) {
    const strongRivals = ranked.filter((entry) => entry.score >= COVER_PHOTO_THRESHOLDS.highBarForMulti);
    const noClearWinner = ranked.length >= 2
      && (best.score - ranked[1].score) < COVER_PHOTO_THRESHOLDS.clearWinnerMargin;
    const { profile } = detectContentProfile(items);

    if (strongRivals.length >= MULTI_PHOTO_TRIGGER_COUNT && noClearWinner && profile === 'PHOTO') {
      variant = 'COVER_MULTI_PHOTO';
      photos = strongRivals.slice(0, MULTI_PHOTO_MAX).map((entry) => entry.item);
    } else {
      variant = 'COVER_PHOTO_TITLE';
      photos = [best.item];
    }
  } else if (best && best.score >= COVER_PHOTO_THRESHOLDS.good) {
    variant = 'COVER_PHOTO';
    photos = [best.item];
  } else {
    variant = 'COVER_MINIMAL';
    photos = [];
  }

  return {
    page_index: 0, // reassigne par composeCoversIntoPages
    layout_id: null,
    content: {
      kind: 'front-cover',
      variant,
      itemIds: photos.map((photo) => photo.id),
      // Cadrage manuel de la photo principale. Une seule valeur par face, pas
      // une par photo : les variantes multi-photos (trio, duo) n'en tiennent
      // deliberement pas compte — un reglage unique n'aurait aucun sens sur
      // plusieurs photos de formes differentes.
      photoAdjust: resolveCoverPhotoAdjust(overrides.frontPhotoAdjust),
      ...titleInfo,
      theme
    }
  };
}

// Resout la composition (variante + photo) pour un format de verso force
// explicitement (cover_overrides.backVariant). Meme philosophie que
// resolveForcedFrontComposition : jamais d'erreur, degradation gracieuse.
function resolveForcedBackComposition(forcedVariant, { statsLine, ranked, overridden }) {
  if (!statsLine) {
    // BACK_STATS/BACK_PHOTO_STATS sans statistiques disponibles n'ont rien a
    // afficher : meme regle que l'arbre automatique (statsLine vide ->
    // BACK_MINIMAL), reutilisee telle quelle pour un choix force.
    return { variant: 'BACK_MINIMAL', photoItem: null };
  }

  if (forcedVariant === 'BACK_MINIMAL') {
    return { variant: 'BACK_MINIMAL', photoItem: null };
  }

  if (forcedVariant === 'BACK_STATS') {
    return { variant: 'BACK_STATS', photoItem: null };
  }

  // BACK_PHOTO_STATS : une photo choisie explicitement (surcharge,
  // cover_overrides.backPhotoId) est toujours utilisee telle quelle, meme
  // principe que overrides.frontPhotoId cote recto — jamais rejetee meme
  // sous le seuil "acceptable". Sinon, repli sur l'arbre automatique :
  // prefere une photo "acceptable" (jamais la meilleure — jamais en
  // concurrence avec le recto) ; a defaut, un choix explicite doit tout de
  // meme afficher une photo si le livre en a au moins une.
  if (overridden) {
    return { variant: 'BACK_PHOTO_STATS', photoItem: overridden.item };
  }
  if (ranked.length === 0) {
    return { variant: 'BACK_STATS', photoItem: null };
  }
  const acceptable = ranked.filter((entry) => entry.score >= COVER_PHOTO_THRESHOLDS.good);
  const chosen = acceptable.length > 0 ? acceptable[acceptable.length - 1] : ranked[ranked.length - 1];
  return { variant: 'BACK_PHOTO_STATS', photoItem: chosen.item };
}

/**
 * @param {object} input - { book, items, template, format, frontCoverItemIds }
 * @returns {object} page-entry { page_index, layout_id, content }
 */
function composeBackCover({ book, items, template, format, frontCoverItemIds = [] }) {
  const overrides = resolveCoverOverrides(book);
  // Meme couleur que le recto, toujours : sur un Luxe, couverture, dos et 4e
  // ne forment qu'UNE seule feuille qui enveloppe le livre (voir
  // gelatoCoverComposer.js). Deux teintes differentes obligeraient le dos a
  // trancher et ressembleraient a une erreur d'impression — d'ou un seul
  // reglage pour tout l'habillage, jamais un par face.
  const theme = applyCoverColor(
    applyFormatAccent(resolveCoverTheme(template), format?.formatId),
    overrides.coverColor
  );

  const photos = (items || []).filter((item) => item.kind === 'photo').length;
  const souvenirs = (items || []).filter((item) => item.kind === 'texte').length;
  // Un livre solo n'a structurellement pas de notion de "contributeurs" —
  // sans ce garde, le compte serait techniquement correct mais reste a 0
  // pour tout livre existant aujourd'hui (aucun flux actuel ne pose de
  // contribution_id), ce qui se lirait comme un compteur casse plutot que
  // comme une absence de sens pour ce mode.
  const contributeurs = book?.collection_mode === 'solo'
    ? 0
    : new Set((items || []).filter((item) => item.contribution_id).map((item) => item.contribution_id)).size;

  // DEUX lignes de chiffres, et ce n'est pas un doublon :
  //  - `statsLineComplete` sert a DECIDER (un livre a-t-il de quoi remplir
  //    une 4e "avec chiffres" ?) ;
  //  - `statsLine` est ce qui sera AFFICHE, une fois retires les chiffres
  //    que l'utilisateur a decoches (cover_overrides.backStatsHidden).
  // Les confondre ferait disparaitre la photo de 4e des qu'on decoche le
  // dernier chiffre — une case a cocher ne doit pas changer la mise en page.
  const statsLineComplete = formatStatsLine({ contributeurs, souvenirs, photos });
  const statsLine = formatStatsLine(
    { contributeurs, souvenirs, photos },
    Array.isArray(overrides.backStatsHidden) ? overrides.backStatsHidden : []
  );
  const phrase = resolveClosingPhrase(book, overrides);
  const forcedVariant = resolveForcedBackVariant(overrides);

  // Photo de la 4e : jamais celle du recto (exclusion appliquee une seule
  // fois ici, reutilisee par les deux branches ci-dessous — ne doit jamais
  // concurrencer la couverture, choix manuel inclus).
  // Classement sur un format de REFERENCE FIXE, pas sur celui du livre.
  //
  // Le score d une photo depend du ratio de la page (coverPhotoSelector
  // .scorePhoto) : passer le livre en Livret (carre) au lieu de Standard
  // (portrait) reordonnait donc les candidates. Le recto n en souffrait pas,
  // il prend la MEILLEURE (ranked[0], une position stable) ; la 4e, elle,
  // prend deliberement la DERNIERE acceptable — la position la plus sensible
  // au moindre reordonnancement. Resultat constate sur deux livres reels le
  // 2026-09-14 : le simple fait de regarder un autre format changeait la photo
  // de 4e, sans que rien ne l ait demande ("la photo de 4e est modifiee par
  // une photo aleatoire en mode livret").
  //
  // La 4e n a rien a y gagner : sa photo est une vignette dans un encart de
  // taille fixe, et on y cherche justement une photo QUI NE CONCURRENCE PAS
  // le recto — pas la mieux cadree. Un classement stable vaut donc mieux
  // qu un classement adapte. Un choix explicite de l utilisateur
  // (cover_overrides.backPhotoId) reste evidemment prioritaire.
  const ranked = rankPhotos(items, BACK_COVER_RANKING_FORMAT).filter((entry) => !frontCoverItemIds.includes(entry.item.id));
  // Photo choisie explicitement par l'utilisateur (surcharge,
  // cover_overrides.backPhotoId — meme principe que overrides.frontPhotoId
  // cote recto, voir composeFrontCover) : repli silencieux sur la selection
  // automatique si l'id ne correspond plus a rien (photo supprimee, ou
  // c'est justement la photo du recto).
  const overridden = overrides.backPhotoId
    ? ranked.find((entry) => entry.item.id === overrides.backPhotoId)
    : null;

  let variant;
  let photoItem;

  if (forcedVariant) {
    ({ variant, photoItem } = resolveForcedBackComposition(forcedVariant, { statsLine: statsLineComplete, ranked, overridden }));
  } else if (overridden && statsLineComplete) {
    // Une photo choisie a la main exprime deja l'intention d'afficher une
    // photo, meme sans variante forcee explicitement — meme principe que le
    // recto (voir composeFrontCover : `else if (overridden)`).
    variant = 'BACK_PHOTO_STATS';
    photoItem = overridden.item;
  } else {
    variant = 'BACK_MINIMAL';
    photoItem = null;

    if (statsLineComplete) {
      const acceptable = ranked.filter((entry) => entry.score >= COVER_PHOTO_THRESHOLDS.good);

      if (acceptable.length > 0) {
        variant = 'BACK_PHOTO_STATS';
        photoItem = acceptable[acceptable.length - 1].item;
      } else {
        variant = 'BACK_STATS';
      }
    }
  }

  return {
    page_index: 0,
    layout_id: null,
    content: {
      kind: 'back-cover',
      variant,
      itemIds: photoItem ? [photoItem.id] : [],
      photoAdjust: resolveCoverPhotoAdjust(overrides.backPhotoAdjust),
      statsLine,
      phrase,
      theme
    }
  };
}

/**
 * Point d'entree principal : assemble [couverture, ...pages interieures,
 * 4e de couverture] avec un page_index reassigne sequentiellement. Les
 * pages interieures elles-memes ne sont jamais modifiees au-dela de leur
 * page_index.
 *
 * @param {object} input - { book, items, template, interiorPages, format }
 * @returns {Array} pages, pretes pour pageRenderer.js / pdfService.js
 */
function composeCoversIntoPages({ book, items, template, interiorPages, format }) {
  const resolvedFormat = format || resolveCoverFormat(DEFAULT_COVER_FORMAT_ID);
  const safeItems = Array.isArray(items) ? items : [];

  const front = composeFrontCover({ book, items: safeItems, template, format: resolvedFormat });
  const back = composeBackCover({
    book,
    items: safeItems,
    template,
    format: resolvedFormat,
    frontCoverItemIds: front.content.itemIds
  });

  const pages = [front, ...(Array.isArray(interiorPages) ? interiorPages : []), back];
  // La renumerotation ci-dessous insere la couverture en tete : la page
  // interieure 0 devient l'index 1, et toutes les parites basculent. Or la
  // moitie affichee d'une photo en DOUBLE PAGE se deduit justement de cette
  // parite (voir pageRenderer.spreadIndexOf) — sans `spreadIndex`, les deux
  // moities sortaient echangees dans le PDF, et seulement dans le PDF.
  // Signale trois fois (2026-09-15/16) ; les controles precedents ne le
  // voyaient pas car ils appelaient le rendu sans passer par ici.
  return pages.map((page, index) => ({
    ...page,
    spreadIndex: Number.isInteger(page.page_index) ? page.page_index : index,
    page_index: index
  }));
}

module.exports = {
  composeFrontCover,
  composeBackCover,
  composeCoversIntoPages,
  COVER_PHOTO_THRESHOLDS,
  MULTI_PHOTO_TRIGGER_COUNT,
  MULTI_PHOTO_MAX
};
