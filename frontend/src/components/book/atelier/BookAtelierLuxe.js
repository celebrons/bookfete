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
  getRecommendedPageCount,
  extendBookPages
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
import { findAtelierLayout } from './atelierLayouts';
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

  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [sidebarAddError, setSidebarAddError] = useState('');
  const [addingPages, setAddingPages] = useState(false);

  // Force un rechargement de l'apercu de la vue courante meme quand
  // viewIndex ne change pas (ex. sauvegarde de couverture, generation
  // automatique alors qu'on est deja sur la premiere double-page) : l'effet
  // de chargement ci-dessous ne se redeclenche que sur un changement de
  // dependance, jamais sur un simple `setCoverHtml(null)` isole.
  const [refreshToken, setRefreshToken] = useState(0);

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
    if (currentPageIndex == null) {
      setDraftLayoutSlug(null);
      setDraftSlotItemIds([]);
      setDraftPhotoAdjustments({});
      return;
    }
    const pageRow = pages.find((page) => page.page_index === currentPageIndex);
    const realLayout = pageRow?.layout_id ? layoutsById[pageRow.layout_id] : null;
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
      const cleanedItemIds = pageRow.content.itemIds.map((id) => (id && itemsById[id] ? id : null));
      setDraftSlotItemIds(cleanedItemIds);
      setDraftPhotoAdjustments(pageRow.content?.photoAdjustments || {});
    } else {
      setDraftLayoutSlug(null);
      setDraftSlotItemIds([]);
      setDraftPhotoAdjustments({});
    }
    setActiveCategory(null);
    setSelectedSidebarItem(null);
    setSaveStatus('idle');
    setSaveError('');
  }, [currentPageIndex, pages, layoutsById, itemsById]);

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
    const atelierLayout = findAtelierLayout(draftLayoutSlug);
    if (!atelierLayout) return undefined;

    const pageRow = pages.find((page) => page.page_index === currentPageIndex);
    const filledIds = draftSlotItemIds.filter(Boolean);

    if (filledIds.length === 0) {
      if (!pageRow) return undefined; // rien enregistre, rien a effacer
      let cancelledEmpty = false;
      setSaveStatus('saving');
      setSaveError('');
      clearPage(book.id, currentPageIndex)
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
      && JSON.stringify(pageRow.content?.photoAdjustments || {}) === JSON.stringify(draftPhotoAdjustments);
    if (alreadySaved) return undefined;

    const realLayout = layouts.find((entry) => entry.slug === draftLayoutSlug);
    if (!realLayout) return undefined;

    let cancelled = false;
    setSaveStatus('saving');
    setSaveError('');

    const kind = realLayout.kind === 'photo' || realLayout.kind === 'texte' ? realLayout.kind : 'mixte';
    const persistPromise = isComplete
      ? saveManualPage(book.id, currentPageIndex, { layoutId: realLayout.id, itemIds: draftSlotItemIds, photoAdjustments: draftPhotoAdjustments })
      : updatePageContent(book.id, currentPageIndex, {
          layoutId: realLayout.id,
          content: {
            kind,
            itemIds: draftSlotItemIds,
            blocks: [{ itemIds: draftSlotItemIds, kind, layoutId: realLayout.id, presentationVariant: 0 }],
            photoAdjustments: draftPhotoAdjustments
          },
          locked: true
        });

    persistPromise
      .then((savedPage) => {
        if (cancelled) return undefined;
        setPages((previous) => [...previous.filter((page) => page.page_index !== currentPageIndex), savedPage]);
        setSaveStatus(isComplete ? 'saved' : 'idle');
        return refreshPagePreview(currentPageIndex);
      })
      .catch((err) => {
        if (cancelled) return;
        setSaveStatus('error');
        setSaveError(err.message || 'La sauvegarde a echoue. Verifiez le contenu place.');
      });

    return () => { cancelled = true; };
  }, [draftLayoutSlug, draftSlotItemIds, draftPhotoAdjustments, currentPageIndex, pages, layouts, book?.id, refreshPagePreview]);

  const handleChooseLayout = (slug) => {
    const atelierLayout = findAtelierLayout(slug);
    if (!atelierLayout) return;
    setDraftLayoutSlug(slug);
    setDraftSlotItemIds(new Array(atelierLayout.slots.length).fill(null));
    setDraftPhotoAdjustments({});
  };

  const handleAssignSlot = (slotIndex, itemId) => {
    setDraftSlotItemIds((previous) => {
      const next = [...previous];
      next[slotIndex] = itemId;
      return next;
    });
    setSelectedSidebarItem(null);
  };

  const handleRemoveSlot = (slotIndex) => {
    const removedItemId = draftSlotItemIds[slotIndex];
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
    setDraftLayoutSlug(slug);
    setDraftSlotItemIds(next);
    setDraftPhotoAdjustments({}); // le cadre change de forme : l'ancien cadrage n'a plus de sens
    setAdjustTargetSlotIndex(null);
  };

  const handleClearPage = async () => {
    if (currentPageIndex == null || !book?.id) return;
    setSaveStatus('saving');
    setSaveError('');
    try {
      await clearPage(book.id, currentPageIndex);
      setPages((previous) => previous.filter((page) => page.page_index !== currentPageIndex));
      setDraftLayoutSlug(null);
      setDraftSlotItemIds([]);
      setDraftPhotoAdjustments({});
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

  const handleUploadPhotos = async (files) => {
    if (!book?.id || !files || files.length === 0) return;
    setUploadingPhotos(true);
    setSidebarAddError('');
    try {
      for (const file of files) {
        // eslint-disable-next-line no-await-in-loop
        const created = await uploadPhoto(book.id, file, items.length);
        setItems((previous) => [...previous, created]);
      }
    } catch (err) {
      setSidebarAddError(err.message || "L'ajout de la photo a echoue.");
    } finally {
      setUploadingPhotos(false);
    }
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
  // suffit a atteindre le palier minimum (28 pages, PAGE_COUNT_TIERS[0] cote
  // backend voir layoutEngine.js — 2026-09-09 : minimum imprimable Gelato,
  // etait 16 avant integration imprimeur) SANS duplication — le moteur ne
  // repete jamais une photo/un texte pour "boucher les trous" (voir
  // layoutEngine.compose, garanti par des tests dedies), donc un contenu
  // trop maigre pour 28 pages doit etre signale plutot que de generer un
  // livre presente comme fini alors qu'il ne l'est pas.
  const MIN_AUTO_PAGES = 28;
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
            addError={sidebarAddError}
            initialTab={searchParams.get('tab')}
            usedItemIds={usedItemIds}
          />

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
            printFormat={book.print_format}
            onAssignCoverPhoto={handleAssignCoverPhoto}
            selectedSidebarItem={selectedSidebarItem}
          />

          {viewKind === 'spread' ? (
            <AtelierLayoutPanel
              activeCategory={activeCategory}
              onSelectCategory={setActiveCategory}
              draftLayoutSlug={draftLayoutSlug}
              onChooseLayout={handleChooseLayout}
              slotItems={draftSlotItems}
              onAssignSlot={handleAssignSlot}
              onRemoveSlot={handleRemoveSlot}
              onChangeFormat={() => { setDraftLayoutSlug(null); setDraftSlotItemIds([]); setDraftPhotoAdjustments({}); }}
              selectedSidebarItem={selectedSidebarItem}
              onClearPage={handleClearPage}
              hasContent={hasContent}
              saveStatus={saveStatus}
              saveError={saveError}
              printFormat={book.print_format}
              currentPageIndex={currentPageIndex}
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
