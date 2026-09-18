// backend/services/composition/pageRenderer.js
//
// Rendu HTML du resultat du moteur de mise en page (book_pages -> document
// HTML autonome). Fonction pure : ne touche ni la base ni le disque. Le CSS
// est volontairement auto-suffisant (pas de dependance a book-variables.css
// / BookLuxe.css du frontend, qui sont concues pour le rendu chapitre/prose
// existant, pas pour des pages a base de slots photo/texte/contribution).
//
// Chaque bloc connait le slug du layout choisi par layoutEngine (pas
// seulement son "kind") : c'est ce qui rend visible, a l'ecran, le fait de
// "regenerer avec une autre presentation" (variant) — sans ca, deux layouts
// candidats du meme kind/nombre d'items (ex. photo-pleine-page vs
// photo-avec-marge) rendraient un HTML identique.
//
// Consomme par pdfService.js (Chrome headless -> PDF) et par la route
// GET /api/books/:bookId/preview.html (ouvrable directement au navigateur,
// sans dependance a un binaire Chrome).

const DEFAULT_FORMAT = { trimWidthMm: 210, trimHeightMm: 280 }; // "standard" (coverFormat.js) — realigne 2026-09-09, voir son en-tete

// Polices reellement chargees dans tout le projet (verifie par grep
// exhaustif : frontend/public/index.html, luxe-theme.css, et l'ancien
// pipeline PDF backend/routes/books.js chargent exactement les memes) —
// jamais d'autre police. Sans ce lien, 'Cormorant Garamond' referencee plus
// bas retombait silencieusement sur Georgia (jamais reellement chargee).
const GOOGLE_FONTS_LINK = '<link rel="preconnect" href="https://fonts.googleapis.com" /><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin /><link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;1,300;1,400&family=Playfair+Display:wght@400;500&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />';

const typography = require('./typographySystem');

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Bornes du zoom manuel (voir imgFrame ci-dessous) — exportees en bas de
// fichier et reutilisees telles quelles par routes/composition.js
// (sanitizePhotoAdjustments), source unique, jamais dupliquees a la main.
const PHOTO_ZOOM_MIN = 1;
const PHOTO_ZOOM_MAX = 2.5;

function clamp(value, min, max) {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return Math.min(max, Math.max(min, num));
}

// Cadre d'image (voir .photo-frame dans BASE_CSS) : a utiliser
// systematiquement a la place d'un <img> brut pour toute photo du livre.
// `adjustment` (optionnel) : { focalX, focalY, zoom, fitMode } issu de
// content.photoAdjustments (voir routes/composition.js PUT .../manual) —
// absent pour tout appel existant (couvertures via frontCoverRenderer.js/
// backCoverRenderer.js, ou toute page interieure jamais ajustee a la main) :
// les valeurs par defaut ci-dessous (centre, zoom 1) reproduisent alors
// exactement l'ancien rendu "cover centre", donc aucun appelant existant
// n'a besoin d'etre modifie pour rester correct.
//
// `caption` (optionnel) : legende propre A CETTE PHOTO, issue de
// content.photoCaptions[itemId] (voir routes/composition.js
// sanitizePhotoCaptions). Deliberement portee par la PHOTO et non par le
// format : l'utilisateur veut legender la photo qu'il regarde, sans avoir a
// changer de mise en page pour un format qui prevoit une legende (retour
// 2026-09-14). Elle se pose donc DANS le cadre, par-dessus le bas de
// l'image — aucune geometrie de page n'est modifiee, et ca marche
// identiquement sur une photo pleine page comme dans une grille.
function imgFrame(url, adjustment, caption) {
  const fitMode = adjustment?.fitMode === 'contain' ? 'contain' : 'cover';
  const focalX = clamp(adjustment?.focalX, 0, 1) ?? 0.5;
  const focalY = clamp(adjustment?.focalY, 0, 1) ?? 0.5;
  const zoom = clamp(adjustment?.zoom, PHOTO_ZOOM_MIN, PHOTO_ZOOM_MAX) ?? 1;
  const cls = fitMode === 'contain' ? 'photo-frame is-contain' : 'photo-frame';
  const style = `--fx:${Math.round(focalX * 1000) / 10}%;--fy:${Math.round(focalY * 1000) / 10}%;--zoom:${zoom};`;
  // La legende accepte DEUX formes : une chaine (couleur par defaut) ou
  // { texte, couleur }. L'ancienne forme reste valide telle quelle — les
  // legendes ecrites avant l'ajout du noir s'affichent exactement pareil,
  // sans migration de donnees.
  const legendeTexte = typeof caption === 'string' ? caption : caption?.texte;
  // Seulement DEUX couleurs, jamais une palette : une legende posee sur une
  // photo doit rester lisible, et le seul vrai choix est "clair sur sombre"
  // ou "sombre sur clair". Une valeur inconnue retombe sur le blanc, le
  // comportement d'avant (decision produit 2026-09-15).
  const legendeCouleur = (caption && typeof caption === 'object' && caption.couleur === 'noir') ? 'noir' : 'blanc';
  const legende = typeof legendeTexte === 'string' && legendeTexte.trim()
    ? `<span class="photo-caption is-${legendeCouleur}">${escapeHtml(legendeTexte.trim())}</span>`
    : '';
  return `<span class="${cls}"><img src="${escapeHtml(url || '')}" alt="" style="${style}" />${legende}</span>`;
}

// Fragment de texte affiche pour cet item : le texte reel de l'item, sauf si
// le moteur a decoupe un texte trop long (textOverrides — voir
// layoutEngine.js/textLength.js), auquel cas c'est le fragment concerne.
function textFor(item, overridesByItemId) {
  const override = overridesByItemId[item.id];
  return override ? override.text : (item.text || '');
}

// Applique a UN texte le role et les reglages typographiques choisis par
// l'utilisateur dans l'atelier (content.textRoles / content.textStyles, voir
// AtelierTextEditor.js et routes/composition.js sanitizeTextRoles/Styles).
//
// CORRIGE 2026-09-11 : ces deux champs etaient persistes et lus par le
// controle qualite, mais le RENDU les ignorait completement — changer le
// style d'un texte dans l'atelier ne changeait donc rien a la page
// ("le texte s'enregistre mais la mise en forme ne change pas").
//
// Rendu en INLINE, volontairement : les regles de role du CSS s'appliquent
// via les selecteurs historiques (`.mixte-ordered .mixte-texte p`,
// `.page-title`...), dont la specificite depasse celle d'une simple classe
// `.text-role-X` — ajouter une classe ici perdrait donc silencieusement le
// duel de specificite. L'inline gagne toujours, et reste entierement calcule
// par typographySystem.resolveRoleStyle : une seule source de verite.
//
// Ne produit RIEN quand l'utilisateur n'a rien choisi pour cet item : le
// rendu existant (markup + CSS de role) reste alors strictement inchange,
// donc aucune page deja composee ne bouge.
//
// Toutes les valeurs injectees viennent de tables fermees (roles, palette,
// alignements) et sont bornees par resolveRoleStyle — jamais du texte libre.
// `presentation.fits` (voir buildTextFits) : ajustement automatique calcule
// une fois par page. Il apporte deux choses que le CSS seul ne peut pas
// deduire, parce qu'elles dependent de la LONGUEUR du texte :
//   - une taille agrandie quand le texte n'occupe qu'une petite part de son
//     emplacement (borne par la plage du role) ;
//   - un centrage quand le texte est trop court pour etre justifie.
//
// Prudence deliberee : on n'applique JAMAIS une reduction issue de cet
// ajustement. La hauteur d'emplacement dont il part est une estimation
// (TEXT_SLOT_HEIGHT_SHARE, lue sur le CSS et non mesuree) ; s'en servir pour
// agrandir ne risque au pire que de moins bien remplir, alors que s'en servir
// pour reduire pourrait rapetisser un texte qui tenait tres bien. Un texte
// trop long reste donc signale par le controle qualite, jamais rabote en
// silence (§9).
function textPresentationStyle(itemId, presentation = {}) {
  if (!itemId) return '';
  const role = presentation.roles?.[itemId];
  const overrides = presentation.styles?.[itemId];
  const fit = presentation.fits?.[itemId];
  if (!role && !overrides && !fit) return '';

  // Aucun choix de l'utilisateur : on n'ecrit QUE les deux proprietes issues
  // de l'ajustement. Poser ici toute la fiche de style du role ecraserait les
  // selecteurs historiques (.page-title, .contribution-message...) avec un
  // role par defaut qui n'est pas forcement le leur — c'est precisement ce que
  // le garde-fou d'origine evitait.
  if (!role && !overrides) {
    const parts = [];
    if (fit.sizePt) parts.push(`font-size:${fit.sizePt}pt`);
    if (fit.align) parts.push(`text-align:${fit.align}`);
    return parts.length ? ` style="${parts.join(';')}"` : '';
  }

  const style = typography.resolveRoleStyle(role, presentation.formatId, overrides || {});
  // La taille CHOISIE par l'utilisateur fait foi ; sinon l'agrandissement
  // automatique s'applique. Idem pour l'alignement.
  const explicitSize = Number.isFinite(Number(overrides?.sizePt));
  const sizePt = !explicitSize && fit?.sizePt ? fit.sizePt : style.fontSizePt;
  const explicitAlign = ['left', 'center', 'right', 'justify'].includes(overrides?.align);
  const align = !explicitAlign && fit?.align ? fit.align : style.align;

  return ` style="font-family:${style.fontFamily};font-size:${sizePt}pt;`
    + `line-height:${style.lineHeight};letter-spacing:${style.letterSpacingEm}em;`
    + `font-weight:${style.fontWeight};font-style:${style.fontStyle};`
    + `text-align:${align};color:${style.color}"`;
}

