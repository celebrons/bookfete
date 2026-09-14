import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams, useNavigate, Link } from 'react-router-dom';
import { supabase } from '../../../services/supabaseClient';
import {
  listContentItems,
  listLayouts,
  listPages,
  saveManualPage,
  clearPage,
  updatePageContent,
  fetchInteriorPagePreviewHtml,
  fetchCoverPreviewHtml,
  composeBook,
  uploadPhoto,
  addTextItem,
  deleteContentItem,
  deleteAllContentItems,
  getRecommendedPageCount,
  extendBookPages,
  shrinkBookPages,
  movePage,
  updateContentItem
} from '../../../services/compositionApi';
import AtelierSidebar from './AtelierSidebar';
import AtelierBookView from './AtelierBookView';
import AtelierLayoutPanel from './AtelierLayoutPanel';
import AtelierPageOverlay from './AtelierPageOverlay';
import AtelierCoverPanel from './AtelierCoverPanel';
import AtelierGenerateModal from './AtelierGenerateModal';
import AtelierConfirmSwitchDialog from './AtelierConfirmSwitchDialog';
import AtelierOnboarding from './AtelierOnboarding';
import AtelierFinishModal from './AtelierFinishModal';
import AtelierPageFilmstrip from './AtelierPageFilmstrip';
import AtelierPhotoAdjustModal from './AtelierPhotoAdjustModal';
import AtelierPageActions from './AtelierPageActions';
import { findAtelierLayout } from './atelierLayouts';
import AnonymousBanner from '../../common/AnonymousBanner';
import '../../../styles/luxe-theme.css';
import './BookAtelierLuxe.css';

// Atelier de creation personnalisee : l'utilisateur construit son livre
// page par page, en choisissant une mise en page prealable puis en y
// glissant ses photos/souvenirs — jamais de positionnement libre (cahier
// des charges §4). Trois zones : Mes souvenirs (gauche, AtelierSidebar) /
// Le livre (centre, AtelierBookView) / Mise en page (droite,
// AtelierLayoutPanel).
//
// Sauvegarde : automatique des que tous les emplacements du format choisi
// sont remplis (jamais de bouton "Valider" separe) — meme philosophie
// "instantane" que Configuration/l'editeur de couverture. La page est
// toujours sauvegardee verrouillee (locked=true, voir
// backend/routes/composition.js) : une recomposition automatique ulterieure
// ne l'ecrasera jamais.
// Vu une fois -> jamais reaffiche automatiquement (bouton "?" du header
// pour le rouvrir volontairement) — memorise par livre, pas globalement :
// un nouveau livre reste un premier contact avec l'atelier.
const ONBOARDING_SEEN_KEY_PREFIX = 'atelierOnboardingSeen_';