// Ajustement automatique de CHAQUE texte de la page, calcule une seule fois
// puis simplement transporte dans `textPresentation` — les 24 points d'appel
// de textPresentationStyle n'ont ainsi rien a savoir de la geometrie.
//
// La nature de l'emplacement (role par defaut, part de hauteur disponible)
// vient de textQualityEngine : c'est deja lui qui decrit cette geometrie pour
// le controle avant commande, et en faire une deuxieme description ici
// donnerait deux verites sur une meme page.
function buildTextFits({ blocks, itemsById, layoutsById, formatId, roles = {}, styles = {} }) {
  const textQuality = require('./textQualityEngine');
  const usable = textQuality.resolveUsableAreaMm(formatId);
  const fits = {};

  (Array.isArray(blocks) ? blocks : []).forEach((block) => {
    const slug = layoutsById[block.layoutId]?.slug;
    const heightShare = textQuality.TEXT_SLOT_HEIGHT_SHARE[slug];
    // Layout inconnu de la table : on ne devine pas de geometrie, donc pas
    // d'ajustement — la page reste rendue exactement comme avant.
    if (heightShare == null) return;

    (block.itemIds || []).forEach((itemId, slotIndex) => {
      const item = itemId ? itemsById[itemId] : null;
      if (!item || item.kind !== 'texte') return;

      const role = roles[itemId] || textQuality.defaultRoleForSlot(slug, slotIndex);
      const overrides = styles[itemId] || {};
      const natural = typography.resolveRoleStyle(role, formatId, {});
      const fit = typography.fitTextToSlot({
        text: item.text,
        role,
        formatId,
        slotWidthMm: usable.widthMm,
        slotHeightMm: usable.heightMm * heightShare,
        overrides
      });

      fits[itemId] = {
        role,
        // Jamais de reduction issue d'une estimation : voir textPresentationStyle.
        sizePt: fit.fontSizePt > natural.fontSizePt ? fit.fontSizePt : null,
        align: fit.align !== natural.align ? fit.align : null,
        lines: fit.lines,
        fillRatio: fit.fillRatio
      };
    });
  });

  return fits;
}

// Marqueur "(n/total)" affiche des qu'un texte a ete decoupe (y compris sur
// son premier fragment, pour signaler au lecteur que le temoignage continue).
// Sur les pages de suite d'une contribution decoupee (continuation=true), une
// ligne d'attribution est ajoutee au lieu de re-afficher photo+nom (voir
// layoutEngine.js : la contribution reste atomique, seul son texte continue).
function splitMetaFor(item, overridesByItemId) {
  const override = overridesByItemId[item.id];
  if (!override || !override.splitTotal || override.splitTotal <= 1) return '';

  const marker = `<span class="split-marker">(${override.splitIndex + 1}/${override.splitTotal})</span>`;
  if (!override.continuation) return marker;

  const name = item?.metadata?.contributor_name;
  const attribution = name
    ? `<p class="contribution-name contribution-continuation">— ${escapeHtml(name)} (suite)</p>`
    : `<p class="contribution-name contribution-continuation">(suite)</p>`;
  return `${attribution}${marker}`;
}

// `presentationVariant` (0 ou 1, voir layoutEngine.js) alterne une
// sous-presentation purement cosmetique — jamais le contenu place ni son
// ordre de lecture a travers les pages, seulement l'arrangement visuel
// interne d'UNE page. C'est ce qui garantit que "essayer une autre
// presentation" change toujours quelque chose de visible, meme quand le
// scoring ne depart aucune egalite entre deux layouts differents pour un
// contenu donne.
// `rawItems` : items resolus POSITIONNELLEMENT (un `null`/`undefined` la ou
// l'emplacement est vide) plutot que la liste compactee — chaque photo
// garde sa PROPRE case dans la grille meme quand une AUTRE photo du meme
// groupe a ete retiree (retour utilisateur : "il faut absolument que les
// autres photos restent a leur place" — retirer la photo du haut-gauche
// d'une grille de 4 ne doit jamais faire "remonter" les 3 autres dans une
// grille de 3 recomposee). La taille/forme de la grille (photo-grid-N) suit
// donc TOUJOURS rawItems.length (le nombre d'emplacements du format), pas
// le nombre de photos reellement presentes. Un emplacement vide rend un
// .photo-frame VIDE (memes regles CSS de positionnement/grille qu'un
// emplacement rempli — ex. la 3e case de THREE_PHOTOS reste pleine largeur
// meme vide — mais sans <img> : simple espace blanc, comme sur la page
// imprimee finale, jamais un cadre pointille ou un placeholder visible —
// ca, c'est le role du panneau d'edition, pas du rendu reel).
function renderPhotoBlock(rawItems, slug, presentationVariant = 0, adjustmentsByItemId = {}, pageIndex = 0, captionsByItemId = {}) {
  const slotCount = rawItems.length;
  const orderedItems = presentationVariant === 1 && slotCount > 1 ? [...rawItems].reverse() : rawItems;

  if (slotCount === 1) {
    const item = orderedItems[0];
    if (!item) return '';

    // Photo etalee sur la DOUBLE PAGE : la meme image est posee sur les deux
    // pages, chacune n'en montrant que sa moitie. La moitie affichee se deduit
    // de la PARITE du numero de page — index pair = page de gauche, impair =
    // page de droite — exactement la convention de l'atelier
    // (leftPageIndex = spread * 2). Aucune donnee supplementaire a stocker :
    // la position de la page porte deja l'information.
    if (slug === 'FULL_PHOTO_SPREAD') {
      const moitie = pageIndex % 2 === 0 ? 'is-spread-left' : 'is-spread-right';
      return `<figure class="block-photo photo-spread ${moitie}" data-layout="${escapeHtml(slug)}">${imgFrame(item.url, adjustmentsByItemId[item.id])}</figure>`;
    }

    const inset = slug === 'photo-avec-marge' || (slug === 'FULL_PHOTO' && presentationVariant === 1);
    const cls = inset ? 'block-photo photo-solo photo-inset' : 'block-photo photo-solo';
    return `<figure class="${cls}" data-layout="${escapeHtml(slug || '')}">${imgFrame(item.url, adjustmentsByItemId[item.id], captionsByItemId[item.id])}</figure>`;
  }
  const cells = orderedItems.map((item) => (item ? imgFrame(item.url, adjustmentsByItemId[item.id], captionsByItemId[item.id]) : '<span class="photo-frame" aria-hidden="true"></span>'));
  // "duo-v" = les deux photos EMPILEES (une colonne, deux rangees), donc deux
  // cadres larges et bas. Piege de vocabulaire a garder en tete : l'empilement
  // est vertical, les cadres sont horizontaux — c'est ce que l'utilisateur
  // appelle "2 photos horizontales" (TWO_PHOTOS_STACKED, ajoute le
  // 2026-09-13). `photo-duo-vertical` est l'ancien slug inactif equivalent,
  // conserve pour les livres composes avant le catalogue v2.
  const vertical = slug === 'photo-duo-vertical'
    || slug === 'TWO_PHOTOS_STACKED'
    || (slug === 'TWO_PHOTOS' && slotCount === 2 && presentationVariant === 1);
  if (slotCount === 2 && vertical) {
    return `<div class="block-photo photo-grid photo-grid-duo-v" data-layout="${escapeHtml(slug)}">${cells.join('')}</div>`;
  }
  return `<div class="block-photo photo-grid photo-grid-${Math.min(slotCount, 6)}" data-layout="${escapeHtml(slug || '')}">${cells.join('')}</div>`;
}

// Sur quelle page d'une double page se trouve-t-on ?
//
// La reponse se lit sur la parite de la page INTERIEURE : index pair =
// page de gauche, impair = page de droite (convention de l'atelier,
// leftPageIndex = spread * 2). Mais `page_index` ne porte pas toujours ce
// sens : pour un export PDF, composeCoversIntoPages renumerote tout afin
// de placer la couverture en tete, et decale donc la parite d'un cran.
// Il conserve pour cela l'index d'origine dans `spreadIndex`, seul digne
// de confiance ici. Deduire la moitie du seul `page_index` etait la cause
// des moities echangees dans le PDF.
function spreadIndexOf(page) {
  if (Number.isInteger(page?.spreadIndex)) return page.spreadIndex;
  return Number(page?.page_index) || 0;
}

// `rawItems` : positionnel (voir renderPhotoBlock ci-dessus, meme principe)
// — ne sert reellement qu'a TWO_TESTIMONIES/THREE_TESTIMONIES (plusieurs
// cartes cote a cote, ou retirer UN temoignage ne doit jamais faire glisser
// les autres dans une grille recomposee). ONE_TESTIMONY (1 seul
// emplacement) et le repli generique paragraphes n'ont pas cette notion de
// grille — aucun changement de comportement pour eux.
function renderTexteBlock(rawItems, slug, overridesByItemId = {}, presentationVariant = 0, textPresentation = {}) {
  const slotCount = rawItems.length;
  const orderedItems = presentationVariant === 1 && slotCount > 1 ? [...rawItems].reverse() : rawItems;
  const firstReal = orderedItems.find(Boolean);
  const firstOverride = overridesByItemId[firstReal?.id];
  const isSplitFragment = Boolean(firstOverride && firstOverride.splitTotal > 1);

  // La sous-presentation "citation" n'est proposee que pour un temoignage
  // complet (jamais un fragment d'un texte decoupe — une immense citation
  // stylisee autour d'un morceau de phrase serait trompeuse).
  const useCitation = slug === 'texte-citation' || (slug === 'ONE_TESTIMONY' && presentationVariant === 1 && !isSplitFragment);
  if (useCitation && slotCount === 1) {
    if (!firstReal) return '';
    return `<div class="block-texte texte-citation" data-layout="${escapeHtml(slug)}"><p${textPresentationStyle(firstReal.id, textPresentation)}>${escapeHtml(textFor(firstReal, overridesByItemId))}</p>${splitMetaFor(firstReal, overridesByItemId)}</div>`;
  }

  // TWO_TESTIMONIES / THREE_TESTIMONIES (v2) : plusieurs temoignages
  // independants sur une meme page, presentes en colonnes/cartes distinctes
  // plutot qu'empiles comme de simples paragraphes — une carte vide (emplacement
  // retire) reste presente mais sans styling ni texte, juste pour que les
  // AUTRES cartes gardent leur colonne d'origine (grille CSS fixe).
  if ((slug === 'TWO_TESTIMONIES' || slug === 'THREE_TESTIMONIES') && slotCount > 1) {
    const cards = orderedItems
      .map((item) => (item
        ? `<div class="testimony-card"><p${textPresentationStyle(item.id, textPresentation)}>${escapeHtml(textFor(item, overridesByItemId))}</p>${splitMetaFor(item, overridesByItemId)}</div>`
        : '<div aria-hidden="true"></div>'))
      .join('');
    return `<div class="block-texte testimony-stack testimony-stack-${slotCount}" data-layout="${escapeHtml(slug)}">${cards}</div>`;
  }

  const cls = slug === 'texte-pleine-page' || slug === 'ONE_TESTIMONY' ? 'block-texte texte-pleine' : 'block-texte';
  const paragraphs = orderedItems
    .filter(Boolean)
    .map((item) => `<p${textPresentationStyle(item.id, textPresentation)}>${escapeHtml(textFor(item, overridesByItemId))}</p>${splitMetaFor(item, overridesByItemId)}`)
    .join('');
  return `<div class="${cls}" data-layout="${escapeHtml(slug || '')}">${paragraphs}</div>`;
}

function renderContributionBlock(items, slug, overridesByItemId = {}, presentationVariant = 0, adjustmentsByItemId = {}, textPresentation = {}, captionsByItemId = {}) {
  const photos = items.filter((item) => item.kind === 'photo');
  const textes = items.filter((item) => item.kind === 'texte');
  const orderedPhotos = presentationVariant === 1 && photos.length > 1 ? [...photos].reverse() : photos;
  const contributorName = items.map((item) => item?.metadata?.contributor_name).find(Boolean);

  const photosHtml = orderedPhotos.length > 0
    ? `<div class="contribution-photos photo-grid photo-grid-${Math.min(orderedPhotos.length, 4)}">${orderedPhotos
        .map((item) => imgFrame(item.url, adjustmentsByItemId[item.id], captionsByItemId[item.id]))
        .join('')}</div>`
    : '';
  const textHtml = textes
    .map((item) => `<p class="contribution-message"${textPresentationStyle(item.id, textPresentation)}>${escapeHtml(textFor(item, overridesByItemId))}</p>${splitMetaFor(item, overridesByItemId)}`)
    .join('');
  const nameHtml = contributorName ? `<p class="contribution-name">${escapeHtml(contributorName)}</p>` : '';

  return `<div class="block-contribution" data-layout="${escapeHtml(slug || '')}">${photosHtml}${textHtml}${nameHtml}</div>`;
}

// PHOTO_WITH_CAPTION (v2) : une photo pleine page avec une courte legende.
// Sous-presentation : legende centree (defaut) ou alignee/encadree (variant).
function renderPhotoWithCaption(items, slug, overridesByItemId, presentationVariant = 0, adjustmentsByItemId = {}, textPresentation = {}, captionsByItemId = {}) {
  const photo = items.find((item) => item.kind === 'photo');
  const caption = items.find((item) => item.kind === 'texte');
  const photoHtml = photo ? imgFrame(photo.url, adjustmentsByItemId[photo.id], captionsByItemId[photo.id]) : '';
  const captionHtml = caption ? `<figcaption${textPresentationStyle(caption.id, textPresentation)}>${escapeHtml(textFor(caption, overridesByItemId))}</figcaption>` : '';
  const cls = presentationVariant === 1 ? 'block-photo photo-with-caption is-framed' : 'block-photo photo-with-caption';
  return `<figure class="${cls}" data-layout="${escapeHtml(slug)}">${photoHtml}${captionHtml}</figure>`;
}

// PHOTO_TEXT / TEXT_PHOTO / TWO_PHOTOS_TEXT (v2) : layouts mixtes, ou l'ordre
// visuel de base (photo avant/apres le texte) suit l'ordre reel des items,
// determine par layoutEngine.js au moment de la composition (jamais
// reordonne pour le choix du contenu). Le variant de presentation, lui, peut
// inverser cet ordre VISUELLEMENT (ex. PHOTO_TEXT prend alors l'allure de
// TEXT_PHOTO) — un simple effet de mise en page, le contenu place ne change pas.
// Nature de chaque emplacement, par mise en page. Necessaire parce qu'un
// emplacement VIDE ne porte aucun item dont on pourrait lire le `kind` : sans
// cette table, on ne saurait pas s'il faut reserver une bande photo ou une
// bande texte. Meme convention que PHOTO_SLOT_RATIOS (layoutScoring.js) :
// l'ordre suit exactement celui des emplacements du layout.
const MIXTE_SLOT_KINDS = {
  PHOTO_TEXT: ['photo', 'texte'],
  TEXT_PHOTO: ['texte', 'photo'],
  TWO_PHOTOS_TEXT: ['photo', 'photo', 'texte']
};

// `rawItems` : POSITIONNEL (un `null`/`undefined` la ou l'emplacement est
// vide), comme renderPhotoBlock/renderTexteBlock/renderTitlePhotosBlock.
//
// BUG CORRIGE 2026-09-11 (signale sur capture) : ce bloc recevait la liste
// COMPACTEE, donc un emplacement vide disparaissait purement et simplement du
// rendu. Sur un TEXT_PHOTO dont la photo n'est pas encore posee, le bloc
// texte devenait le seul enfant flex et s'etalait sur TOUTE la page, centre
// verticalement (.mixte-texte { align-items: center }) — le texte
// apparaissait donc au milieu, c'est-a-dire visuellement dans l'emplacement
// photo, alors que l'incrustation d'edition le montrait en haut.
//
// C'est exactement le principe deja applique aux grilles de photos ("il faut
// absolument que les autres photos restent a leur place") : un emplacement
// vide garde sa bande, vide, pour que les autres ne bougent pas.
function renderMixteOrderedBlock(rawItems, slug, overridesByItemId, presentationVariant = 0, adjustmentsByItemId = {}, textPresentation = {}, captionsByItemId = {}) {
  const slotKinds = MIXTE_SLOT_KINDS[slug] || [];
  // On travaille sur des paires (emplacement, item) pour que l'inversion de
  // presentation ne desynchronise jamais la nature de l'emplacement et son
  // contenu.
  const slots = rawItems.map((item, index) => ({
    item,
    kind: item?.kind || slotKinds[index] || 'texte'
  }));
  const orderedSlots = presentationVariant === 1 ? [...slots].reverse() : slots;

  const parts = orderedSlots.map(({ item, kind }) => {
    if (kind === 'photo') {
      // Emplacement photo vide : meme bande, simple espace blanc — jamais un
      // cadre pointille ni un placeholder, qui apparaitraient a l'impression.
      const inner = item ? imgFrame(item.url, adjustmentsByItemId[item.id], captionsByItemId[item.id]) : '<span class="photo-frame" aria-hidden="true"></span>';
      return `<div class="mixte-photo">${inner}</div>`;
    }
    const inner = item
      ? `<p${textPresentationStyle(item.id, textPresentation)}>${escapeHtml(textFor(item, overridesByItemId))}</p>${splitMetaFor(item, overridesByItemId)}`
      : '';
    return `<div class="mixte-texte">${inner}</div>`;
  });

  const photoCount = slots.filter((slot) => slot.kind === 'photo').length;
  const cls = photoCount > 1 ? 'block-mixte mixte-ordered mixte-multi-photo' : 'block-mixte mixte-ordered';
  return `<div class="${cls}" data-layout="${escapeHtml(slug)}">${parts.join('')}</div>`;
}