export default function BookAtelierLuxe() {
  const { bookId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [isFinishModalOpen, setIsFinishModalOpen] = useState(false);

  const [book, setBook] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showOnboarding, setShowOnboarding] = useState(
    () => !localStorage.getItem(`${ONBOARDING_SEEN_KEY_PREFIX}${bookId}`)
  );

  const [items, setItems] = useState([]);
  const [layouts, setLayouts] = useState([]);
  const [pages, setPages] = useState([]);

  const [viewIndex, setViewIndex] = useState(1); // 0 = couverture, dernier = 4e, sinon double-page
  const [selectedSide, setSelectedSide] = useState('left');
  const [selectedSidebarItem, setSelectedSidebarItem] = useState(null);

  const [activeCategory, setActiveCategory] = useState(null);
  const [draftLayoutSlug, setDraftLayoutSlug] = useState(null);
  const [draftSlotItemIds, setDraftSlotItemIds] = useState([]);
  // Ajustement manuel de cadrage (focalX/focalY/zoom) : { [itemId]: {...} },
  // meme forme que content.photoAdjustments cote backend. L'UI dediee a ete
  // retiree le 2026-09-10 puis RETABLIE par le cahier des charges v2 (pan &
  // zoom "toujours disponible", confirme avec l'utilisateur) — elle s'ouvre
  // desormais au clic sur la photo (voir AtelierPhotoAdjustModal.js).
  const [draftPhotoAdjustments, setDraftPhotoAdjustments] = useState({});
  // Roles et reglages typographiques par itemId (cahier des charges
  // typographique §3/§6) — meme mecanique que draftPhotoAdjustments : etat
  // local, compare dans l'effet d'autosauvegarde, persiste par
  // saveManualPage.
  const [draftTextRoles, setDraftTextRoles] = useState({});
  const [draftTextStyles, setDraftTextStyles] = useState({});
  // Page a laquelle le brouillon ci-dessus appartient — voir le garde-fou de
  // la sauvegarde automatique.
  const [draftPageIndex, setDraftPageIndex] = useState(null);
  const [adjustTargetSlotIndex, setAdjustTargetSlotIndex] = useState(null);

  const [coverHtml, setCoverHtml] = useState(null);
  const [backCoverHtml, setBackCoverHtml] = useState(null);
  const [pagePreviewCache, setPagePreviewCache] = useState({});
  const [loadingPreview, setLoadingPreview] = useState(false);

  const [saveStatus, setSaveStatus] = useState('idle');
  const [saveError, setSaveError] = useState('');

  const [isGenerateModalOpen, setIsGenerateModalOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState('');
  const [generateVariant, setGenerateVariant] = useState(0);
  const [estimatedPages, setEstimatedPages] = useState(null);
  const [loadingEstimate, setLoadingEstimate] = useState(false);
  const [isConfirmSwitchOpen, setIsConfirmSwitchOpen] = useState(false);

  // Retour en arriere APRES coup, sur la derniere action qui a vide la page
  // (choisir une autre mise en page, "Changer de mise en page", "Vider cette
  // page"). Retour utilisateur 2026-09-13 : "je me trompe a chaque fois en
  // testant, je supprime le contenu et pas de possibilite de revenir sur ce
  // qu'il y'avait avant".
  //
  // Choisir une autre mise en page remet tous les emplacements a null, et la
  // sauvegarde automatique traduit ca par un clearPage : la page enregistree
  // disparait pour de bon. Les souvenirs, eux, ne sont jamais touches (ils
  // vivent dans content_items, clearPage ne remet a null que la page) — un
  // simple instantane de l'etat local suffit donc a tout retablir.
  //
  // `pageIndex` fait partie de l'instantane : sans lui, revenir en arriere
  // apres avoir change de page aurait recopie le contenu d'une page sur une
  // autre.
  const [undoSnapshot, setUndoSnapshot] = useState(null);
  // clearPage en cours : le retour en arriere doit l'ATTENDRE avant de
  // reecrire, sinon l'effacement peut arriver au serveur apres la
  // restauration et re-vider la page.
  const clearInFlightRef = useRef(null);

  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  // { done, total, failed } pendant un envoi de lot, null sinon.
  const [uploadProgress, setUploadProgress] = useState(null);
  const [deletingAll, setDeletingAll] = useState(false);
  const [sidebarAddError, setSidebarAddError] = useState('');
  const [addingPages, setAddingPages] = useState(false);
  const [removingPages, setRemovingPages] = useState(false);
  const [movingPage, setMovingPage] = useState(false);

  // Force un rechargement de l'apercu de la vue courante meme quand
  // viewIndex ne change pas (ex. sauvegarde de couverture, generation
  // automatique alors qu'on est deja sur la premiere double-page) : l'effet
  // de chargement ci-dessous ne se redeclenche que sur un changement de
  // dependance, jamais sur un simple `setCoverHtml(null)` isole.
  const [refreshToken, setRefreshToken] = useState(0);
  // Incremente UNIQUEMENT par loadAll (rechargement delibere des donnees).
  // Sert de declencheur a l initialisation du brouillon de page : une
  // sauvegarde automatique, elle, ne doit jamais la relancer.
  const [contentVersion, setContentVersion] = useState(0);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [{ data: bookRow, error: bookError }, itemList, layoutList, pageList] = await Promise.all([
        supabase.from('books').select('*').eq('id', bookId).single(),
        listContentItems(bookId),
        listLayouts(),
        listPages(bookId)
      ]);
      if (bookError) throw new Error(bookError.message || 'Livre introuvable.');

      setBook(bookRow);
      setItems(itemList || []);
      setLayouts(layoutList || []);
      setPages(pageList || []);
      setContentVersion((previous) => previous + 1);

      if (!bookRow.page_count) {
        setError("Choisissez le nombre de pages du livre (onglet Configuration) avant d'ouvrir l'atelier.");
      }
    } catch (err) {
      setError(err.message || 'Erreur de chargement.');
    } finally {
      setLoading(false);
    }
  }, [bookId]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const photos = useMemo(() => items.filter((item) => item.kind === 'photo'), [items]);
  const souvenirs = useMemo(() => items.filter((item) => item.kind === 'texte'), [items]);
  const itemsById = useMemo(() => Object.fromEntries(items.map((item) => [item.id, item])), [items]);
  const layoutsById = useMemo(() => Object.fromEntries(layouts.map((layout) => [layout.id, layout])), [layouts]);
  // Mises en page reellement disponibles en base. Tant que la liste n'est pas
  // chargee, on ne filtre rien (undefined) : mieux vaut tout proposer une
  // fraction de seconde que faire clignoter le panneau.
  const availableLayoutSlugs = useMemo(
    () => (layouts.length > 0 ? new Set(layouts.map((layout) => layout.slug)) : undefined),
    [layouts]
  );

  // Valeurs lues par l effet d initialisation du brouillon SANS en etre des
  // dependances (voir son commentaire) : elles doivent etre fraiches, mais
  // ne jamais le relancer.
  const pagesRef = useRef(pages); pagesRef.current = pages;
  const layoutsByIdRef = useRef(layoutsById); layoutsByIdRef.current = layoutsById;
  const itemsByIdRef = useRef(itemsById); itemsByIdRef.current = itemsById;

  // Elements deja places sur UNE page interieure quelconque du livre (pas
  // seulement la page en cours) — retour utilisateur : eviter les doublons
  // accidentels en glissant deux fois la meme photo sans s'en rendre compte.
  // Union de toutes les pages deja sauvegardees (pages[].content.itemIds) ET
  // du brouillon de la page en cours (draftSlotItemIds) : ce dernier peut
  // contenir un ajout tout juste depose, pas encore reflete dans `pages`
  // (la sauvegarde auto est asynchrone) — sans lui, le badge "utilisee"
  // manquerait pendant l'instant qui suit un depot. Volontairement
  // informatif, jamais bloquant : reutiliser sciemment une meme photo (ex.
  // avant/apres) reste possible.
  const usedItemIds = useMemo(() => {
    const ids = new Set();
    pages.forEach((page) => {
      if (Array.isArray(page.content?.itemIds)) {
        page.content.itemIds.forEach((id) => { if (id) ids.add(id); });
      }
    });
    draftSlotItemIds.forEach((id) => { if (id) ids.add(id); });
    return ids;
  }, [pages, draftSlotItemIds]);

  const totalPages = book?.page_count || 0;
  const interiorSpreadCount = Math.max(1, Math.ceil(totalPages / 2));
  const totalViews = interiorSpreadCount + 2; // couverture + double-pages + 4e

  // Verification affichee au clic sur "Terminer mon livre" (AtelierFinishModal)
  // — a partir des donnees deja chargees, aucun nouvel appel reseau. "Page
  // complete" reprend exactement le meme critere que la sauvegarde auto de
  // l'atelier (voir plus bas : isComplete = tous les emplacements remplis).
  // Une page jamais construite (aucune ligne dans book_pages) compte comme
  // incomplete, meme logique que le rendu (routes/composition.js: une page
  // absente se rend comme une page vide plutot qu'une 404).
  // pageStatuses (meme passage) alimente aussi le filmstrip de pages
  // ci-dessous — un seul parcours de `pages`, pas une deuxieme boucle
  // dupliquee pour un besoin d'affichage tres proche.
  const finishStats = useMemo(() => {
    let incompletePages = 0;
    const pageStatuses = [];
    for (let index = 0; index < totalPages; index += 1) {
      const pageRow = pages.find((page) => page.page_index === index);
      const layout = pageRow?.layout_id ? layoutsById[pageRow.layout_id] : null;
      const slotCount = layout?.capacity?.slots?.length || 0;
      const filledCount = Array.isArray(pageRow?.content?.itemIds)
        ? pageRow.content.itemIds.filter(Boolean).length
        : 0;
      if (slotCount === 0 || filledCount !== slotCount) incompletePages += 1;
      const status = slotCount > 0 && filledCount === slotCount
        ? 'complete'
        : filledCount > 0
          ? 'partial'
          : 'empty';
      pageStatuses.push({ pageIndex: index, status });
    }
    return {
      photosCount: photos.length,
      souvenirsCount: souvenirs.length,
      pagesCreated: pages.length,
      incompletePages,
      pageStatuses
    };
  }, [totalPages, pages, layoutsById, photos.length, souvenirs.length]);
  const lastViewIndex = totalViews - 1;

  // Lien profond "?page=N" — utilise par "Revoir ces pages" depuis l'ecran
  // recapitulatif qualite avant commande (PrintQualityRecapModal). Ne
  // s'applique qu'UNE fois, au premier chargement des pages : ensuite
  // l'utilisateur navigue normalement (sinon chaque rendu le ramenerait de
  // force sur la meme page).
  const deepLinkAppliedRef = useRef(false);
  useEffect(() => {
    if (deepLinkAppliedRef.current || !book?.page_count) return;
    const raw = Number(searchParams.get('page'));
    if (!Number.isInteger(raw) || raw < 0 || raw >= book.page_count) return;
    deepLinkAppliedRef.current = true;
    setViewIndex(Math.floor(raw / 2) + 1);
    setSelectedSide(raw % 2 === 0 ? 'left' : 'right');
  }, [book?.page_count, searchParams]);

  const viewKind = viewIndex === 0 ? 'cover' : viewIndex === lastViewIndex ? 'back-cover' : 'spread';
  const spreadNumber = viewKind === 'spread' ? viewIndex - 1 : null;
  const leftPageIndex = spreadNumber != null ? spreadNumber * 2 : null;
  const rightPageIndex = spreadNumber != null && leftPageIndex + 1 < totalPages ? leftPageIndex + 1 : null;

  const currentPageIndex = viewKind === 'spread'
    ? (selectedSide === 'right' && rightPageIndex != null ? rightPageIndex : leftPageIndex)
    : null;

  // Un retour en arriere ne vaut que pour la page ou l'erreur a ete faite :
  // des qu'on change de page, il est perime. (L'affichage verifie AUSSI le
  // pageIndex de l'instantane — rien ne doit pouvoir recopier le contenu
  // d'une page sur une autre.) Declare ICI et pas plus haut avec l'etat :
  // `currentPageIndex` est calcule a cet endroit, et un tableau de
  // dependances est evalue immediatement — le referencer avant sa definition
  // aurait leve une ReferenceError au premier rendu.
  useEffect(() => { setUndoSnapshot(null); }, [currentPageIndex]);

  const refreshPagePreview = useCallback(async (pageIndex) => {
    if (!book?.id || pageIndex == null) return;
    try {
      const html = await fetchInteriorPagePreviewHtml(book.id, pageIndex);
      setPagePreviewCache((previous) => ({ ...previous, [pageIndex]: html }));
    } catch (_err) {
      // Non bloquant : la case reste vide plutot que de casser l'atelier.
    }
  }, [book?.id]);

  // Charge l'apercu de la vue courante (couverture, 4e, ou double-page) —
  // uniquement ce qui n'est pas deja en cache. Le cache lui-meme n'est pas
  // une dependance ici (deliberement) : sinon chaque mise a jour du cache
  // relancerait cet effet en boucle.
  useEffect(() => {
    if (!book?.id) return undefined;
    let cancelled = false;

    async function loadView() {
      setLoadingPreview(true);
      try {
        if (viewKind === 'cover' && coverHtml == null) {
          const html = await fetchCoverPreviewHtml(book.id, 'front');
          if (!cancelled) setCoverHtml(html);
        } else if (viewKind === 'back-cover' && backCoverHtml == null) {
          const html = await fetchCoverPreviewHtml(book.id, 'back');
          if (!cancelled) setBackCoverHtml(html);
        } else if (viewKind === 'spread') {
          const indexesToLoad = [leftPageIndex, rightPageIndex]
            .filter((index) => index != null && pagePreviewCache[index] == null);
          if (indexesToLoad.length > 0) {
            const htmls = await Promise.all(indexesToLoad.map((index) => fetchInteriorPagePreviewHtml(book.id, index)));
            if (!cancelled) {
              setPagePreviewCache((previous) => {
                const next = { ...previous };
                indexesToLoad.forEach((index, i) => { next[index] = htmls[i]; });
                return next;
              });
            }
          }
        }
      } catch (_err) {
        // Non bloquant.
      } finally {
        if (!cancelled) setLoadingPreview(false);
      }
    }

    loadView();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book?.id, viewIndex, refreshToken]);

  // Initialise le brouillon (format + emplacements) de la page selectionnee
  // a partir de ce qui est deja sauvegarde — jamais a partir du brouillon de
  // la page precedente.
  useEffect(() => {
    setAdjustTargetSlotIndex(null); // jamais une modale d'ajustement "en cours" en changeant de page
    // Page a laquelle appartient le brouillon. Sans ce marqueur, la
    // sauvegarde automatique plus bas pouvait ecrire le brouillon de la page
    // PRECEDENTE sur la NOUVELLE — voir son garde-fou et le commentaire qui
    // l'accompagne.
    setDraftPageIndex(currentPageIndex);
    if (currentPageIndex == null) {
      setDraftLayoutSlug(null);
      setDraftSlotItemIds([]);
      setDraftPhotoAdjustments({});
      setDraftTextRoles({});
      setDraftTextStyles({});
      return;
    }
    const pageRow = pagesRef.current.find((page) => page.page_index === currentPageIndex);
    const realLayout = pageRow?.layout_id ? layoutsByIdRef.current[pageRow.layout_id] : null;
    const atelierLayout = realLayout ? findAtelierLayout(realLayout.slug) : null;

    if (atelierLayout && Array.isArray(pageRow.content?.itemIds) && pageRow.content.itemIds.length === atelierLayout.slots.length) {
      setDraftLayoutSlug(atelierLayout.slug);
      // Un itemId qui ne correspond plus a AUCUN item reel (photo/souvenir
      // supprime depuis que cette page a ete enregistree) est traite comme
      // un emplacement VIDE, jamais comme "rempli" (retour utilisateur,
      // 2026-09-11) : sans ce nettoyage, un id orphelin restait compte
      // comme "filled" par l'effet de sauvegarde plus bas
      // (filledIds.filter(Boolean) le laisse passer, une chaine non vide
      // reste truthy meme si elle ne pointe plus vers rien) — ce qui
      // declenchait a tort la sauvegarde VALIDEE (saveManualPage) des que
      // l'utilisateur touchait a un AUTRE emplacement de cette meme page,
      // rejetee cote serveur avec un message peu clair.
      const cleanedItemIds = pageRow.content.itemIds.map((id) => (id && itemsByIdRef.current[id] ? id : null));
      setDraftSlotItemIds(cleanedItemIds);
      setDraftPhotoAdjustments(pageRow.content?.photoAdjustments || {});
      setDraftTextRoles(pageRow.content?.textRoles || {});
      setDraftTextStyles(pageRow.content?.textStyles || {});
    } else {
      setDraftLayoutSlug(null);
      setDraftSlotItemIds([]);
      setDraftPhotoAdjustments({});
      setDraftTextRoles({});
      setDraftTextStyles({});
    }
    setActiveCategory(null);
    setSelectedSidebarItem(null);
    setSaveStatus('idle');
    setSaveError('');
    // BUG CORRIGE 2026-09-12 — "le texte ne s'enregistre pas" sur un
    // gabarit photo+legende.
    //
    // Cet effet dependait de `pages` ET `itemsById`. Or ecrire une legende
    // CREE un souvenir : `items` change, donc `itemsById` change d'identite,
    // donc cet effet se relancait AUSSITOT — et reecrivait le brouillon a
    // partir de la page ENREGISTREE, qui ne contenait pas encore la legende
    // (la sauvegarde est asynchrone). L'affectation etait donc effacee une
    // fraction de seconde apres avoir ete faite, l'emplacement redevenait
    // vide, et le souvenir restait orphelin. A la tentative suivante,
    // l'emplacement paraissant vide, un NOUVEAU souvenir etait cree — d'ou
    // les doublons constates en base (3 variantes de la meme legende).
    //
    // C'etait une COURSE : quand la sauvegarde arrivait avant le rendu, tout
    // fonctionnait. D'ou un bug intermittent, difficile a reproduire.
    //
    // Cet effet INITIALISE le brouillon, il ne doit donc se declencher que
    // lorsqu'on change reellement de page, ou apres un rechargement
    // deliberé des donnees (loadAll -> contentVersion). Les valeurs dont il
    // a besoin sont lues via des refs : toujours fraiches, sans jamais
    // provoquer de relance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPageIndex, contentVersion]);

  // Sauvegarde automatique — jamais de bouton "Valider" separe, et reflete
  // le brouillon des le PREMIER emplacement rempli (retour utilisateur :
  // "l'element glisse doit apparaitre de suite", pas seulement une fois
  // tous les emplacements remplis). Deux chemins d'ecriture selon l'etat :
  //  - COMPLET (tous les emplacements remplis) : saveManualPage — route
  //    validee structurellement (layoutCapacity.isStructurallyCompatible),
  //    verrouille officiellement la page. Comportement inchange.
  //  - PARTIEL (au moins un rempli, pas tous) : updatePageContent — route
  //    generique sans validation de structure, juste un apercu fidele et
  //    immediat de ce que l'utilisateur vient de placer. Reste verrouillee
  //    (locked:true) des la premiere piece posee : c'est deja un travail
  //    manuel, jamais a la merci d'une recomposition automatique.
  //  - REDEVENU VIDE (tout retire) : efface la version enregistree
  //    (clearPage) plutot que de laisser un ancien contenu perime affiche.
  useEffect(() => {
    if (!draftLayoutSlug || currentPageIndex == null || !book?.id) return undefined;

    // GARDE-FOU ESSENTIEL : n'ecrire que si le brouillon appartient bien a la
    // page courante.
    //
    // Quand on change de page, DEUX effets se declenchent dans le meme rendu :
    // celui qui reinitialise le brouillon (declare plus haut) et celui-ci.
    // React execute les effets dans l'ordre de declaration, mais les
    // setState du premier ne prennent effet qu'au rendu SUIVANT : cet
    // effet-ci voyait donc le brouillon de la page PRECEDENTE avec l'index de
    // la NOUVELLE, et l'y enregistrait. Consequence mesuree en pilotant
    // l'application apres un deplacement de page (2026-09-13) : le meme
    // souvenir se retrouvait sur DEUX pages en base
    // (`0:MARQUEUR PAGE 1 | 1:MARQUEUR PAGE 1`).
    //
    // `draftPageIndex` est pose par l'effet d'initialisation : tant qu'il ne
    // correspond pas, le brouillon n'est pas encore celui de cette page et on
    // ne touche a rien. Au rendu suivant, les deux concordent et la
    // sauvegarde reprend normalement.
    if (draftPageIndex !== currentPageIndex) return undefined;

    const atelierLayout = findAtelierLayout(draftLayoutSlug);
    if (!atelierLayout) return undefined;

    const pageRow = pages.find((page) => page.page_index === currentPageIndex);
    const filledIds = draftSlotItemIds.filter(Boolean);

    if (filledIds.length === 0) {
      if (!pageRow) return undefined; // rien enregistre, rien a effacer
      let cancelledEmpty = false;
      setSaveStatus('saving');
      setSaveError('');
      const clearPromise = clearPage(book.id, currentPageIndex);
      // Publie pour handleUndo (voir clearInFlightRef) ; retire des qu'elle
      // est terminee, quelle qu'en soit l'issue.
      clearInFlightRef.current = clearPromise;
      const forget = () => { if (clearInFlightRef.current === clearPromise) clearInFlightRef.current = null; };
      clearPromise.then(forget, forget);
      clearPromise
        .then(() => {
          if (cancelledEmpty) return undefined;
          setPages((previous) => previous.filter((page) => page.page_index !== currentPageIndex));
          setSaveStatus('idle');
          return refreshPagePreview(currentPageIndex);
        })
        .catch((err) => {
          if (cancelledEmpty) return;
          setSaveStatus('error');
          setSaveError(err.message || "L'effacement a echoue.");
        });
      return () => { cancelledEmpty = true; };
    }

    const isComplete = draftSlotItemIds.length === atelierLayout.slots.length && filledIds.length === atelierLayout.slots.length;
    // Compare/enregistre draftSlotItemIds TEL QUEL (avec ses null a la
    // bonne position), jamais filledIds (compacte) : un tableau compacte
    // PERD quel item allait dans quel emplacement — au rechargement de la
    // page (voir l'effet plus haut qui reconstruit le brouillon depuis
    // pages/layoutsById), ce decalage faisait croire que le format ne
    // correspondait plus, et reinitialisait tout le choix de mise en page
    // au moindre retrait (retour utilisateur : "le modele est inutilisable").
    // pageRenderer.js ignore deja les null (blocks[].itemIds.map(...).
    // filter(Boolean) a l'affichage) : les garder ici ne casse rien au rendu.
    // photoAdjustments compare AUSSI (cahier des charges "PhotoSlot") : sans
    // ca, ajuster une photo sans toucher aux emplacements (meme itemIds)
    // serait a tort considere "deja sauvegarde" et jamais persiste.
    const alreadySaved = Array.isArray(pageRow?.content?.itemIds)
      && JSON.stringify(pageRow.content.itemIds) === JSON.stringify(draftSlotItemIds)
      && JSON.stringify(pageRow.content?.photoAdjustments || {}) === JSON.stringify(draftPhotoAdjustments)
      && JSON.stringify(pageRow.content?.textRoles || {}) === JSON.stringify(draftTextRoles)
      && JSON.stringify(pageRow.content?.textStyles || {}) === JSON.stringify(draftTextStyles);
    if (alreadySaved) return undefined;

    const realLayout = layouts.find((entry) => entry.slug === draftLayoutSlug);
    if (!realLayout) return undefined;

    let cancelled = false;
    setSaveStatus('saving');
    setSaveError('');

    const kind = realLayout.kind === 'photo' || realLayout.kind === 'texte' ? realLayout.kind : 'mixte';
    const persistPromise = isComplete
      ? saveManualPage(book.id, currentPageIndex, {
          layoutId: realLayout.id,
          itemIds: draftSlotItemIds,
          photoAdjustments: draftPhotoAdjustments,
          textRoles: draftTextRoles,
          textStyles: draftTextStyles
        })
      : updatePageContent(book.id, currentPageIndex, {
          layoutId: realLayout.id,
          content: {
            kind,
            itemIds: draftSlotItemIds,
            blocks: [{ itemIds: draftSlotItemIds, kind, layoutId: realLayout.id, presentationVariant: 0 }],
            photoAdjustments: draftPhotoAdjustments,
            textRoles: draftTextRoles,
            textStyles: draftTextStyles
          },
          locked: true
        });

    persistPromise
      .then((savedPage) => {
        if (cancelled) return undefined;
        setPages((previous) => [...previous.filter((page) => page.page_index !== currentPageIndex), savedPage]);
        setSaveStatus(isComplete ? 'saved' : 'idle');
        // Photo sur DOUBLE PAGE : la page jumelle doit porter exactement la
        // meme chose, sinon on n'obtient qu'une moitie d'image. Le rendu
        // deduit la moitie a afficher de la parite du numero de page, donc
        // les deux pages recoivent un contenu IDENTIQUE (voir
        // pageRenderer, .photo-spread).
        const mirror = isComplete && atelierLayout.spread
          ? mirrorSpread(currentPageIndex, realLayout.id)
          : Promise.resolve();
        return mirror.then(() => refreshPagePreview(currentPageIndex));
      })
      .catch((err) => {
        if (cancelled) return;
        setSaveStatus('error');
        setSaveError(err.message || 'La sauvegarde a echoue. Verifiez le contenu place.');
      });

    return () => { cancelled = true; };
    // `mirrorSpread` volontairement absent des dependances : il est recree a
    // chaque rendu, l'y mettre relancerait cet effet en boucle. Il n'a pas
    // besoin d'y figurer — il ne lit que des valeurs qui SONT deja des
    // dependances (brouillon, page courante), donc sa fermeture est fraiche
    // a chaque execution de l'effet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftLayoutSlug, draftSlotItemIds, draftPhotoAdjustments, draftTextRoles, draftTextStyles, draftPageIndex, currentPageIndex, pages, layouts, book?.id, refreshPagePreview]);

  // --- Photo sur double page -------------------------------------------
  // Les deux pages d'une double page forment la paire (2k, 2k+1) — meme
  // convention que leftPageIndex/rightPageIndex plus haut.
  const siblingPageIndex = (index) => (index % 2 === 0 ? index + 1 : index - 1);
  const isSpreadLayout = (slug) => findAtelierLayout(slug)?.spread === true;

  // La page ENREGISTREE porte-t-elle une double page ? On interroge la page
  // sauvegardee et non le brouillon : "Changer de mise en page" remet le
  // brouillon a zero, et se fier a lui faisait oublier qu'on venait d'une
  // double page (voir releaseSpreadSibling et ses appelants).
  const savedPageIsSpread = (index) => {
    const row = pages.find((page) => page.page_index === index);
    const slug = row?.layout_id ? layoutsById[row.layout_id]?.slug : null;
    return isSpreadLayout(slug);
  };

  // Ecrit sur la page jumelle le MEME contenu que la page courante. Volontaire-
  // ment appele APRES la sauvegarde de la page courante, jamais en parallele :
  // deux ecritures concurrentes sur la meme double page se marcheraient dessus.
  const mirrorSpread = async (pageIndex, layoutId) => {
    const jumelle = siblingPageIndex(pageIndex);
    if (jumelle < 0 || jumelle >= totalPages || !book?.id) return;
    try {
      const saved = await saveManualPage(book.id, jumelle, {
        layoutId,
        itemIds: draftSlotItemIds,
        photoAdjustments: draftPhotoAdjustments,
        textRoles: draftTextRoles,
        textStyles: draftTextStyles
      });
      setPages((previous) => [...previous.filter((page) => page.page_index !== jumelle), saved]);
      await refreshPagePreview(jumelle);
    } catch (_err) {
      // Non bloquant : la page courante est deja enregistree. L'utilisateur
      // verra une demi-image plutot qu'un message d'erreur trompeur sur une
      // sauvegarde qui, elle, a reussi.
      setSaveError("La seconde page de la double page n'a pas pu etre enregistree.");
    }
  };

  // Quitter la double page (autre mise en page, ou page videe) doit LIBERER la
  // page jumelle : sans ca, il resterait une demi-photo orpheline a cote.
  const releaseSpreadSibling = async (pageIndex) => {
    const jumelle = siblingPageIndex(pageIndex);
    if (jumelle < 0 || jumelle >= totalPages || !book?.id) return;
    const row = pages.find((page) => page.page_index === jumelle);
    const slug = row?.layout_id ? layoutsById[row.layout_id]?.slug : null;
    if (!isSpreadLayout(slug)) return;
    try {
      await clearPage(book.id, jumelle);
      setPages((previous) => previous.filter((page) => page.page_index !== jumelle));
      await refreshPagePreview(jumelle);
    } catch (_err) { /* non bloquant, meme raison que ci-dessus */ }
  };

  // Instantane de ce qui est actuellement sur la page, AVANT de le remplacer.
  // Ne fait rien si la page est deja vide : il n'y aurait rien a retablir, et
  // proposer "Annuler" sans objet brouillerait le signal.
  // `label` dit ce qu'on retablit, en toutes lettres : un "Annuler" seul
  // n'apprend pas ce qu'on va recuperer, et c'est justement ce qui manquait
  // quand l'utilisateur a remplace une photo sans trouver comment revenir
  // (2026-09-14).
  const captureUndo = (label) => {
    if (!draftLayoutSlug || draftSlotItemIds.filter(Boolean).length === 0) return;
    setUndoSnapshot({
      pageIndex: currentPageIndex,
      layoutSlug: draftLayoutSlug,
      slotItemIds: [...draftSlotItemIds],
      photoAdjustments: { ...draftPhotoAdjustments },
      textRoles: { ...draftTextRoles },
      textStyles: { ...draftTextStyles },
      label: label || `revenir à « ${findAtelierLayout(draftLayoutSlug)?.label || 'la mise en page précédente'} » avec son contenu`
    });
  };

  // Retablit l'instantane. Attend d'abord un eventuel clearPage en vol :
  // sans ca, l'effacement pouvait arriver au serveur APRES la restauration
  // et re-vider la page — exactement le defaut que ce bouton repare.
  const handleUndo = async () => {
    const snapshot = undoSnapshot;
    if (!snapshot || snapshot.pageIndex !== currentPageIndex) return;
    if (clearInFlightRef.current) {
      try { await clearInFlightRef.current; } catch { /* l'echec de l'effacement ne doit pas empecher de retablir */ }
    }
    setUndoSnapshot(null);
    setDraftLayoutSlug(snapshot.layoutSlug);
    setDraftSlotItemIds(snapshot.slotItemIds);
    setDraftPhotoAdjustments(snapshot.photoAdjustments);
    setDraftTextRoles(snapshot.textRoles);
    setDraftTextStyles(snapshot.textStyles);
    // La sauvegarde automatique reecrit la page toute seule : le brouillon ne
    // correspond plus a ce qui est enregistre (la page a ete effacee), donc
    // son garde-fou `alreadySaved` ne s'applique pas.
  };

  const handleChooseLayout = (slug) => {
    const atelierLayout = findAtelierLayout(slug);
    if (!atelierLayout) return;
    // On quitte une double page pour autre chose : liberer la jumelle avant
    // tout, sinon la moitie d'a cote reste affichee seule.
    if (currentPageIndex != null && savedPageIsSpread(currentPageIndex) && !atelierLayout.spread) {
      releaseSpreadSibling(currentPageIndex);
    }
    captureUndo();
    setDraftLayoutSlug(slug);
    setDraftSlotItemIds(new Array(atelierLayout.slots.length).fill(null));
    setDraftPhotoAdjustments({});
    setDraftTextRoles({});
    setDraftTextStyles({});
  };

  const handleAssignSlot = (slotIndex, itemId) => {
    // REMPLACEMENT d'un emplacement deja occupe : c'est une perte, au meme
    // titre qu'un changement de mise en page, et elle n'avait AUCUN retour en
    // arriere jusqu'au 2026-09-14 ("j'ai change une image, je n'ai pas vu le
    // bouton retour pour revenir sur l'image d'avant"). Poser simplement un
    // element dans un emplacement VIDE n'efface rien : pas d'instantane, pour
    // ne pas noyer le signal sous des "Annuler" sans objet.
    const remplace = Boolean(draftSlotItemIds[slotIndex]) && draftSlotItemIds[slotIndex] !== itemId;
    if (remplace) {
      const ancien = itemsById[draftSlotItemIds[slotIndex]];
      captureUndo(ancien?.kind === 'texte' ? 'remettre le souvenir précédent' : 'remettre la photo précédente');
    }
    setDraftSlotItemIds((previous) => {
      const next = [...previous];
      next[slotIndex] = itemId;
      return next;
    });
    setSelectedSidebarItem(null);
  };

  const handleRemoveSlot = (slotIndex) => {
    const removedItemId = draftSlotItemIds[slotIndex];
    if (removedItemId) {
      const retire = itemsById[removedItemId];
      captureUndo(retire?.kind === 'texte' ? 'remettre le souvenir retiré' : 'remettre la photo retirée');
    }
    setDraftSlotItemIds((previous) => {
      const next = [...previous];
      next[slotIndex] = null;
      return next;
    });
    // L'ajustement suit l'itemId, pas l'emplacement : un item retire n'a
    // plus de raison de garder son reglage (s'il est replace ailleurs, il
    // repart d'un cadrage automatique neutre — plus simple et previsible
    // que de le faire "voyager" d'un emplacement a un autre potentiellement
    // tres different en forme).
    if (removedItemId) {
      setDraftPhotoAdjustments((previous) => {
        if (!previous[removedItemId]) return previous;
        const next = { ...previous };
        delete next[removedItemId];
        return next;
      });
    }
  };

  // Ajustement du cadrage (cahier des charges v2) — ouvert au clic sur une
  // photo deja placee (voir AtelierPageOverlay.js).
  const handleOpenAdjust = (slotIndex) => {
    if (!draftSlotItemIds[slotIndex]) return;
    setAdjustTargetSlotIndex(slotIndex);
  };

  // Sauvegarde d'un texte modifie EN PLACE sur la page (cahier des charges
  // typographique §1, voir AtelierTextEditor.js).
  //
  // Deux choses distinctes a enregistrer, volontairement separees :
  //   - le TEXTE appartient au souvenir (content_items), il est partage par
  //     toutes les pages qui l'utilisent -> updateContentItem ;
  //   - le ROLE et les reglages appartiennent a CETTE page (c'est une
  //     decision de mise en page, pas une propriete du souvenir) -> etat
  //     local, persiste par l'autosauvegarde existante.
  // Les confondre ferait qu'un meme souvenir repris ailleurs imposerait son
  // role a l'autre page.
  const handleSaveText = async (itemId, { text, role, styleOverrides }) => {
    setDraftTextRoles((previous) => ({ ...previous, [itemId]: role }));
    setDraftTextStyles((previous) => ({ ...previous, [itemId]: styleOverrides || {} }));

    const current = itemsById[itemId];
    const nextText = String(text ?? '');
    if (!current || current.text === nextText) return;

    // Mise a jour optimiste : l'apercu doit refleter la frappe immediatement,
    // pas apres un aller-retour reseau.
    setItems((previous) => previous.map((item) => (
      item.id === itemId ? { ...item, text: nextText } : item
    )));
    setSaveStatus('saving');
    setSaveError('');
    try {
      await updateContentItem(book.id, itemId, { text: nextText });
      // RECHARGE l'apercu de la page. `setRefreshToken` ne suffisait PAS :
      // l'effet de chargement ne va chercher que les pages absentes du cache
      // (`pagePreviewCache[index] == null`), donc apres une modification il
      // reaffichait l'ancienne version. Le texte etait bien enregistre en
      // base, mais l'utilisateur voyait l'ancien — et en concluait, a juste
      // titre, que rien n'avait ete sauvegarde (retour 2026-09-11 : "j'ai
      // saisi du texte dans le cadre mais il s'enregistre pas").
      // refreshPagePreview, lui, ECRASE l'entree du cache.
      await refreshPagePreview(currentPageIndex);
      setSaveStatus('saved');
    } catch (err) {
      // On remet la valeur d'origine : laisser un texte a l'ecran que le
      // serveur n'a pas enregistre serait le pire des deux mondes.
      setItems((previous) => previous.map((item) => (
        item.id === itemId ? { ...item, text: current.text } : item
      )));
      setSaveError(err.message || "La modification du texte n'a pas pu etre enregistree.");
      setSaveStatus('error');
    }
  };

  // Ecriture DIRECTE dans un emplacement vide (retour utilisateur
  // 2026-09-11 : "il faut pouvoir ecrire directement dans les cases vierges
  // ou bien glisser un souvenir"). Le souvenir est cree a la volee puis pose
  // dans l'emplacement — il rejoint donc "Mes souvenirs" comme n'importe
  // quel autre, plutot que de vivre uniquement dans cette page.
  //
  // Rien n'est cree si le champ est laisse vide : ouvrir un emplacement puis
  // se raviser ne doit pas polluer la liste des souvenirs.
  const handleCreateText = async (slotIndex, { text, role, styleOverrides }) => {
    const value = String(text || '').trim();
    if (!book?.id || !value) return;

    setSaveStatus('saving');
    setSaveError('');
    try {
      const created = await addTextItem(book.id, value, items.length);
      setItems((previous) => [...previous, created]);
      setDraftTextRoles((previous) => ({ ...previous, [created.id]: role }));
      setDraftTextStyles((previous) => ({ ...previous, [created.id]: styleOverrides || {} }));
      // Poser l'item declenche l'effet d'autosauvegarde, qui persiste la page
      // ET rafraichit son apercu : pas de second chemin d'enregistrement.
      handleAssignSlot(slotIndex, created.id);
    } catch (err) {
      setSaveStatus('error');
      setSaveError(err.message || "Le texte n'a pas pu etre cree.");
    }
  };

  const handleSavePhotoAdjustment = (itemId, adjustment) => {
    setDraftPhotoAdjustments((previous) => ({ ...previous, [itemId]: adjustment }));
    setAdjustTargetSlotIndex(null);
  };

  const handleResetPhotoAdjustment = (itemId) => {
    setDraftPhotoAdjustments((previous) => {
      if (!previous[itemId]) return previous;
      const next = { ...previous };
      delete next[itemId];
      return next;
    });
    setAdjustTargetSlotIndex(null);
  };

  // "Voir d'autres mises en page adaptees" (§2) : bascule la page sur la
  // mise en page suggeree en gardant la photo concernee a la position ou
  // elle rentre le mieux, et laisse les autres emplacements vides — la
  // sauvegarde partielle existante s'occupe du reste.
  const handleChooseSuggestedLayout = (slug) => {
    const atelierLayout = findAtelierLayout(slug);
    const itemId = adjustTargetSlotIndex != null ? draftSlotItemIds[adjustTargetSlotIndex] : null;
    if (!atelierLayout || !itemId) return;
    const firstPhotoSlot = atelierLayout.slots.findIndex((type) => type === 'photo');
    const next = new Array(atelierLayout.slots.length).fill(null);
    if (firstPhotoSlot >= 0) next[firstPhotoSlot] = itemId;
    // Meme liberation que dans handleChooseLayout : on quitte peut-etre une
    // double page.
    if (currentPageIndex != null && savedPageIsSpread(currentPageIndex) && !atelierLayout.spread) {
      releaseSpreadSibling(currentPageIndex);
    }
    captureUndo();
    setDraftLayoutSlug(slug);
    setDraftSlotItemIds(next);
    setDraftPhotoAdjustments({}); // le cadre change de forme : l'ancien cadrage n'a plus de sens
    setAdjustTargetSlotIndex(null);
  };

  const handleClearPage = async () => {
    if (currentPageIndex == null || !book?.id) return;
    captureUndo('restaurer le contenu de cette page');
    // Vider une moitie de double page vide aussi l'autre : une demi-photo
    // seule n'a aucun sens.
    if (savedPageIsSpread(currentPageIndex)) await releaseSpreadSibling(currentPageIndex);
    setSaveStatus('saving');
    setSaveError('');
    try {
      await clearPage(book.id, currentPageIndex);
      setPages((previous) => previous.filter((page) => page.page_index !== currentPageIndex));
      setDraftLayoutSlug(null);
      setDraftSlotItemIds([]);
      setDraftPhotoAdjustments({});
      setDraftTextRoles({});
      setDraftTextStyles({});
      setSaveStatus('idle');
      await refreshPagePreview(currentPageIndex);
    } catch (err) {
      setSaveStatus('error');
      setSaveError(err.message || 'Impossible de vider cette page.');
    }
  };

  // Meme snippet que BookPageLuxe.js:handleUpdateBook — deliberement duplique
  // plutot que factorise (meme choix deja fait pour BookConfigLuxe.js/
  // l'ancien BookCoverDesignerLuxe.js, voir memoire cover-system-build-status).
  const handleUpdateBook = async (updates) => {
    const { error: updateError } = await supabase.from('books').update(updates).eq('id', bookId);
    if (updateError) throw updateError;
    setBook((previous) => ({ ...previous, ...updates }));
    return true;
  };

  // Rafraichit l'apercu de la couverture/4e apres une sauvegarde depuis
  // AtelierCoverPanel — force un rechargement (coverComposer.js recalcule a
  // chaque appel, jamais mis en cache cote serveur). Le simple fait de
  // remettre coverHtml/backCoverHtml a null NE relance PAS l'effet de
  // chargement (il ne depend pas de ces valeurs) : refreshToken s'en charge.
  const handleCoverSaved = () => {
    if (viewKind === 'cover') setCoverHtml(null);
    else if (viewKind === 'back-cover') setBackCoverHtml(null);
    setRefreshToken((previous) => previous + 1);
  };

  // Assignation directe de la photo de couverture/4e en cliquant sur
  // l'image (retour utilisateur, 2026-09-10 : "idealement modifier
  // directement sur les pages") — ecrit cover_overrides.frontPhotoId/
  // backPhotoId directement (meme colonne, meme forme que
  // AtelierCoverPanel.js), sans passer par son brouillon/debounce local :
  // ce dernier se resynchronise tout seul via son effet sur
  // book?.cover_overrides (voir AtelierCoverPanel.js). handleUpdateBook met
  // deja `book` a jour localement, donc cet effet se redeclenche
  // naturellement — aucune duplication d'etat a maintenir ici.
  const handleAssignCoverPhoto = async (face, itemId) => {
    const field = face === 'front' ? 'frontPhotoId' : 'backPhotoId';
    try {
      await handleUpdateBook({ cover_overrides: { ...(book?.cover_overrides || {}), [field]: itemId } });
      handleCoverSaved();
      setSelectedSidebarItem(null);
    } catch (_err) {
      // Non bloquant (meme philosophie que le reste de l'atelier) : l'utilisateur peut reessayer.
    }
  };

  // Envoi d'un lot de photos, une par une (jamais en parallele : le serveur
  // decode chaque image, et une rafale saturerait sa memoire).
  //
  // Deux exigences apprises d'un envoi reel de 40 photos (2026-09-12) :
  //   - AVANCEMENT visible : sans lui, plusieurs minutes sans aucun signe de
  //     vie, impossible de distinguer "ca travaille" de "c'est plante".
  //   - RESILIENCE : une photo qui echoue ne doit plus interrompre le lot.
  //     Avant, la premiere erreur faisait perdre TOUTES les photos suivantes
  //     — sur 40 photos et une coupure a la 9e, 31 etaient abandonnees sans
  //     que rien ne le dise.
  const handleUploadPhotos = async (files) => {
    const list = Array.from(files || []);
    if (!book?.id || list.length === 0) return;

    setUploadingPhotos(true);
    setSidebarAddError('');
    setUploadProgress({ done: 0, total: list.length, failed: 0 });

    const failures = [];
    for (let index = 0; index < list.length; index += 1) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const created = await uploadPhoto(book.id, list[index], items.length + index);
        setItems((previous) => [...previous, created]);
      } catch (err) {
        failures.push({ name: list[index]?.name || `photo ${index + 1}`, message: err.message });
      }
      setUploadProgress({ done: index + 1, total: list.length, failed: failures.length });
    }

    if (failures.length > 0) {
      const noms = failures.slice(0, 3).map((f) => f.name).join(', ');
      setSidebarAddError(
        `${failures.length} photo${failures.length > 1 ? 's' : ''} sur ${list.length} n'${failures.length > 1 ? 'ont' : 'a'} pas pu être ajoutée${failures.length > 1 ? 's' : ''} (${noms}${failures.length > 3 ? '…' : ''}). `
        + 'Les autres sont bien enregistrées — vous pouvez relancer uniquement celles-ci.'
      );
    }

    setUploadingPhotos(false);
    setUploadProgress(null);
  };

  const handleAddText = async (text) => {
    if (!book?.id || !text.trim()) return;
    setSidebarAddError('');
    try {
      const created = await addTextItem(book.id, text.trim(), items.length);
      setItems((previous) => [...previous, created]);
    } catch (err) {
      setSidebarAddError(err.message || "L'ajout du souvenir a echoue.");
    }
  };

  // "Tout supprimer" (photos ou souvenirs). Irreversible, et ca touche aussi
  // les pages deja composees : la confirmation nomme donc precisement ce qui
  // va disparaitre, jamais un "etes-vous sur ?" abstrait.
  const handleDeleteAll = async (kind) => {
    if (!book?.id || deletingAll) return;
    const concernes = kind === 'photo' ? photos : souvenirs;
    if (concernes.length === 0) return;

    const label = kind === 'photo'
      ? `${concernes.length} photo${concernes.length > 1 ? 's' : ''}`
      : `${concernes.length} souvenir${concernes.length > 1 ? 's' : ''}`;
    // eslint-disable-next-line no-restricted-globals
    if (!window.confirm(
      `Supprimer définitivement ${label} ?\n\n`
      + 'Ils seront aussi retirés des pages où vous les aviez placés. Cette action est irréversible.'
    )) return;

    setDeletingAll(true);
    setSidebarAddError('');
    try {
      await deleteAllContentItems(book.id, kind);
      // On relit tout plutot que de retirer les elements a la main : les
      // PAGES ont change elles aussi (references nettoyees cote serveur), et
      // les deviner ici dupliquerait cette logique.
      await loadAll();
      setSelectedSidebarItem(null);
      setRefreshToken((previous) => previous + 1);
    } catch (err) {
      setSidebarAddError(err.message || 'La suppression a echoue.');
    } finally {
      setDeletingAll(false);
    }
  };

  const handleDeleteItem = async (itemId) => {
    if (!book?.id) return;
    setSidebarAddError('');
    try {
      await deleteContentItem(book.id, itemId);
      setItems((previous) => previous.filter((item) => item.id !== itemId));
      if (selectedSidebarItem?.id === itemId) setSelectedSidebarItem(null);
    } catch (err) {
      setSidebarAddError(err.message || 'La suppression a echoue.');
    }
  };

  // Ouvre la modale de generation en verifiant d'abord si le contenu reel
  // suffit a atteindre le palier minimum (30 pages, PAGE_COUNT_TIERS[0] cote
  // backend voir layoutEngine.js — 2026-09-11 : porte de 28 a 30, etait 16
  // avant integration imprimeur) SANS duplication — le moteur ne repete
  // jamais une photo/un texte pour "boucher les trous" (voir
  // layoutEngine.compose, garanti par des tests dedies), donc un contenu
  // trop maigre pour 30 pages doit etre signale plutot que de generer un
  // livre presente comme fini alors qu'il ne l'est pas.
  const MIN_AUTO_PAGES = 30;
  const openGenerateModal = async () => {
    if (!book?.id) return;
    setGenerateError('');
    setIsGenerateModalOpen(true);
    setLoadingEstimate(true);
    try {
      const recommendation = await getRecommendedPageCount(book.id);
      setEstimatedPages(recommendation?.estimatedPages ?? null);
    } catch (_err) {
      // Non bloquant : en cas d'echec de l'estimation, on ne bloque pas la
      // generation (mieux vaut laisser essayer que bloquer sans raison sure).
      setEstimatedPages(null);
    } finally {
      setLoadingEstimate(false);
    }
  };

  // "Passer en mode automatique" (plutot que "Generer automatiquement",
  // moins ambigu — ca ne donne pas l'impression d'ecraser ce qui vient
  // d'etre fait a la main) : si au moins une page a deja ete construite/
  // verrouillee manuellement, une confirmation intermediaire s'affiche
  // avant d'ouvrir le choix d'ambiance — jamais pour un livre encore vierge.
  const hasManualWork = pages.some((page) => page.locked);
  const handleGenerateButtonClick = () => {
    if (hasManualWork) {
      setIsConfirmSwitchOpen(true);
    } else {
      openGenerateModal();
    }
  };
  const handleConfirmSwitch = () => {
    setIsConfirmSwitchOpen(false);
    openGenerateModal();
  };

  // Generation automatique (bouton "Generer automatiquement", voir
  // AtelierGenerateModal) : meme route/mecanisme que l'ancien assistant
  // /composer (compose puis replaceBookPages, respecte deja `locked`), mais
  // declenchee depuis l'atelier avec une ambiance choisie. Apres succes,
  // l'utilisateur feuillette directement le resultat dans l'atelier — pas de
  // second ecran de "preview avant de garder".
  // Deplacement d'une page (glisser-deposer dans le filmstrip). Aucun contenu
  // n'est reecrit : seuls les numeros de page changent cote serveur.
  //
  // Apres coup, TOUT le cache d'apercus est jete : entre la page de depart et
  // la page d'arrivee, chaque numero designe desormais une autre page, et une
  // vignette conservee afficherait le contenu du voisin. `contentVersion`
  // reinitialise le brouillon de la page selectionnee pour la meme raison.
  //
  // On SUIT la page deplacee (setViewIndex/selectedSide sur sa nouvelle
  // position) : la relacher et ne plus savoir ou elle est atterri serait la
  // pire facon de finir le geste.
  const handleMovePage = async (fromIndex, toIndex) => {
    if (!book?.id || fromIndex === toIndex) return;
    setMovingPage(true);
    setSaveError('');
    try {
      const result = await movePage(book.id, fromIndex, toIndex);
      setPages(result?.pages || []);

      // L'apercu d'une page deplacee n'a pas change : c'est la MEME page, a
      // une autre place. On permute donc les entrees deja en memoire, avec
      // exactement la meme correspondance que le serveur applique aux pages
      // (bookContentService.movePage) — miroir assume, comme ailleurs dans ce
      // projet.
      //
      // Pourquoi pas un rechargement : essaye d'abord, il donnait un resultat
      // INTERMITTENT puis systematiquement faux (mesure en pilotant
      // l'application : 2 essais sur 3, puis 4 sur 4). Plusieurs
      // rechargements se croisaient et l'ancien apercu restait affiche —
      // "la 2 va bien vers le 1 mais elle reste affichee dans le 2"
      // (2026-09-13). Permuter est instantane et ne peut pas se tromper :
      // aucune requete a arbitrer.
      //
      // SEULE reserve : en format Luxe, la page porte un petit numero en
      // coin, qui restera l'ancien jusqu'au prochain chargement naturel de
      // cette page. Un detail de quelques millimetres, contre une regression
      // d'affichage certaine — l'arbitrage est vite fait.
      setPagePreviewCache((previous) => {
        const nextIndexFor = (index) => {
          if (index === fromIndex) return toIndex;
          if (fromIndex < toIndex) return index > fromIndex && index <= toIndex ? index - 1 : index;
          return index >= toIndex && index < fromIndex ? index + 1 : index;
        };
        const next = {};
        Object.entries(previous).forEach(([key, html]) => {
          next[nextIndexFor(Number(key))] = html;
        });
        return next;
      });

      setContentVersion((previous) => previous + 1);
      setViewIndex(Math.floor(toIndex / 2) + 1);
      setSelectedSide(toIndex % 2 === 0 ? 'left' : 'right');
      // Volontairement AUCUN rechargement d'apercu ici (ni setRefreshToken,
      // ni refreshPagePreview) : la permutation ci-dessus suffit, et toute
      // requete supplementaire ne ferait que reintroduire la course.
    } catch (err) {
      setSaveError(err.message || "La page n'a pas pu etre deplacee.");
    } finally {
      setMovingPage(false);
    }
  };

  const handleGenerate = async (mood) => {
    if (!book?.id) return;
    setIsGenerating(true);
    setGenerateError('');
    try {
      await composeBook(book.id, generateVariant, mood);
      setGenerateVariant((previous) => previous + 1);
      const freshPages = await listPages(book.id);
      setPages(freshPages || []);
      setPagePreviewCache({});
      setCoverHtml(null);
      setBackCoverHtml(null);
      setIsGenerateModalOpen(false);
      setViewIndex(1);
      setSelectedSide('left');
      // setViewIndex(1) ne redeclenche l'effet de chargement que si on
      // n'etait PAS deja sur la premiere double-page (sinon la valeur ne
      // change pas) : refreshToken garantit le rechargement dans tous les cas.
      setRefreshToken((previous) => previous + 1);
    } catch (err) {
      setGenerateError(err.message || 'La generation automatique a echoue.');
    } finally {
      setIsGenerating(false);
    }
  };

  // Agrandir volontairement le livre (bouton "+2" du filmstrip) — jamais une
  // recomposition, jamais touche aux pages existantes (voir
  // routes/composition.js: POST /pages/extend). Meme mecanique de
  // rafraichissement que handleGenerate ci-dessus (pages + book.page_count +
  // refreshToken).
  const handleAddPages = async () => {
    if (!book?.id || addingPages) return;
    setAddingPages(true);
    try {
      const { book: updatedBook, pages: freshPages } = await extendBookPages(book.id, 2);
      setBook((previous) => ({ ...previous, ...updatedBook }));
      setPages(freshPages || []);
      setRefreshToken((previous) => previous + 1);
    } catch (err) {
      setError(err.message || "Impossible d'ajouter des pages.");
    } finally {
      setAddingPages(false);
    }
  };

  // Reduire volontairement le livre (bouton "-2" du filmstrip) — contrepartie
  // exacte de handleAddPages, meme mecanique de rafraichissement.
  //
  // Le serveur retire par la FIN et refuse net de descendre sous le minimum
  // imprimable. Si les dernieres pages ne sont PAS vides, il repond 409
  // needsConfirmation avec les numeros concernes plutot que de supprimer :
  // on pose alors la question, en nommant les pages. Ne jamais transformer ce
  // 409 en simple message d'erreur — l'utilisateur croirait l'action
  // impossible alors qu'elle attend juste son accord.
  const handleRemovePages = async () => {
    if (!book?.id || removingPages) return;

    const applyResult = ({ book: updatedBook, pages: freshPages }) => {
      setBook((previous) => ({ ...previous, ...updatedBook }));
      setPages(freshPages || []);
      setRefreshToken((previous) => previous + 1);
    };

    setRemovingPages(true);
    try {
      applyResult(await shrinkBookPages(book.id, 2));
    } catch (err) {
      const details = err?.payload;
      if (details?.needsConfirmation) {
        const numbers = (details.pageNumbers || []).join(' et ');
        const message = details.lockedCount > 0
          ? `Les pages ${numbers} contiennent du contenu ou sont verrouillees. Les supprimer definitivement ?`
          : `Les pages ${numbers} contiennent du contenu. Les supprimer definitivement ?`;
        // eslint-disable-next-line no-restricted-globals
        if (!window.confirm(message)) {
          setRemovingPages(false);
          return;
        }
        try {
          applyResult(await shrinkBookPages(book.id, 2, true));
        } catch (confirmErr) {
          setError(confirmErr.message || 'Impossible de retirer des pages.');
        }
      } else {
        setError(err.message || 'Impossible de retirer des pages.');
      }
    } finally {
      setRemovingPages(false);
    }
  };

  const canGoPrevious = viewIndex > 0;
  const canGoNext = viewIndex < lastViewIndex;

  const goToView = (nextIndex) => {
    setViewIndex(nextIndex);
    setSelectedSide('left');
  };

  // Saut direct depuis le filmstrip (voir AtelierPageFilmstrip) : 'cover'/
  // 'back-cover' pour les couvertures, sinon un index de PAGE reelle (pas un
  // index de double-page) — convertit vers le viewIndex/selectedSide qui la
  // contient, cote gauche ou droit selon la parite (meme logique que
  // leftPageIndex/rightPageIndex plus haut : page paire = gauche, impaire =
  // droite d'une meme double-page).
  const goToFilmstripTarget = (target) => {
    if (target === 'cover') {
      setViewIndex(0);
      setSelectedSide('left');
      return;
    }
    if (target === 'back-cover') {
      setViewIndex(lastViewIndex);
      setSelectedSide('left');
      return;
    }
    setViewIndex(Math.floor(target / 2) + 1);
    setSelectedSide(target % 2 === 0 ? 'left' : 'right');
  };

  const draftSlotItems = draftSlotItemIds.map((id) => (id ? itemsById[id] : null));
  const hasContent = pages.some((page) => page.page_index === currentPageIndex && page.locked);

  // Incrustation de glisser-deposer directe sur la page (en plus du panneau
  // "Mise en page", pas a sa place) : memes emplacements/etat, voir
  // AtelierPageOverlay. Rien a afficher tant qu'aucun format n'est choisi
  // pour la page courante (repli sur le panneau de droite, comme avant).
  // Actions posees sur la page en cours de modification (coin bas droit) —
  // deplacer la page dans le livre, la vider. Elles etaient dans le panneau de
  // droite, qui melangeait ainsi le travail de mise en page et les actions sur
  // la page ; elles vivent desormais sur la page, comme l'oeil "voir a
  // l'echelle" a son coin haut droit (2026-09-13).
  const pageActions = viewKind === 'spread' && currentPageIndex != null ? (
    <AtelierPageActions
      pageNumber={currentPageIndex + 1}
      totalPages={totalPages}
      // Le composant raisonne en numeros AFFICHES (1-based), le moteur en
      // index : la conversion se fait ici, une seule fois.
      onMoveToPosition={(oneBased) => handleMovePage(currentPageIndex, oneBased - 1)}
      movingPage={movingPage}
      onClearPage={handleClearPage}
      hasContent={hasContent}
    />
  ) : null;

  // Bandeau "Annuler". Visible des qu'un instantane existe pour CETTE page —
  // un seul pas en arriere, jusqu'a la prochaine action ou au changement de
  // page. La condition precedente (seulement tant que la nouvelle mise en
  // page etait vide) ne valait que pour le changement de mise en page ; elle
  // masquait le lien apres un remplacement de photo, cas ou il est justement
  // le plus utile.
  const undoBar = undoSnapshot && undoSnapshot.pageIndex === currentPageIndex ? (
    <button type="button" className="atelier-undo-bar" onClick={handleUndo}>
      <span aria-hidden="true">↩</span>
      <span>Annuler — {undoSnapshot.label}</span>
    </button>
  ) : null;

  const draftLayoutForOverlay = draftLayoutSlug ? findAtelierLayout(draftLayoutSlug) : null;
  const pageOverlay = viewKind === 'spread' && draftLayoutForOverlay ? (
    <AtelierPageOverlay
      key={currentPageIndex}
      slug={draftLayoutForOverlay.slug}
      slotTypes={draftLayoutForOverlay.slots}
      slotItems={draftSlotItems}
      onAssignSlot={handleAssignSlot}
      onRemoveSlot={handleRemoveSlot}
      onAdjustSlot={handleOpenAdjust}
      selectedSidebarItem={selectedSidebarItem}
      photoAdjustments={draftPhotoAdjustments}
      printFormat={book?.print_format}
      onSaveText={handleSaveText}
      onCreateText={handleCreateText}
      textRoles={draftTextRoles}
      textStyles={draftTextStyles}
    />
  ) : null;

  const navLabel = viewKind === 'cover'
    ? 'Couverture'
    : viewKind === 'back-cover'
      ? '4e de couverture'
      : `Page ${leftPageIndex + 1}`;

  if (loading) {
    return <div className="atelier-loading">Chargement de l'atelier...</div>;
  }

  if (!book) {
    return <div className="atelier-loading">{error || 'Livre introuvable.'}</div>;
  }

  return (
    <div className="atelier-container">
      {/* Rappel discret quand on travaille sans compte : c'est l'ecran ou
          l'on passe le plus de temps, donc celui ou il faut le dire. */}
      <AnonymousBanner compact />
      <header className="atelier-header">
        {/* Plus de lien vers /book/:bookId (l'onglet "Edition" n'existe
            plus, remplace par l'atelier lui-meme — voir BookPageLuxe.js qui
            redirige desormais cette route directement ici) : retour direct
            au tableau de bord. */}
        <Link to="/dashboard" className="atelier-back-link">← Retour au tableau de bord</Link>
        <h1 className="atelier-title">{book.title || 'Mon livre'}</h1>
        <span className="atelier-header-note">Atelier de creation personnalisee</span>
        <button
          type="button"
          className="btn btn-outline atelier-help-btn"
          onClick={() => setShowOnboarding(true)}
          title="Revoir les explications"
          aria-label="Revoir les explications"
        >
          ?
        </button>
        <button
          type="button"
          className="btn btn-outline atelier-generate-btn"
          onClick={handleGenerateButtonClick}
          title="Celebrons propose une nouvelle organisation de votre livre — vous pourrez toujours ajuster chaque page a la main ensuite"
        >
          ✨ Passer en mode automatique
        </button>
      </header>

      <AtelierConfirmSwitchDialog
        isOpen={isConfirmSwitchOpen}
        onCancel={() => setIsConfirmSwitchOpen(false)}
        onConfirm={handleConfirmSwitch}
      />

      <AtelierGenerateModal
        isOpen={isGenerateModalOpen}
        onClose={() => setIsGenerateModalOpen(false)}
        onGenerate={handleGenerate}
        isGenerating={isGenerating}
        error={generateError}
        estimatedPages={estimatedPages}
        loadingEstimate={loadingEstimate}
        minPages={MIN_AUTO_PAGES}
      />

      <AtelierPhotoAdjustModal
        isOpen={adjustTargetSlotIndex != null}
        item={adjustTargetSlotIndex != null ? draftSlotItems[adjustTargetSlotIndex] : null}
        layoutSlug={draftLayoutSlug}
        slotIndex={adjustTargetSlotIndex}
        printFormat={book?.print_format}
        adjustment={
          adjustTargetSlotIndex != null && draftSlotItems[adjustTargetSlotIndex]
            ? draftPhotoAdjustments[draftSlotItems[adjustTargetSlotIndex].id]
            : null
        }
        onSave={handleSavePhotoAdjustment}
        onReset={handleResetPhotoAdjustment}
        onClose={() => setAdjustTargetSlotIndex(null)}
        onChooseSuggestedLayout={handleChooseSuggestedLayout}
      />

      {error && <div className="wizard-error atelier-error">{error}</div>}

      {showOnboarding && (
        <AtelierOnboarding
          onDismiss={() => {
            localStorage.setItem(`${ONBOARDING_SEEN_KEY_PREFIX}${bookId}`, '1');
            setShowOnboarding(false);
          }}
        />
      )}

      {book.page_count ? (
        <div className="atelier-workspace">
          <AtelierSidebar
            photos={photos}
            souvenirs={souvenirs}
            selectedItem={selectedSidebarItem}
            onSelectItem={setSelectedSidebarItem}
            onUploadPhotos={handleUploadPhotos}
            onAddText={handleAddText}
            onDeleteItem={handleDeleteItem}
            uploadingPhotos={uploadingPhotos}
            uploadProgress={uploadProgress}
            onDeleteAll={handleDeleteAll}
            deletingAll={deletingAll}
            addError={sidebarAddError}
            initialTab={searchParams.get('tab')}
            usedItemIds={usedItemIds}
          />

          {/* Colonne centrale. Le bandeau "Annuler" et le livre sont
              REGROUPES dans ce conteneur, et non poses cote a cote : les
              enfants directs de .atelier-workspace sont les elements d'une
              grille a TROIS colonnes. En ajouter un quatrieme decalait tout
              d'un cran — le livre passait dans la colonne de droite et le
              panneau de mise en page sortait de l'ecran (regression introduite
              puis corrigee le 2026-09-14, signalee sur capture). */}
          <div className="atelier-center-column">
            {/* Retour en arriere place AU-DESSUS DU LIVRE et non dans le
                panneau de droite : sur telephone les colonnes sont empilees,
                le panneau se retrouve loin sous le livre, donc le lien etait
                invisible au moment precis ou l'on en a besoin. */}
            {undoBar}

            <AtelierBookView
            viewKind={viewKind}
            loading={loadingPreview}
            singleHtml={viewKind === 'cover' ? coverHtml : viewKind === 'back-cover' ? backCoverHtml : null}
            leftHtml={leftPageIndex != null ? pagePreviewCache[leftPageIndex] : null}
            rightHtml={rightPageIndex != null ? pagePreviewCache[rightPageIndex] : null}
            leftPageNumber={leftPageIndex != null ? leftPageIndex + 1 : null}
            rightPageNumber={rightPageIndex != null ? rightPageIndex + 1 : null}
            totalPages={totalPages}
            selectedSide={selectedSide}
            onSelectSide={setSelectedSide}
            onPrevious={() => canGoPrevious && goToView(viewIndex - 1)}
            onNext={() => canGoNext && goToView(viewIndex + 1)}
            canGoPrevious={canGoPrevious}
            canGoNext={canGoNext}
            navLabel={navLabel}
            overlay={pageOverlay}
            pageActions={pageActions}
            printFormat={book.print_format}
            onAssignCoverPhoto={handleAssignCoverPhoto}
            selectedSidebarItem={selectedSidebarItem}
            />
          </div>

          {viewKind === 'spread' ? (
            <AtelierLayoutPanel
              activeCategory={activeCategory}
              onSelectCategory={setActiveCategory}
              draftLayoutSlug={draftLayoutSlug}
              onChooseLayout={handleChooseLayout}
              slotItems={draftSlotItems}
              onAssignSlot={handleAssignSlot}
              onRemoveSlot={handleRemoveSlot}
              onChangeFormat={() => {
                // Surtout NE RIEN liberer ici : ce bouton ouvre seulement la
                // galerie, il n'engage aucun changement. Le faire cassait la
                // double page des le clic, avant meme que l'utilisateur ait
                // choisi quoi que ce soit — "quand je clique sur changer la
                // mise en page sans choisir de nouveau format, il remet la
                // photo sur une seule page" (2026-09-14). La liberation se
                // fait au moment du CHOIX reel, a partir de la page
                // enregistree (voir savedPageIsSpread).
                captureUndo();
                setDraftLayoutSlug(null);
                setDraftSlotItemIds([]);
                setDraftPhotoAdjustments({});
                setDraftTextRoles({});
                setDraftTextStyles({});
              }}
              selectedSidebarItem={selectedSidebarItem}
              saveStatus={saveStatus}
              saveError={saveError}
              printFormat={book.print_format}
              currentPageIndex={currentPageIndex}
              availableSlugs={availableLayoutSlugs}
              // "Vider cette page" et "Position dans le livre" sont passes sur
              // la page elle-meme (voir pageActions plus bas).
            />
          ) : (
            <AtelierCoverPanel
              book={book}
              face={viewKind === 'cover' ? 'front' : 'back'}
              onUpdateBook={handleUpdateBook}
              onSaved={handleCoverSaved}
            />
          )}
        </div>
      ) : null}

      {book.page_count ? (
        <AtelierPageFilmstrip
          pageStatuses={finishStats.pageStatuses}
          activeTarget={viewKind === 'cover' ? 'cover' : viewKind === 'back-cover' ? 'back-cover' : currentPageIndex}
          printFormat={book.print_format}
          onSelect={goToFilmstripTarget}
          onAddPages={handleAddPages}
          addingPages={addingPages}
          onRemovePages={handleRemovePages}
          removingPages={removingPages}
          // Le serveur reste l'autorite (il refuse en 422), mais griser le
          // bouton evite de proposer une action qu'on sait deja impossible.
          // `totalPages` (book.page_count) et NON `pages.length` : une page
          // vide n'a pas de ligne en base, donc compter les lignes sous-estime
          // le livre et grisait le bouton a tort sur un livre peu rempli
          // (2026-09-14, meme famille que l'ecart page_count / pages reelles).
          canRemovePages={totalPages - 2 >= MIN_AUTO_PAGES}
          minPages={MIN_AUTO_PAGES}
          onMovePage={handleMovePage}
          movingPage={movingPage}
        />
      ) : null}

      {book.page_count ? (
        <div className="atelier-finish-bar">
          <button type="button" className="btn btn-primary atelier-finish-btn" onClick={() => setIsFinishModalOpen(true)}>
            Terminer mon livre →
          </button>
        </div>
      ) : null}

      <AtelierFinishModal
        isOpen={isFinishModalOpen}
        onClose={() => setIsFinishModalOpen(false)}
        stats={finishStats}
        onContinue={() => navigate(`/book/${bookId}/apercu`)}
        bookId={book?.id}
        onViewPage={goToFilmstripTarget}
      />
    </div>
  );
}