// TITLE_TEXT / TITLE_TWO_PHOTOS / TITLE_FOUR_PHOTOS (atelier manuel) : le
// premier item est toujours le titre (slot texte court en position 0, voir
// sql/phase11_manual_layouts.sql) — meme principe positionnel que
// renderMixteOrderedBlock, jamais un nouveau "type" de slot cote donnees.
// `rawItems` : items resolus POSITIONNELLEMENT (un `undefined` la ou
// l'emplacement est vide), PAS la liste compactee que renderBlock calcule
// pour les autres mises en page — ici la position 0 est TOUJOURS le titre
// par convention (voir plus haut : "le titre est toujours le premier item
// du bloc"). Compacter avant d'arriver ici casserait cette convention des
// qu'un retrait partiel touche le titre : le prochain item (une photo/un
// texte) glisserait en position 0 et serait a tort traite comme le titre,
// pendant que le vrai contenu restant disparaitrait du rendu (retour
// utilisateur : "les autres elements ne restent pas a leur place").
function renderTitleTextBlock(rawItems, slug, overridesByItemId = {}, textPresentation = {}) {
  const title = rawItems[0];
  const body = rawItems[1];
  // Chaque emplacement garde sa BANDE, rempli ou non — meme principe que les
  // grilles de photos et que renderMixteOrderedBlock.
  //
  // BUG REEL 2026-09-11 : sans le corps de texte, le titre devenait seul
  // enfant d'un bloc en `justify-content: center` et se centrait donc
  // VERTICALEMENT au milieu de la page, alors que l'incrustation d'edition
  // le montre en haut. L'utilisateur deposait un souvenir dans le titre et le
  // voyait apparaitre plus bas ("celui-ci est apparu dans le texte en bas").
  const titleHtml = title
    ? `<h2 class="page-title"${textPresentationStyle(title.id, textPresentation)}>${escapeHtml(textFor(title, overridesByItemId))}</h2>`
    : '<h2 class="page-title" aria-hidden="true"></h2>';
  const bodyHtml = body
    ? `<div class="title-text-body"><p${textPresentationStyle(body.id, textPresentation)}>${escapeHtml(textFor(body, overridesByItemId))}</p>${splitMetaFor(body, overridesByItemId)}</div>`
    : '<div class="title-text-body" aria-hidden="true"></div>';
  return `<div class="block-title-text" data-layout="${escapeHtml(slug)}">${titleHtml}${bodyHtml}</div>`;
}

// Meme principe que renderTitleTextBlock ci-dessus : `rawItems[0]` est
// TOUJOURS le titre (jamais deduit d'une liste compactee), le reste
// (photos) reste lui aussi POSITIONNEL (voir renderPhotoBlock) — un trou
// parmi les photos ne decale jamais le titre ET ne decale jamais les
// AUTRES photos ; la grille garde toujours le nombre d'emplacements du
// format (title-photos-grid-N base sur photoSlots.length, jamais sur le
// compte reel de photos presentes), avec un .photo-frame vide pour tout
// emplacement retire.
function renderTitlePhotosBlock(rawItems, slug, adjustmentsByItemId = {}, textPresentation = {}, captionsByItemId = {}) {
  const title = rawItems[0];
  const photoSlots = rawItems.slice(1);
  // Titre absent : sa bande reste (meme raison que renderTitleTextBlock) —
  // sinon la grille de photos remonte et ne correspond plus a ce que montre
  // l'incrustation d'edition.
  const titleHtml = title
    ? `<h2 class="page-title"${textPresentationStyle(title.id, textPresentation)}>${escapeHtml(title.text || '')}</h2>`
    : '<h2 class="page-title" aria-hidden="true"></h2>';
  const photosHtml = photoSlots.length > 0
    ? `<div class="title-photos-grid title-photos-grid-${Math.min(photoSlots.length, 4)}">${photoSlots.map((item) => (item ? imgFrame(item.url, adjustmentsByItemId[item.id], captionsByItemId[item.id]) : '<span class="photo-frame" aria-hidden="true"></span>')).join('')}</div>`
    : '';
  return `<div class="block-title-photos" data-layout="${escapeHtml(slug)}">${titleHtml}${photosHtml}</div>`;
}

const PHOTO_SLUGS = new Set(['FULL_PHOTO', 'FULL_PHOTO_SPREAD', 'TWO_PHOTOS', 'TWO_PHOTOS_STACKED', 'THREE_PHOTOS', 'FOUR_PHOTOS']);
const TEXTE_SLUGS = new Set(['ONE_TESTIMONY', 'TWO_TESTIMONIES', 'THREE_TESTIMONIES']);
const MIXTE_ORDERED_SLUGS = new Set(['PHOTO_TEXT', 'TEXT_PHOTO', 'TWO_PHOTOS_TEXT']);
const TITLE_PHOTO_SLUGS = new Set(['TITLE_TWO_PHOTOS', 'TITLE_FOUR_PHOTOS']);

// `adjustmentsByItemId` : { [itemId]: {focalX, focalY, zoom, fitMode} },
// source unique = page.content.photoAdjustments (voir renderPage/
// renderSinglePageHtml) — jamais reconstruit ici, propage seulement.
// `pageIndex` : necessaire au seul layout FULL_PHOTO_SPREAD, qui deduit de la
// parite de la page la moitie de l image a afficher. Zero par defaut — tout
// autre layout l ignore.
function renderBlock(block, itemsById, layoutsById, adjustmentsByItemId = {}, textPresentation = {}, pageIndex = 0, captionsByItemId = {}) {
  const items = block.itemIds.map((id) => itemsById[id]).filter(Boolean);
  if (items.length === 0) return '';

  const slug = layoutsById[block.layoutId]?.slug;
  const overridesByItemId = Object.fromEntries((block.textOverrides || []).map((override) => [override.itemId, override]));
  const presentationVariant = block.presentationVariant === 1 ? 1 : 0;

  if (slug === 'PHOTO_WITH_CAPTION') return renderPhotoWithCaption(items, slug, overridesByItemId, presentationVariant, adjustmentsByItemId, textPresentation, captionsByItemId);
  // TITLE_TEXT/TITLE_PHOTO_SLUGS : jamais la liste compactee `items` — la
  // position 0 doit rester le titre meme quand un emplacement plus loin
  // est vide (voir renderTitleTextBlock/renderTitlePhotosBlock ci-dessus).
  if (slug === 'TITLE_TEXT') {
    return renderTitleTextBlock(block.itemIds.map((id) => itemsById[id]), slug, overridesByItemId, textPresentation);
  }
  if (TITLE_PHOTO_SLUGS.has(slug)) {
    return renderTitlePhotosBlock(block.itemIds.map((id) => itemsById[id]), slug, adjustmentsByItemId, textPresentation, captionsByItemId);
  }
  // POSITIONNEL (block.itemIds, pas `items` compacte) : un emplacement vide
  // doit garder sa bande — voir renderMixteOrderedBlock.
  if (MIXTE_ORDERED_SLUGS.has(slug)) {
    return renderMixteOrderedBlock(block.itemIds.map((id) => itemsById[id]), slug, overridesByItemId, presentationVariant, adjustmentsByItemId, textPresentation, captionsByItemId);
  }
  // PHOTO_SLUGS/TEXTE_SLUGS : idem, positionnel — voir renderPhotoBlock/
  // renderTexteBlock ("il faut absolument que les autres photos restent a
  // leur place lorsque je supprime une autre photo ou un autre texte").
  if (PHOTO_SLUGS.has(slug)) {
    return renderPhotoBlock(block.itemIds.map((id) => itemsById[id]), slug, presentationVariant, adjustmentsByItemId, pageIndex, captionsByItemId);
  }
  if (TEXTE_SLUGS.has(slug)) {
    return renderTexteBlock(block.itemIds.map((id) => itemsById[id]), slug, overridesByItemId, presentationVariant, textPresentation);
  }

  if (block.kind === 'photo') return renderPhotoBlock(items, slug, presentationVariant, adjustmentsByItemId, pageIndex, captionsByItemId);
  if (block.kind === 'texte') return renderTexteBlock(items, slug, overridesByItemId, presentationVariant, textPresentation);
  if (block.kind === 'contribution') return renderContributionBlock(items, slug, overridesByItemId, presentationVariant, adjustmentsByItemId, textPresentation, captionsByItemId);
  // 'mixte' ou inconnu, sans slug reconnu ci-dessus : repli generique
  // photo(s) puis texte(s), pour tout layout heritage non catalogue.
  const photos = items.filter((item) => item.kind === 'photo');
  const textes = items.filter((item) => item.kind === 'texte');
  return `<div class="block-mixte">${photos.length ? renderPhotoBlock(photos, slug, presentationVariant, adjustmentsByItemId, pageIndex, captionsByItemId) : ''}${
    textes.length ? renderTexteBlock(textes, slug, overridesByItemId, presentationVariant, textPresentation) : ''
  }</div>`;
}

// Page de separation de chapitre (Luxe uniquement — voir
// formatComposer.js) : sobre a dessein, jamais de photo/texte reel, juste un
// numero et un titre entre deux filets fins. `page.content` = { number,
// title }, deja resolus par formatComposer.js (jamais invente ici — meme
// separation decision/rendu que le reste de ce module).
function renderChapterSeparatorPage(page, isLast) {
  const number = escapeHtml(page.content?.number || '');
  const title = escapeHtml(page.content?.title || '');
  const pageClass = isLast ? 'page page-separator' : 'page page-break page-separator';
  return `<section class="${pageClass}" data-page-index="${page.page_index}">
    <div class="separator-inner">
      <hr class="separator-rule" />
      <div class="separator-number">${number}</div>
      <div class="separator-title">${title}</div>
      <hr class="separator-rule" />
    </div>
  </section>`;
}

function renderPage(page, itemsById, layoutsById, isLast, context = {}) {
  // 1ere/4eme de couverture : pages a part, jamais composees par
  // layoutEngine.js — deleguees a frontCoverRenderer.js/backCoverRenderer.js
  // (voir coverComposer.js pour la decision de variante/photo). Require()
  // differe (pas en tete de fichier) : ces deux modules importent eux-memes
  // escapeHtml/imgFrame depuis CE fichier — un require en tete de fichier
  // creerait un cycle qui capturerait ces deux fonctions a `undefined` cote
  // cover renderer (le require circulaire renverrait des exports encore
  // incomplets). Differe jusqu'au premier appel reel, ce module est deja
  // completement charge des les deux cotes. Le reste de cette fonction
  // (branche ci-dessous) reste inchange pour toute page interieure normale.
  if (page.content?.kind === 'front-cover') {
    const { renderFrontCoverPage } = require('./frontCoverRenderer');
    return renderFrontCoverPage(page, { ...context, isLast, itemsById });
  }
  if (page.content?.kind === 'back-cover') {
    const { renderBackCoverPage } = require('./backCoverRenderer');
    return renderBackCoverPage(page, { ...context, isLast, itemsById });
  }
  // Page de separation de chapitre (Luxe uniquement — voir
  // formatComposer.js, jamais pour livret/standard) : purement decorative,
  // aucun itemId, jamais generee par layoutEngine.js lui-meme.
  if (page.content?.kind === 'chapter-separator') {
    return renderChapterSeparatorPage(page, isLast);
  }

  const blocks = Array.isArray(page.content?.blocks) ? page.content.blocks : [];
  // photoAdjustments : ajustement manuel (deplacer/zoomer, voir routes/
  // composition.js PUT .../manual) par itemId, propre a CETTE page — un
  // meme itemId ne peut de toute facon apparaitre que sur une seule page.
  const adjustmentsByItemId = page.content?.photoAdjustments || {};
  // Legendes propres a chaque photo (voir imgFrame) — jamais liees au format.
  const captionsByItemId = page.content?.photoCaptions || {};
  // Role et reglages typographiques choisis par l'utilisateur pour les
  // textes de CETTE page (voir textPresentationStyle). Le format est
  // necessaire ici : une meme taille de role n'a pas la meme valeur en
  // livret et en luxe.
  const textPresentation = {
    roles: page.content?.textRoles || {},
    styles: page.content?.textStyles || {},
    formatId: context?.format?.formatId
  };
  textPresentation.fits = buildTextFits({
    blocks,
    itemsById,
    layoutsById,
    formatId: textPresentation.formatId,
    roles: textPresentation.roles,
    styles: textPresentation.styles
  });
  const blocksHtml = blocks
    .map((block) => renderBlock(block, itemsById, layoutsById, adjustmentsByItemId, textPresentation, spreadIndexOf(page), captionsByItemId))
    .join('');
  // "is-luxe" : marqueur LEGER pour scoper les 2 seuls details dores qui
  // restent sur une page ordinaire (filet sous .page-title + numero de page,
  // voir BASE_CSS) — plus de cadre pleine page (retour utilisateur : "ne pas
  // mettre du doré partout", un cadre sur CHAQUE page etait trop present).
  const luxeClass = context?.format?.formatId === 'luxe' ? ' is-luxe' : '';
  const pageClass = isLast ? `page${luxeClass}` : `page page-break${luxeClass}`;
  const pageNumberHtml = context?.format?.formatId === 'luxe'
    ? `<span class="page-number-luxe">${page.page_index + 1}</span>`
    : '';
  return `<section class="${pageClass}" data-page-index="${page.page_index}"><div class="page-blocks">${blocksHtml}</div>${pageNumberHtml}</section>`;
}

const BASE_CSS = `
  * { box-sizing: border-box; }
  body { margin: 0; font-family: 'Georgia', 'Cormorant Garamond', serif; color: #241f18; background: #f4f0e6; }
  .page {
    width: var(--page-width-mm);
    height: var(--page-height-mm);
    padding: calc(14mm * var(--fmt-space-scale, 1) + var(--bleed-mm, 0mm));
    background: #fffdf8;
    position: relative;
    overflow: hidden;
    margin: 0 auto calc(8mm * var(--fmt-space-scale, 1));
  }
  .page-break { page-break-after: always; }
  .page-blocks { display: flex; flex-direction: column; gap: calc(6mm * var(--fmt-space-scale, 1)); height: 100%; }
  /* object-fit:cover (jamais contain) par defaut, decision utilisateur
     explicite (2026-09-10, cahier des charges "PhotoSlot") : une photo doit
     remplir 100% de son emplacement, jamais flotter avec des marges vides
     au milieu d'un grand cadre. Le prix accepte est le recadrage quand le
     ratio de la photo ne correspond pas exactement a celui de l'emplacement
     — normal et attendu (le moteur de composition choisit deja
     l'emplacement dont la FORME se rapproche le plus du ratio reel de la
     photo avant meme d'arriver ici, voir layoutScoring.js/PHOTO_SLOT_RATIOS
     — ce recadrage reste donc en general leger). --fx/--fy (point focal,
     0-100%) et --zoom (>=1) sont poses en style inline PAR IMAGE par
     imgFrame() ci-dessus, a partir de content.photoAdjustments — absents
     (photo jamais ajustee a la main), ils valent 50%/50%/1 : cover centre,
     identique visuellement a une photo qui n'a jamais ete touchee.
     .is-contain (classe posee par imgFrame quand fitMode==='contain') n'est
     plus un crochet inutilise depuis le 2026-09-13 : c'est le mode "photo
     entiere", choisi photo par photo dans AtelierPhotoAdjustModal quand le
     recadrage automatique coupe trop (voir plus bas). Meme non-perte de qualite
     qu'avant : ni recompression ni redimensionnement de l'original (voir
     storageService.js), seule la mise a l'echelle/le point d'ancrage
     d'affichage changent — et c'est le MEME rendu, ici, dans l'apercu
     navigateur et dans la capture PDF (pdfService.js capture ce HTML tel
     quel), donc aucune divergence possible entre apercu et PDF final/Gelato. */
  .photo-frame { position: relative; overflow: hidden; display: block; width: 100%; height: 100%; }
  .photo-frame img {
    position: absolute; top: 0; left: 0; width: 100%; height: 100%;
    object-fit: cover;
    object-position: var(--fx, 50%) var(--fy, 50%);
    transform: scale(var(--zoom, 1));
    transform-origin: var(--fx, 50%) var(--fy, 50%);
  }
  /* "Photo entiere" (fitMode:'contain', choisi photo par photo dans
     AtelierPhotoAdjustModal) : l'image tient TOUT ENTIERE dans le cadre, au
     prix de marges. C'est la reponse au besoin "pouvoir dezoomer un peu pour
     que la photo rentre dans le cadre" (2026-09-13) — avec object-fit:cover,
     un zoom inferieur a 1 ne revelerait rien de plus : il retrecirait l'image
     DEJA recadree, en laissant du blanc sur les bords. Seul le mode "photo
     entiere" change reellement ce qui est visible.
     Le zoom reste actif ici (il ne l'etait pas avant) : a partir de la photo
     entiere, l'utilisateur peut re-remplir progressivement jusqu'au recadrage
     — le reglage est donc continu d'un bout a l'autre, et non deux modes
     etanches. */
  .photo-frame.is-contain img {
    object-fit: contain;
    transform: scale(var(--zoom, 1));
    transform-origin: var(--fx, 50%) var(--fy, 50%);
  }
  /* Legende propre a UNE photo (content.photoCaptions), posee au bas de son
     cadre. Elle vit DANS le cadre, jamais dans la grille de la page : elle ne
     deplace donc rien, et le meme geste marche sur une photo pleine page
     comme sur une vignette d'une grille de quatre.
     Le degrade est indispensable a l'impression : sans lui, un texte clair
     pose sur une zone claire de la photo devient illisible, et l'imprimeur ne
     corrige rien. */
  .photo-frame .photo-caption {
    position: absolute;
    left: 0; right: 0; bottom: 0;
    padding: 5mm 4mm 3mm;
    font-family: 'Inter', -apple-system, sans-serif;
    font-size: 8.5pt;
    line-height: 1.3;
    letter-spacing: 0.01em;
  }
  /* Deux couleurs, et le VOILE SUIT LE TEXTE. C'est lui qui fait la
     lisibilite, pas la couleur seule : un texte blanc sur une photo
     surexposee disparait sans voile sombre, et un texte noir sur une photo
     sombre disparait sans voile clair. Les deux sont indissociables — d'ou
     un degrade par couleur, jamais une simple bascule de color. */
  .photo-frame .photo-caption.is-blanc {
    background: linear-gradient(to top, rgba(0, 0, 0, 0.55), rgba(0, 0, 0, 0));
    color: #fff;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.45);
  }
  .photo-frame .photo-caption.is-noir {
    background: linear-gradient(to top, rgba(255, 255, 255, 0.72), rgba(255, 255, 255, 0));
    color: #241f18;
    text-shadow: 0 1px 2px rgba(255, 255, 255, 0.55);
  }
  /* En mode "photo entiere", l'image ne touche plus les bords : la legende
     se poserait sur le blanc du cadre, ou le degrade sombre ferait une barre
     franche. Fond retire, texte en encre. */
  .photo-frame.is-contain .photo-caption,
  .photo-frame.is-contain .photo-caption.is-blanc,
  .photo-frame.is-contain .photo-caption.is-noir {
    background: none;
    color: #241f18;
    text-shadow: none;
    font-style: italic;
  }
  .block-photo, .block-texte, .block-contribution, .block-mixte, .block-title-text, .block-title-photos { flex: 1; min-height: 0; display: flex; flex-direction: column; }
  .photo-solo { margin: 0; height: 100%; }
  /* Une photo sur DOUBLE PAGE (FULL_PHOTO_SPREAD).
     Chaque page porte la MEME image et n'en montre que sa moitie. Trois
     decisions a connaitre :

     1. PLEIN BORD. La figure est posee en absolu sur toute la page
        (inset: 0), donc PAR-DESSUS la marge de page. Sans ca, les deux
        moities se rejoindraient au niveau des marges et une bande blanche
        courrait le long du pli — ce qui ruine exactement l'effet recherche.
     2. LA RELIURE MANGE LE MILIEU. L'image est dessinee sur 200% + 2 x la
        gouttiere, et chaque page en montre 100% depuis SON bord exterieur :
        la bande centrale (2 x --spread-gutter) n'est affichee nulle part.
        C'est volontaire — c'est precisement la portion qui disparait dans le
        pli. Les deux moities se raccordent donc correctement sur un livre
        ouvert, au lieu de se chevaucher.
     3. Valeur absolue, non mise a l'echelle par spaceScale : la perte de
        reliure est un fait physique de fabrication, pas un choix de densite
        typographique. */
  .photo-spread { position: absolute; inset: 0; margin: 0; overflow: hidden; }
  .photo-spread .photo-frame {
    position: absolute;
    top: 0;
    height: 100%;
    width: calc(200% + var(--spread-gutter, 4mm) * 2);
  }
  .photo-spread.is-spread-left .photo-frame { left: 0; }
  .photo-spread.is-spread-right .photo-frame { right: 0; }
  .photo-inset { padding: calc(8mm * var(--fmt-space-scale, 1)); background: #efe8d8; }
  .photo-inset .photo-frame { border: 1px solid #cbbd9c; box-shadow: 0 2px 10px rgba(0,0,0,0.08); }
  .photo-grid { display: grid; gap: calc(3mm * var(--fmt-space-scale, 1)); height: 100%; }
  .photo-grid-1 { grid-template-columns: 1fr; }
  .photo-grid-2 { grid-template-columns: 1fr 1fr; }
  .photo-grid-duo-v { grid-template-columns: 1fr; grid-template-rows: 1fr 1fr; }
  /* THREE_PHOTOS (atelier manuel) : 2 photos en haut, 1 en bas pleine
     largeur — jamais 3 colonnes egales (trop etroites, quasi illisibles sur
     une page portrait). L'ordre des items est celui choisi par l'utilisateur
     dans l'atelier (presentationVariant toujours 0 pour une page manuelle,
     voir manualPageBuilder.js) : les 2 premiers vont en haut, le 3eme prend
     toute la largeur en bas via nth-child, sans avoir besoin d'une classe
     dediee par position cote HTML. */
  .photo-grid-3 { grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; }
  .photo-grid-3 .photo-frame:nth-child(3) { grid-column: 1 / -1; }
  .photo-grid-4 { grid-template-columns: 1fr 1fr; }
  .photo-grid-5, .photo-grid-6 { grid-template-columns: 1fr 1fr 1fr; }
  /* TYPOGRAPHIE : plus aucune taille en dur ici. Chaque bloc de texte porte
     une classe de role (.text-role-title/subtitle/body/caption/quote) dont
     toutes les valeurs viennent de typographySystem.js — c'est ce qui
     garantit que l'apercu, le PDF et le fichier d'impression appliquent
     exactement les memes regles (cahier des charges §18). Les regles
     ci-dessous ne portent donc plus que la MISE EN PAGE (centrage, largeur
     de colonne, marges), jamais la taille ni la police. */
  .block-texte { justify-content: center; }
  /* Largeur de colonne : c'est l'un des leviers qui differencie reellement
     les 3 formats (var(--type-measure), voir FORMAT_TYPOGRAPHY) — le Luxe
     resserre la colonne pour gagner du blanc (§12/§15). */
  .block-texte p { max-width: calc(100% * var(--type-measure, 1)); margin-left: auto; margin-right: auto; }
  .texte-pleine { justify-content: flex-start; }
  .texte-citation { justify-content: center; align-items: center; }
  .texte-citation p { max-width: calc(80% * var(--type-measure, 1)); }
  .texte-citation p::before, .texte-citation p::after { content: '"'; opacity: 0.35; }
  .block-contribution { justify-content: center; gap: calc(4mm * var(--fmt-space-scale, 1)); }
  .contribution-photos { max-height: 60%; }
  .contribution-name { text-transform: uppercase; }
  .contribution-continuation { text-transform: none; letter-spacing: 0; font-style: italic; }
  .split-marker { display: block; margin-top: calc(2mm * var(--fmt-space-scale, 1)); }
  /* PHOTO_WITH_CAPTION (v2) : photo pleine page + courte legende dessous. */
  .photo-with-caption { display: flex; flex-direction: column; height: 100%; gap: calc(3mm * var(--fmt-space-scale, 1)); }
  .photo-with-caption .photo-frame { flex: 1; min-height: 0; }
  .photo-with-caption figcaption { font-style: italic; }
  .photo-with-caption.is-framed { padding: calc(6mm * var(--fmt-space-scale, 1)); background: #efe8d8; }
  .photo-with-caption.is-framed .photo-frame { border: 1px solid #cbbd9c; box-shadow: 0 2px 10px rgba(0,0,0,0.08); }
  .photo-with-caption.is-framed figcaption { text-align: left; }
  /* TWO_TESTIMONIES / THREE_TESTIMONIES (v2) : temoignages en cartes distinctes. */
  .testimony-stack { display: grid; gap: calc(5mm * var(--fmt-space-scale, 1)); height: 100%; align-content: center; }
  .testimony-stack-2 { grid-template-columns: 1fr 1fr; }
  .testimony-stack-3 { grid-template-columns: 1fr 1fr 1fr; }
  .testimony-card { padding: calc(4mm * var(--fmt-space-scale, 1)); background: #efe8d8; border-radius: 2mm; }
  /* taille/police portees par le role 'body' (typographySystem.js) */
  /* PHOTO_TEXT / TEXT_PHOTO / TWO_PHOTOS_TEXT (v2) : ordre visuel = ordre reel des items. */
  .mixte-ordered { display: flex; flex-direction: column; gap: calc(5mm * var(--fmt-space-scale, 1)); height: 100%; }
  /* La bande TEXTE prend la hauteur de son texte, pas une part fixe de la
     page ; la photo prend tout le reste.

     CORRIGE 2026-09-12 (signale sur capture : "c'est pas top"). Avant, les
     deux bandes se partageaient la page dans un rapport fige (1.4 / 1). Un
     texte de deux lignes recevait donc ~40% de la page et s'y retrouvait
     centre, ce qui creusait DEUX vides : un entre la photo et le texte, un
     sous le texte. Mesure sur la page signalee : bande texte 47.8% de la
     page, occupee a 9%. Desormais le blanc n'est plus pris au milieu de la
     composition, il revient a la photo.

     La photo garde une hauteur minimale : un texte tres long la reduit, il ne
     l'efface pas. */
  .mixte-ordered .mixte-photo { flex: 1 1 auto; min-height: 30%; }
  .mixte-ordered .mixte-photo .photo-frame { height: 100%; }
  .mixte-ordered .mixte-texte { flex: 0 1 auto; display: flex; align-items: center; justify-content: center; }
  /* Le paragraphe doit occuper la LARGEUR de sa colonne, pas celle de son
     contenu. Sans largeur explicite, c'est un element flex : il se retrecit a
     son texte, et alors ni text-align ni la justification n'ont le moindre effet
     visible — un texte "justifie" restait colle a gauche, un texte "centre"
     n'etait centre que dans sa propre boite. C'est ce qui donnait, sur la page
     signalee le 2026-09-12, deux lignes ferrees a gauche sous deux photos
     centrees. */
  .mixte-ordered .mixte-texte p { width: calc(100% * var(--type-measure, 1)); max-width: 100%; }
  /* Deux photos cote a cote + un texte dessous. Ici la photo ne PEUT pas
     absorber tout le blanc : a 48% de largeur, lui donner toute la hauteur
     restante en ferait un bandeau de 1 pour 2.5, donc un recadrage brutal
     (object-fit: cover). On lui fixe donc un cadre 3/4, stable quelle que
     soit la longueur du texte — c'est ce qui rend la page previsible — et le
     blanc qui reste se repartit en haut et en bas (align-content: center)
     plutot que de s'accumuler sous le texte.

     ESSAYE PUIS RETIRE le 2026-09-13 : des cadres nettement plus hauts (une
     rangee en aspect-ratio 9/8) remplissaient bien mieux la page — 57.8% de
     photo au lieu de 41.6% — mais au prix d'un recadrage que l'utilisateur a
     refuse net ("je veux pas de photo tronquee"). Mesure qui a tranche : sur
     sa page, la photo portrait passait de 100% a 73% visible et la paysage de
     56% a 41%. REMPLIR LA PAGE NE JUSTIFIE PAS DE COUPER DANS LES PHOTOS —
     ne pas retenter sans une demande explicite. Le blanc est le prix assume
     de deux photos cote a cote sur une page portrait ; les mises en page
     "2 photos horizontales" et le mode "photo entiere" sont les vraies
     reponses quand la forme de la photo ne convient pas au cadre. */
  .mixte-multi-photo { flex-direction: row; flex-wrap: wrap; align-content: center; }
  /* La base tient compte de la GOUTTIERE, elle n'est pas un pourcentage rond.
     Avec 48% + 48%, la somme des deux photos ET du gap depassait la largeur
     disponible des que le gap devenait grand : en Luxe (--fmt-space-scale
     1.55, gap 7.75mm) les deux photos passaient a la ligne, la page comptait
     3 rangees au lieu de 2 et le bloc debordait de 31 px en haut ET en bas
     (align-content: center) — c'est la page "deformee en mode luxe" signalee
     le 2026-09-14. Le calcul ci-dessous soustrait exactement le gap avant de
     partager, donc les deux photos tiennent cote a cote dans TOUS les
     formats, quelle que soit l'echelle d'espacement. */
  .mixte-multi-photo .mixte-photo {
    flex: 0 1 calc((100% - 5mm * var(--fmt-space-scale, 1)) / 2);
    aspect-ratio: 3 / 4;
    min-height: 0;
    max-height: 62%;
  }
  .mixte-multi-photo .mixte-texte { flex-basis: 100%; }
  /* TITLE_TEXT / TITLE_TWO_PHOTOS / TITLE_FOUR_PHOTOS (atelier manuel) : le
     titre est toujours le premier item du bloc (voir renderTitleTextBlock/
     renderTitlePhotosBlock), jamais un texte invente par le moteur. */
  .page-title { margin: 0 0 calc(6mm * var(--fmt-space-scale, 1)); }
  /* Titre EN HAUT, corps dessous qui occupe le reste. Auparavant le bloc
     etait centre verticalement (justify-content: center) : le contenu
     flottait au milieu de la page alors que l'incrustation d'edition place
     le titre en haut et le texte en dessous — les deux ne decrivaient pas la
     meme page. C'est aussi la hierarchie editoriale attendue (§14 : un
     element dominant, en tete). */
  .block-title-text { justify-content: flex-start; }
  .title-text-body { flex: 1; min-height: 0; }
  /* Bande vide d'un emplacement non rempli : occupe sa place, sans rien
     dessiner (ni cadre, ni pointilles — ils s'imprimeraient). */
  .page-title[aria-hidden="true"] { min-height: 1em; }
  .title-text-body p { max-width: calc(100% * var(--type-measure, 1)); margin-left: auto; margin-right: auto; }
  .block-title-photos { justify-content: flex-start; }
  .title-photos-grid { display: grid; gap: calc(3mm * var(--fmt-space-scale, 1)); flex: 1; min-height: 0; }
  .title-photos-grid-1 { grid-template-columns: 1fr; }
  .title-photos-grid-2 { grid-template-columns: 1fr 1fr; }
  .title-photos-grid-3, .title-photos-grid-4 { grid-template-columns: 1fr 1fr; }
  /* Details dores discrets (Luxe uniquement, .page.is-luxe posee par
     renderPage()/renderSinglePageHtml) — retour utilisateur explicite :
     "ne pas mettre du doré partout". Un cadre pleine page sur CHAQUE page a
     ete essaye puis retire : trop present. ll ne reste que deux details
     RARES : un filet sous les titres de page (seulement les mises en page
     a titre, deja peu frequentes) et un petit numero de page. Memes teintes
     que la couverture (coverTheme.applyFormatAccent, #c19a3d/#8a6a1f),
     codees en dur ici plutot qu'importees de coverTheme.js : ce module
     reste une fonction de rendu pure, sans logique de theme (voir l'entete
     du fichier) — meme raison que frontCoverRenderer.js recoit un theme
     deja resolu plutot que de le calculer lui-meme. */
  .page.is-luxe .page-title {
    padding-bottom: calc(3mm * var(--fmt-space-scale, 1));
    border-bottom: 0.75px solid #c19a3d;
  }
  .page-number-luxe {
    position: absolute;
    left: 0;
    right: 0;
    bottom: calc(5mm * var(--fmt-space-scale, 1));
    text-align: center;
    font-family: 'Inter', sans-serif;
    font-size: calc(7.5pt * var(--fmt-type-scale, 1));
    letter-spacing: 0.08em;
    color: #8a6a1f;
    opacity: 0.75;
  }
  /* Page de separation de chapitre (Luxe uniquement — voir
     formatComposer.js) : rare et sobre, beaucoup de blanc, deux filets fins
     encadrant un numero et un titre en petites capitales espacees. */
  .page-separator .separator-inner {
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: calc(6mm * var(--fmt-space-scale, 1));
    text-align: center;
  }
  .separator-rule { width: calc(18mm * var(--fmt-space-scale, 1)); height: 1px; background: #c19a3d; border: none; margin: 0; }
  .separator-number { font-family: 'Cormorant Garamond', Georgia, serif; font-weight: 400; font-size: calc(30pt * var(--fmt-type-scale, 1)); color: #241f18; }
  .separator-title { font-family: 'Inter', sans-serif; font-size: calc(11pt * var(--fmt-type-scale, 1)); letter-spacing: 0.32em; text-transform: uppercase; color: #6d6252; }
  @media print {
    body { background: #fff; }
    .page { margin: 0; }
  }
`;

/**
 * @param {object} input
 * @param {object} input.book - { id, title }
 * @param {Array} input.pages - resultat de layoutEngine.compose() ou lecture de book_pages
 * @param {Array} input.items - book_content_items du livre (pour resoudre les itemIds des pages)
 * @param {Array} [input.layouts] - layout_definitions (pour resoudre le slug de chaque bloc et varier le rendu)
 * @param {object} [input.format] - { trimWidthMm, trimHeightMm, spaceScale?, typeScale? } (spaceScale/typeScale : voir formatDensity.js, defaut 1 si absents)
 * @returns {string} document HTML complet, autonome
 */
function renderBookHtml(input) {
  // Fond perdu en millimetres. Zero pour le PDF telechargeable par le
  // client (pas de massicot), 3 pour le fichier d impression.
  const bleedMm = Number(input.bleedMm) > 0 ? Number(input.bleedMm) : 0;

  // MISE EN PLANCHES (deux pages par feuille).
  //
  // Une photo etalee sur une double page est stockee comme deux moities,
  // sur deux pages consecutives. Dans un lecteur qui affiche une page a la
  // fois, on ne voit jamais l image entiere — « lorsqu il y a une photo
  // sur 2 pages elle est perdue » (2026-09-19).
  //
  // On cessait de dependre du mode d affichage du lecteur : la feuille
  // PORTE les deux pages cote a cote. La couverture et la 4e restent
  // seules sur leur feuille, comme dans un vrai livre.
  //
  // Reserve au PDF de lecture. Le fichier d impression garde une page par
  // feuille : c'est ce que l imprimeur attend.
  const enPlanches = input.spreadLayout === true;
  const book = input.book || {};
  const pages = Array.isArray(input.pages) ? input.pages : [];
  const items = Array.isArray(input.items) ? input.items : [];
  const layouts = Array.isArray(input.layouts) ? input.layouts : [];
  const format = input.format || DEFAULT_FORMAT;

  const itemsById = Object.fromEntries(items.map((item) => [item.id, item]));
  const layoutsById = Object.fromEntries(layouts.map((layout) => [layout.id, layout]));
  const sortedPages = [...pages].sort((a, b) => a.page_index - b.page_index);
  const context = { book, format };
  const rendus = sortedPages.map(
    (page, index) => renderPage(page, itemsById, layoutsById, index === sortedPages.length - 1, context)
  );

  // En planches, le saut de page appartient a la FEUILLE, plus a la page :
  // sans quoi chaque page partirait sur sa propre feuille et le
  // regroupement ne servirait a rien.
  const sansSaut = (html) => html.replace(' page-break', '');

  let pagesHtml;
  if (enPlanches && rendus.length > 2) {
    const feuilles = [];
    // La couverture, seule.
    feuilles.push([rendus[0]]);
    // L interieur, deux par deux — meme appariement que l atelier
    // (leftPageIndex = spread * 2), donc ce que l utilisateur a compose.
    const interieur = rendus.slice(1, -1);
    for (let i = 0; i < interieur.length; i += 2) {
      feuilles.push(interieur.slice(i, i + 2));
    }
    // La 4e de couverture, seule.
    feuilles.push([rendus[rendus.length - 1]]);

    pagesHtml = feuilles
      .map((feuille, index) => {
        const derniere = index === feuilles.length - 1;
        const classe = derniere ? 'feuille' : 'feuille feuille-break';
        return `<div class="${classe}">${feuille.map(sansSaut).join('')}</div>`;
      })
      .join('\n');
  } else {
    pagesHtml = rendus.join('\n');
  }

  const { COVER_BASE_CSS, FRONT_COVER_CSS } = require('./frontCoverRenderer');
  const { BACK_COVER_CSS } = require('./backCoverRenderer');

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(book.title || 'Aperçu du livre')}</title>
${GOOGLE_FONTS_LINK}
<style>
  @page { size: ${(format.trimWidthMm + bleedMm * 2) * (enPlanches ? 2 : 1)}mm ${format.trimHeightMm + bleedMm * 2}mm; margin: 0; }
  /* Une feuille porte une ou deux pages, cote a cote, sans espace entre
     elles : le raccord d une photo sur double page doit etre invisible. */
  .feuille { display: flex; justify-content: center; align-items: flex-start; }
  .feuille .page { margin: 0; }
  .feuille-break { break-after: page; page-break-after: always; }
  :root {
    /* FOND PERDU.

       La feuille est plus grande que le livre fini : l imprimeur massicote
       dedans, et cette marge evite un liseré blanc si la coupe derive d un
       cheveu.

       Il etait obtenu jusqu ici en etirant les pixels du bord APRES la
       capture d ecran. Sans capture, on l exprime en CSS : la page grandit
       de bleedMm sur chaque bord, et son remplissage grandit d autant —
       la zone de contenu reste donc EXACTEMENT la meme, au millimetre.
       Rien ne bouge dans la mise en page, seule la feuille deborde. */
    --bleed-mm: ${bleedMm}mm;
    --page-width-mm: ${format.trimWidthMm + bleedMm * 2}mm;
    --page-height-mm: ${format.trimHeightMm + bleedMm * 2}mm;
    --fmt-space-scale: ${format.spaceScale ?? 1};
    --fmt-type-scale: ${format.typeScale ?? 1};
${typography.typographyCssVariables(format.formatId)}
  }
  ${BASE_CSS}
${typography.typographyCssRules()}
  ${COVER_BASE_CSS}
  ${FRONT_COVER_CSS}
  ${BACK_COVER_CSS}
</style>
</head>
<body>
${pagesHtml || '<p style="padding:24px;font-family:sans-serif;">Ce livre n\'a pas encore de pages composées — lancez POST /compose.</p>'}
</body>
</html>`;
}

/**
 * Rend une seule page en document HTML autonome, dimensionnee pour occuper
 * exactement le viewport (pas de centrage/empilement multi-page). Utilise
 * par pdfService.js pour la capture haute resolution page par page (voir
 * commentaire en tete de pdfService.js sur les limites de --print-to-pdf).
 *
 * @param {object} input
 * @param {object} input.book
 * @param {object} input.page - une entree de compose().pages
 * @param {Array} input.items
 * @param {Array} [input.layouts]
 * @param {object} [input.format]
 * @returns {string}
 */
function renderSinglePageHtml(input) {
  const book = input.book || {};
  const page = input.page;
  const items = Array.isArray(input.items) ? input.items : [];
  const layouts = Array.isArray(input.layouts) ? input.layouts : [];
  const format = input.format || DEFAULT_FORMAT;

  const itemsById = Object.fromEntries(items.map((item) => [item.id, item]));
  const layoutsById = Object.fromEntries(layouts.map((layout) => [layout.id, layout]));

  const { COVER_BASE_CSS, FRONT_COVER_CSS } = require('./frontCoverRenderer');
  const { BACK_COVER_CSS } = require('./backCoverRenderer');

  // Couverture / page de separation de chapitre : meme dispatch que
  // renderPage/renderBookHtml, isLast toujours vrai ici (un document a une
  // seule page n'a jamais besoin de la classe page-break, capture
  // independante page par page).
  let pageHtml;
  if (page.content?.kind === 'front-cover' || page.content?.kind === 'back-cover' || page.content?.kind === 'chapter-separator') {
    pageHtml = renderPage(page, itemsById, layoutsById, true, { book, format });
  } else {
    const blocks = Array.isArray(page.content?.blocks) ? page.content.blocks : [];
    const adjustmentsByItemId = page.content?.photoAdjustments || {};
    const captionsByItemId = page.content?.photoCaptions || {};
    // Meme presentation typographique que renderPage ci-dessus : c'est ce
    // chemin qu'empruntent l'apercu de l'atelier ET la capture PDF, ils
    // doivent donc appliquer exactement les memes reglages.
    const textPresentation = {
      roles: page.content?.textRoles || {},
      styles: page.content?.textStyles || {},
      formatId: format?.formatId
    };
    textPresentation.fits = buildTextFits({
      blocks,
      itemsById,
      layoutsById,
      formatId: format?.formatId,
      roles: textPresentation.roles,
      styles: textPresentation.styles
    });
    const blocksHtml = blocks
      .map((block) => renderBlock(block, itemsById, layoutsById, adjustmentsByItemId, textPresentation, spreadIndexOf(page), captionsByItemId))
      .join('');
    // Meme marqueur/numero de page discret que renderPage() ci-dessus (Luxe uniquement).
    const luxeClass = format?.formatId === 'luxe' ? ' is-luxe' : '';
    const pageNumberHtml = format?.formatId === 'luxe' ? `<span class="page-number-luxe">${page.page_index + 1}</span>` : '';
    pageHtml = `<section class="page${luxeClass}" data-page-index="${page.page_index}"><div class="page-blocks">${blocksHtml}</div>${pageNumberHtml}</section>`;
  }

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(book.title || 'Page')}</title>
${GOOGLE_FONTS_LINK}
<style>
  :root {
    --page-width-mm: ${format.trimWidthMm}mm;
    --page-height-mm: ${format.trimHeightMm}mm;
    --fmt-space-scale: ${format.spaceScale ?? 1};
    --fmt-type-scale: ${format.typeScale ?? 1};
${typography.typographyCssVariables(format.formatId)}
  }
  ${BASE_CSS}
${typography.typographyCssRules()}
  ${COVER_BASE_CSS}
  ${FRONT_COVER_CSS}
  ${BACK_COVER_CSS}
  /* La page garde sa taille PHYSIQUE reelle et on la met a l'echelle du
     conteneur par une transformation.

     CORRIGE 2026-09-11. Avant : .page en width:100vw / height:100vh. Le
     cadre de page s'adaptait bien au conteneur, mais les unites CSS pt et
     mm sont ABSOLUES — elles ne suivent pas le viewport. Consequence : dans
     l'atelier, qui affiche une page de 200mm dans ~535px (au lieu de ses
     756px naturels a 96dpi), la typographie et les marges restaient a leur
     taille absolue et paraissaient donc ~41% plus grandes, proportionnellement
     a la page, qu'elles ne le seront a l'impression. L'apercu n'etait pas
     fidele — probleme signale ("il apparait tout petit" : c'est l'editeur en
     ligne, lui calcule a la vraie echelle, qui semblait fautif).

     Avec une mise a l'echelle par transform, TOUT suit (mm, pt, %, images) et
     l'apercu devient reellement fidele au PDF (cahier des charges
     typographique §1/§18).

     Aucun effet sur la generation du PDF : pdfService fixe le viewport a la
     taille physique exacte de la page, le facteur y vaut donc 1. */
  html, body { width: 100%; height: 100%; overflow: hidden; }
  .page {
    margin: 0;
    width: var(--page-width-mm);
    height: var(--page-height-mm);
    transform-origin: top left;
  }
</style>
<script>
  // Ajuste la page a son conteneur sans deformer : un seul facteur pour les
  // deux axes (jamais d'etirement), recalcule au redimensionnement.
  (function () {
    function fit() {
      var page = document.querySelector('.page');
      if (!page) return;
      page.style.transform = 'none';
      var w = page.offsetWidth;
      var h = page.offsetHeight;
      if (!w || !h) return;
      var scale = Math.min(window.innerWidth / w, window.innerHeight / h);
      page.style.transform = 'scale(' + scale + ')';
    }
    window.addEventListener('resize', fit);
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fit);
    } else {
      fit();
    }
    // Les polices distantes changent les metriques : on refait le calcul
    // quand elles sont pretes, sinon la premiere mesure peut etre faussee.
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);
  })();
</script>
<style>
</style>
</head>
<body>
${pageHtml}
</body>
</html>`;
}

module.exports = {
  renderBookHtml,
  renderSinglePageHtml,
  escapeHtml,
  imgFrame,
  PHOTO_ZOOM_MIN,
  PHOTO_ZOOM_MAX
};
