import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';
import {
  listContentItems,
  fetchCoverPreviewHtml,
  fetchInteriorPagePreviewHtml,
  estimatePrice,
  getFormatOptions,
  chooseFormat
} from '../../services/compositionApi';
import { applyLifecycleStatus } from '../../utils/bookLifecycle';
import { PageZoomStage, ZoomControls } from '../common/PageZoomStage';
import '../../styles/luxe-theme.css';
import './BookPreviewFinalLuxe.css';

// Etape "JE VERIFIE" du parcours (voir cahier des charges : JE CREE -> JE
// VERIFIE -> J'ACHETE) — un seul ecran qui feuillette le livre reel
// (couverture -> pages -> 4e, meme moteur que le PDF final) et porte, en
// permanence a cote, le choix du FORMAT et de la PAGINATION avec le prix en
// direct. Le contenu ne change jamais ici — "Modifier mon livre" renvoie a
// l'atelier, seul endroit qui touche au contenu.

// Dimensions alignees sur backend/services/composition/coverFormat.js
// (COVER_FORMATS) — a garder synchronisees a la main si l'un des deux change.
// widthMm/heightMm servent a calculer le ratio d'affichage REEL de chaque
// format (voir pageAspectRatio plus bas) : le rendu envoye a l'iframe
// (routes/composition.js: renderSinglePageHtml) etire toujours la page en
// 100vw/100vh — c'est la FORME DU CONTENEUR qui doit porter le vrai ratio,
// sinon changer de format ne change jamais rien a l'ecran (bug signale).
// `spine` pilote uniquement le visuel de tranche cote client (voir
// .preview-final-format-spine dans le CSS) — aucune donnee serveur
// equivalente, purement descriptif (souple/rigide/rigide premium).
const PRINT_FORMATS = [
  { id: 'livret', label: 'Livret', tagline: 'Simple & élégant', description: 'Un format carré et léger pour conserver vos souvenirs.', dimensions: '17 × 17 cm', widthMm: 170, heightMm: 170, spine: 'soft', coverLabel: 'couverture souple' },
  { id: 'standard', label: 'Standard', badge: '⭐', tagline: 'Le livre souvenir', description: 'Le meilleur équilibre entre qualité et prix.', dimensions: '22 × 28 cm', widthMm: 220, heightMm: 280, spine: 'rigid', coverLabel: 'couverture rigide' },
  { id: 'luxe', label: 'Luxe', tagline: 'Premium & intemporel', description: 'Une finition haut de gamme pour un livre à conserver ou à offrir.', dimensions: '24 × 32 cm', widthMm: 240, heightMm: 320, spine: 'premium', coverLabel: 'couverture rigide premium' }
];

const normalizePrintFormat = (value) => (
  PRINT_FORMATS.some((format) => format.id === value) ? value : 'standard'
);

// Conversion physique standard (96dpi de reference) — meme constante que
// l'atelier (AtelierBookView.js).
const PX_PER_MM = 96 / 25.4;

// BUG CORRIGE (retour utilisateur, capture d'ecran a l'appui — cadre dore de
// la couverture Luxe qui deborde/se decale, titre tronque) : donner
// directement une largeur/hauteur au <iframe> (via CSS aspect-ratio+
// max-width) ne "zoome" pas son contenu comme une photo — le document a
// l'interieur SE REDIMENSIONNE (100vw/100vh devient la taille du cadre),
// alors que le CSS de la page (pageRenderer.js/frontCoverRenderer.js/
// coverTheme.js) place le texte ET les ornements (ex. le cadre dore du
// Luxe) en unites PHYSIQUES (`pt`/`mm`), independantes de la taille du
// cadre. Un cadre plus petit que la vraie taille du format fait deborder ce
// contenu absolu — exactement le meme bug diagnostique et corrige dans
// l'atelier (voir common/PageZoomStage.js pour la version generale de ce
// meme principe).
//
// Utilise uniquement pour la PETITE carte normale (pas le plein ecran,
// passe a PageZoomStage depuis la refonte du 2026-09-09 — voir plus bas) :
// sa taille vient de la mise en page CSS (aspect-ratio+max-width,
// responsive a la colonne/au format), pas d'un calcul JS explicite comme
// PageZoomStage, donc ce composant garde sa propre mesure locale.
//
// Fix : le <iframe> garde TOUJOURS sa taille naturelle reelle
// (naturalWidthPx/naturalHeightPx, la vraie conversion mm->px du format) ;
// un `transform:scale()` CSS, applique APRES la mise en page interne, la
// redimensionne visuellement pour tenir dans l'espace REELLEMENT rendu par
// SON PROPRE wrapper — mesure via ResizeObserver, le composant possede et
// mesure son propre wrapper (pas besoin que le parent gere un ref externe :
// plusieurs instances independantes, gauche/droite/single, cohabitent sans
// jamais se marcher dessus).
//
// Deux niveaux, pas un seul : le wrapper EXTERIEUR (wrapClassName, taille
// CSS/JS inchangee) reste overflow:visible — `children` (la tranche du
// livre, .preview-final-frame-spine, qui depasse volontairement de 7px a
// droite pour l'effet visuel) y reste positionnee sans etre coupee. Le
// `overflow:hidden` qui coupe l'iframe a la bonne taille vit sur un DIV
// INTERIEUR dedie (.scaled-page-frame-clip, absolument positionne pour
// remplir tout le wrapper) — c'est LUI qui est mesure par le
// ResizeObserver, jamais le wrapper exterieur.
function ScaledPageFrame({ html, title, naturalWidthPx, naturalHeightPx, wrapClassName, wrapStyle, frameClassName, children }) {
  const clipRef = useRef(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const el = clipRef.current;
    if (!el || !naturalWidthPx || !naturalHeightPx) return undefined;

    // BUG CORRIGE (retour utilisateur, capture d'ecran a l'appui : la
    // couverture "coupee", titre invisible) : calculer l'echelle depuis la
    // LARGEUR seule suppose que le wrapper garde exactement le ratio
    // naturel du format — vrai la plupart du temps (aspect-ratio pose en
    // style inline), FAUX pour .preview-final-frame-wrap-single qui a AUSSI
    // un max-height:65vh : quand cette limite de hauteur intervient, la
    // boite rendue n'a plus le meme ratio que le format (aspect-ratio et
    // max-height entrent en conflit, max-height gagne sur la hauteur sans
    // que la largeur ne se retasse en consequence). Une echelle basee
    // uniquement sur la largeur agrandissait alors le contenu au-dela de
    // ce que la hauteur reelle pouvait montrer, coupant le bas de la page
    // (titre/sous-titre) par le overflow:hidden du clip. Fix : "contain
    // fit" classique, le plus petit des deux ratios (largeur ET hauteur) —
    // meme principe que PageZoomStage (common/PageZoomStage.js) — la page
    // entiere reste toujours visible, quitte a laisser un espace vide sur
    // un des deux axes.
    const measure = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setScale(Math.min(rect.width / naturalWidthPx, rect.height / naturalHeightPx));
      }
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [naturalWidthPx, naturalHeightPx]);

  return (
    <div className={wrapClassName} style={wrapStyle}>
      <div ref={clipRef} className="scaled-page-frame-clip">
        {html && (
          <iframe
            title={title}
            srcDoc={html}
            className={frameClassName}
            style={{
              width: `${naturalWidthPx}px`,
              height: `${naturalHeightPx}px`,
              transform: `scale(${scale})`
            }}
          />
        )}
      </div>
      {children}
    </div>
  );
}

const formatEuro = (cents) => (
  cents == null ? '—' : (Number(cents) / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
);

export default function BookPreviewFinalLuxe() {
  const { bookId } = useParams();
  const navigate = useNavigate();

  const [book, setBook] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [viewIndex, setViewIndex] = useState(0);
  // Couverture/4e : une seule page (singleHtml). Pages interieures : par
  // double-page (leftHtml/rightHtml), comme un vrai livre ouvert — meme
  // decoupage couverture/spread/4e et meme calcul de pages gauche/droite
  // que l'atelier (BookAtelierLuxe.js), copie-adapte ici plutot que partage
  // (meme raison que BookConfigLuxe.js : zero couverture de tests
  // frontend, un refactor partage serait un risque non detectable).
  const [singleHtml, setSingleHtml] = useState(null);
  const [leftHtml, setLeftHtml] = useState(null);
  const [rightHtml, setRightHtml] = useState(null);
  const [loadingPage, setLoadingPage] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const [pricesByFormat, setPricesByFormat] = useState({});
  // { livret: pageCount, standard: pageCount, luxe: pageCount } — pagination
  // REELLE de chaque format pour le contenu actuel (formatComposer.js, cote
  // serveur), plus jamais un seul champ page_count partage entre les 3
  // formats : chaque format recompose le contenu different, donc peut avoir
  // un nombre de pages different (voir formatComposer.js).
  const [formatOptions, setFormatOptions] = useState({});
  const [switchingFormat, setSwitchingFormat] = useState(false);
  const [ordering, setOrdering] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [{ data: bookRow, error: bookError }, itemList] = await Promise.all([
        supabase.from('books').select('*').eq('id', bookId).single(),
        listContentItems(bookId)
      ]);
      if (bookError) throw new Error(bookError.message || 'Livre introuvable.');
      setBook(bookRow);
      setItems(itemList || []);
    } catch (err) {
      setError(err.message || 'Erreur de chargement.');
    } finally {
      setLoading(false);
    }
  }, [bookId]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const handleUpdateBook = async (updates) => {
    const { error: updateError } = await supabase.from('books').update(updates).eq('id', bookId);
    if (updateError) throw updateError;
    setBook((previous) => ({ ...previous, ...updates }));
  };

  // Atteindre cet ecran = l'apercu a bien ete genere/vu — statut jamais
  // regressif (onlyForward), non bloquant (echec silencieux).
  useEffect(() => {
    if (!book?.id) return;
    applyLifecycleStatus('preview_available', { book, onUpdateBook: handleUpdateBook, onlyForward: true }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book?.id]);

  const photosCount = useMemo(() => items.filter((item) => item.kind === 'photo').length, [items]);
  const souvenirsCount = useMemo(() => items.filter((item) => item.kind === 'texte').length, [items]);
  const totalPages = book?.page_count || 0;
  const spreadCount = Math.max(1, Math.ceil(totalPages / 2));
  const totalViews = spreadCount + 2; // couverture + doubles-pages + 4e
  const currentFormat = normalizePrintFormat(book?.print_format);
  // Ratio REEL du format choisi, applique en style inline (voir plus bas)
  // sur les conteneurs de page — c'est le seul levier qui compte : le rendu
  // envoye a l'iframe (pageRenderer.js: renderSinglePageHtml) etire toujours
  // la page en 100vw/100vh, donc lui seul ne montrera jamais la difference
  // entre livret/standard/luxe. Utilise pour l'apercu reduit (CSS
  // aspect-ratio) ; le plein ecran, lui, passe directement les dimensions
  // naturelles en px a PageZoomStage (voir plus bas), qui mesure l'espace
  // reellement disponible plutot que de deriver ce ratio en CSS.
  const currentFormatMeta = PRINT_FORMATS.find((format) => format.id === currentFormat) || PRINT_FORMATS[1];
  const pageAspectRatio = `${currentFormatMeta.widthMm} / ${currentFormatMeta.heightMm}`;
  // Vraie taille naturelle du format (mm -> px) — voir ScaledPageFrame plus
  // haut : c'est TOUJOURS cette taille qui est envoyee a l'iframe, jamais
  // une taille reduite/agrandie directement.
  const naturalPageWidthPx = currentFormatMeta.widthMm * PX_PER_MM;
  const naturalPageHeightPx = currentFormatMeta.heightMm * PX_PER_MM;

  const viewKind = viewIndex === 0 ? 'cover' : viewIndex === totalViews - 1 ? 'back-cover' : 'spread';
  const spreadNumber = viewKind === 'spread' ? viewIndex - 1 : null;
  const leftPageIndex = spreadNumber != null ? spreadNumber * 2 : null;
  const rightPageIndex = spreadNumber != null && leftPageIndex + 1 < totalPages ? leftPageIndex + 1 : null;

  // Pagination REELLE de chaque format pour le contenu actuel
  // (formatComposer.js, cote serveur — pur, ne persiste rien) : rechargee a
  // chaque livre different et a chaque changement de format reussi
  // (handleChooseFormat ci-dessous), jamais calculee/devinee cote client.
  const loadFormatOptions = useCallback(async () => {
    if (!book?.id) return;
    try {
      const { formats } = await getFormatOptions(book.id);
      setFormatOptions(Object.fromEntries((formats || []).map((entry) => [entry.formatId, entry.pageCount])));
    } catch (_err) {
      // Silencieux : les cartes affichent alors "…" a la place du nombre de
      // pages plutot que de bloquer tout l'ecran pour un souci secondaire.
    }
  }, [book?.id]);

  useEffect(() => { loadFormatOptions(); }, [loadFormatOptions]);

  // Prix de CHAQUE format a SA PROPRE pagination (formatOptions) — plus un
  // seul pageCount partage entre les 3 formats (voir formatOptions plus
  // haut) : meme mecanisme d'estimation deja utilise par Configuration
  // (estimatePrice, jamais persiste par cet appel).
  useEffect(() => {
    if (!book?.id || Object.keys(formatOptions).length === 0) return undefined;
    let cancelled = false;
    Promise.all(PRINT_FORMATS.map((format) => {
      const pageCount = formatOptions[format.id];
      if (!pageCount) return Promise.resolve([format.id, null]);
      return estimatePrice(book.id, { printFormat: format.id, pageCount })
        .then((result) => [format.id, result.unitCents])
        .catch(() => [format.id, null]);
    })).then((entries) => { if (!cancelled) setPricesByFormat(Object.fromEntries(entries)); });
    return () => { cancelled = true; };
  }, [book?.id, formatOptions]);

  // Feuilletage en mode livre : couverture seule -> doubles-pages (gauche/
  // droite) -> 4e seule. Memes routes que l'atelier
  // (fetchCoverPreviewHtml/fetchInteriorPagePreviewHtml) — jamais une
  // deuxieme implementation de rendu.
  useEffect(() => {
    if (!book?.id || !totalViews) return undefined;
    let cancelled = false;
    setLoadingPage(true);
    const load = async () => {
      try {
        if (viewKind === 'cover') {
          const html = await fetchCoverPreviewHtml(book.id, 'front');
          if (!cancelled) { setSingleHtml(html); setLeftHtml(null); setRightHtml(null); }
        } else if (viewKind === 'back-cover') {
          const html = await fetchCoverPreviewHtml(book.id, 'back');
          if (!cancelled) { setSingleHtml(html); setLeftHtml(null); setRightHtml(null); }
        } else {
          const indexes = [leftPageIndex, rightPageIndex].filter((index) => index != null);
          const htmls = await Promise.all(indexes.map((index) => fetchInteriorPagePreviewHtml(book.id, index)));
          if (!cancelled) {
            setSingleHtml(null);
            setLeftHtml(leftPageIndex != null ? htmls[indexes.indexOf(leftPageIndex)] : null);
            setRightHtml(rightPageIndex != null ? htmls[indexes.indexOf(rightPageIndex)] : null);
          }
        }
      } catch (_err) {
        if (!cancelled) { setSingleHtml(null); setLeftHtml(null); setRightHtml(null); }
      } finally {
        if (!cancelled) setLoadingPage(false);
      }
    };
    load();
    return () => { cancelled = true; };
    // book?.print_format en dependance : le format determine les dimensions
    // reelles du rendu (routes/composition.js: resolveCoverFormat) — sans
    // ca, changer de format sauvegarde bien la valeur mais l'apercu affiche
    // continue de montrer l'ancien rendu jusqu'au prochain changement de
    // page (React ne relance un effet que si une DEPENDANCE DECLAREE change,
    // jamais parce qu'un state qu'il lit a change ailleurs — meme bug deja
    // rencontre et corrige dans l'atelier, voir BookAtelierLuxe.js: refreshToken).
  }, [book?.id, viewIndex, totalViews, viewKind, leftPageIndex, rightPageIndex, book?.print_format]);

  const canGoPrevious = viewIndex > 0;
  const canGoNext = viewIndex < totalViews - 1;
  const goPrevious = useCallback(() => setViewIndex((index) => Math.max(0, index - 1)), []);
  const goNext = useCallback(() => setViewIndex((index) => Math.min(totalViews - 1, index + 1)), [totalViews]);

  // Feuilleter le livre entier SANS quitter le plein ecran (fleches clavier
  // + boutons dans le calque) — reutilise les memes handlers/etat que la
  // navigation reduite, un seul "pageHtml" partage entre les deux vues.
  useEffect(() => {
    if (!isFullscreen) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setIsFullscreen(false);
      else if (event.key === 'ArrowLeft') goPrevious();
      else if (event.key === 'ArrowRight') goNext();
    };
    document.addEventListener('keydown', handleKeyDown);
    // bloque le defilement sur <body> ET <html> (retour utilisateur : un
    // scroll restait possible en plein ecran) — bloquer seulement <body> ne
    // suffit pas toujours : la fenetre reste la "scrolling box" au sens du
    // navigateur si <html> lui-meme n'est pas aussi contraint.
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    // Masque l'en-tete global (retour utilisateur : "ça fait gagner de
    // l'espace") — voir Layout.css (body.has-fullscreen-viewer .site-header)
    // et le meme ajout cote atelier (AtelierBookView.js) pour le detail.
    document.body.classList.add('has-fullscreen-viewer');
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.body.classList.remove('has-fullscreen-viewer');
    };
  }, [isFullscreen, goPrevious, goNext]);

  // Ajustement/zoom/panoramique du plein ecran : entierement delegue a
  // PageZoomStage (common/PageZoomStage.js, partage avec l'atelier) depuis
  // la refonte du 2026-09-09 ("cahier des charges REFONTE UX DES APERCUS")
  // — remplace l'ancien calcul JS "contain fit" fait a la main ici (deux
  // passes de reglages avant d'aboutir a un calcul par pixels, lui-meme
  // remplace maintenant par un ResizeObserver + zoom controle). zoom
  // persiste deliberement d'une page a l'autre (voir PageZoomStage.js) : un
  // useState simple suffit, pas de logique de reinitialisation ici.
  const [zoom, setZoom] = useState('fit');
  const SPREAD_GAP_PX = 16;
  const naturalSpreadWidthPx = naturalPageWidthPx * 2 + SPREAD_GAP_PX;

  // Recompose (contenu non verrouille) + persiste immediatement (voir
  // formatComposer.js — meme principe "pas de bouton Valider" que le reste
  // du projet) et met a jour book.print_format/book.page_count d'un coup :
  // ce que "Commander mon livre" imprimera correspond donc toujours a ce qui
  // vient d'etre recompose ici, jamais un format choisi puis une pagination
  // qui reste celle d'un autre format.
  const handleChooseFormat = async (formatId) => {
    if (formatId === currentFormat || switchingFormat) return;
    setSwitchingFormat(true);
    setError('');
    try {
      const { book: updatedBook } = await chooseFormat(bookId, formatId);
      setBook((previous) => ({ ...previous, ...updatedBook }));
      loadFormatOptions();
    } catch (_err) {
      setError('Impossible de changer le format.');
    } finally {
      setSwitchingFormat(false);
    }
  };

  const handleOrder = async () => {
    setOrdering(true);
    try {
      await applyLifecycleStatus('finalized', { book, onUpdateBook: handleUpdateBook });
      navigate(`/book/${bookId}/checkout`);
    } catch (_err) {
      setError('Impossible de continuer vers la commande.');
      setOrdering(false);
    }
  };

  const viewLabel = viewKind === 'cover'
    ? 'Couverture'
    : viewKind === 'back-cover'
      ? '4e de couverture'
      : rightPageIndex != null
        ? `Pages ${leftPageIndex + 1}-${rightPageIndex + 1} / ${totalPages}`
        : `Page ${leftPageIndex + 1} / ${totalPages}`;
  const hasCurrentContent = viewKind === 'spread' ? Boolean(leftHtml || rightHtml) : Boolean(singleHtml);
  const isFullscreenSpreadWithBothPages = viewKind === 'spread' && rightPageIndex != null;
  const fullscreenContentWidthPx = isFullscreenSpreadWithBothPages ? naturalSpreadWidthPx : naturalPageWidthPx;
  // Cle de remontage : reinitialise le panoramique (PageZoomStage) et
  // rejoue la transition douce d'apparition a chaque page/format different.
  const fullscreenPageChangeKey = `${currentFormat}-${viewKind}-${leftPageIndex}`;

  if (loading) {
    return <div className="atelier-loading">Chargement de votre livre...</div>;
  }
  if (!book) {
    return <div className="atelier-loading">{error || 'Livre introuvable.'}</div>;
  }

  return (
    <div className="preview-final-container">
      <header className="preview-final-header">
        <Link to={`/book/${bookId}/atelier`} className="preview-final-back-link">← Modifier mon livre</Link>
        <div>
          <h1 className="preview-final-title">Votre livre est prêt</h1>
          <p className="preview-final-subtitle">Feuilletez votre livre avant de choisir son format.</p>
        </div>
      </header>

      {error && <div className="wizard-error preview-final-error">{error}</div>}

      <div className="preview-final-layout">
        <div className="preview-final-stage">
          {loadingPage && <p className="preview-final-loading">Chargement de la page...</p>}
          <button
            type="button"
            className="preview-final-fullscreen-btn"
            onClick={() => setIsFullscreen(true)}
            disabled={!hasCurrentContent}
            title="Feuilleter en plein écran"
          >
            ⛶ <span>Plein écran</span>
          </button>
          {viewKind === 'spread' ? (
            <div className="preview-final-spread">
              <ScaledPageFrame
                key={`${currentFormat}-left`}
                html={leftHtml}
                title="Page gauche"
                naturalWidthPx={naturalPageWidthPx}
                naturalHeightPx={naturalPageHeightPx}
                wrapClassName="preview-final-frame-wrap"
                wrapStyle={{ aspectRatio: pageAspectRatio }}
                frameClassName="preview-final-frame"
              />
              {rightPageIndex != null && (
                <ScaledPageFrame
                  key={`${currentFormat}-right`}
                  html={rightHtml}
                  title="Page droite"
                  naturalWidthPx={naturalPageWidthPx}
                  naturalHeightPx={naturalPageHeightPx}
                  wrapClassName="preview-final-frame-wrap"
                  wrapStyle={{ aspectRatio: pageAspectRatio }}
                  frameClassName="preview-final-frame"
                />
              )}
            </div>
          ) : (
            <ScaledPageFrame
              key={`${currentFormat}-single`}
              html={singleHtml}
              title="Aperçu"
              naturalWidthPx={naturalPageWidthPx}
              naturalHeightPx={naturalPageHeightPx}
              wrapClassName="preview-final-frame-wrap preview-final-frame-wrap-single"
              wrapStyle={{ aspectRatio: pageAspectRatio }}
              frameClassName="preview-final-frame"
            >
              {viewKind === 'cover' && (
                <span className={`preview-final-frame-spine is-${currentFormatMeta.spine}`} aria-hidden="true" />
              )}
            </ScaledPageFrame>
          )}
          <div className="preview-final-nav">
            <button type="button" className="btn btn-outline" onClick={goPrevious} disabled={!canGoPrevious}>
              ‹
            </button>
            <span className="preview-final-nav-label">{viewLabel}</span>
            <button type="button" className="btn btn-outline" onClick={goNext} disabled={!canGoNext}>
              ›
            </button>
          </div>
        </div>

        <aside className="preview-final-sidebar">
          <div className="preview-final-sidebar-section">
            <span className="preview-final-sidebar-label">Votre livre</span>
            <p className="preview-final-book-title">{book.title}</p>
            <p className="preview-final-book-stats">
              📖 {totalPages} pages · 📷 {photosCount} photos · ✍️ {souvenirsCount} souvenirs
            </p>
          </div>

          <div className="preview-final-sidebar-section">
            <span className="preview-final-sidebar-label">Format</span>
            <div className="preview-final-format-list">
              {PRINT_FORMATS.map((format) => {
                const formatPageCount = formatOptions[format.id];
                return (
                  <button
                    key={format.id}
                    type="button"
                    className={`preview-final-format-card ${currentFormat === format.id ? 'is-selected' : ''}`}
                    onClick={() => handleChooseFormat(format.id)}
                    disabled={switchingFormat}
                  >
                    <span
                      className={`preview-final-format-spine is-${format.spine}`}
                      style={{ '--spine-thickness': `${Math.min(10, 2 + (formatPageCount || 16) / 8)}px` }}
                      aria-hidden="true"
                    />
                    <span className="preview-final-format-name">{format.label} {format.badge || ''}</span>
                    <span className="preview-final-format-tagline">{format.tagline}</span>
                    <span className="preview-final-format-description">{format.description}</span>
                    <span className="preview-final-format-dimensions">{format.dimensions} · {format.coverLabel}</span>
                    <span className="preview-final-format-pagecount">
                      {formatPageCount != null ? `${formatPageCount} pages` : '…'}
                    </span>
                    <span className="preview-final-format-price">{formatEuro(pricesByFormat[format.id])}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="preview-final-sidebar-section preview-final-total">
            <span className="preview-final-sidebar-label">Total</span>
            <p className="preview-final-total-price">{formatEuro(pricesByFormat[currentFormat])}</p>
          </div>

          <button type="button" className="btn btn-primary preview-final-order-btn" onClick={handleOrder} disabled={ordering}>
            {ordering ? 'Un instant...' : 'Commander mon livre →'}
          </button>
        </aside>
      </div>

      {isFullscreen && (
        // Fermeture au clic n'importe ou dans le calque, SAUF sur les
        // controles du bas (nav/zoom, stopPropagation dediee) — meme
        // principe que l'atelier ("Voir a l'echelle", AtelierBookView.js),
        // applique ici pour la premiere fois (l'ancien stopPropagation sur
        // tout le panneau, retire, empechait "cliquer a cote pour fermer"
        // de fonctionner, meme bug que celui deja corrige cote atelier).
        <div className="preview-final-fullscreen-backdrop" onClick={() => setIsFullscreen(false)}>
          <div className="preview-final-fullscreen-panel">
            <div className="preview-final-fullscreen-head">
              {/* Reprend volontairement le meme message d'accueil que le
                  titre de la page (voir <h1> plus haut) plutot que la
                  position de page (deja affichee en bas) — le livre est le
                  centre de l'experience, pas la chrome (cahier des charges
                  §6 : "reduire fortement les elements d'interface"). */}
              <span>Votre livre est prêt</span>
              <button type="button" className="atelier-modal-close" onClick={() => setIsFullscreen(false)} aria-label="Fermer">×</button>
            </div>
            {loadingPage && <p className="preview-final-loading is-on-dark">Chargement de la page...</p>}

            <div className="preview-final-fullscreen-stage-wrap">
              <PageZoomStage
                contentWidthPx={fullscreenContentWidthPx}
                contentHeightPx={naturalPageHeightPx}
                zoom={zoom}
                onZoomChange={setZoom}
                resetPanKey={fullscreenPageChangeKey}
              >
                {viewKind === 'spread' ? (
                  <div className="preview-final-zoom-spread preview-final-zoom-page-change" key={fullscreenPageChangeKey}>
                    {leftHtml ? (
                      <iframe title="Page gauche" srcDoc={leftHtml} className="preview-final-zoom-frame" />
                    ) : (
                      <div className="atelier-page-placeholder" />
                    )}
                    {isFullscreenSpreadWithBothPages && <span className="preview-final-zoom-spine" aria-hidden="true" />}
                    {rightPageIndex != null && (
                      rightHtml ? (
                        <iframe title="Page droite" srcDoc={rightHtml} className="preview-final-zoom-frame" />
                      ) : (
                        <div className="atelier-page-placeholder" />
                      )
                    )}
                  </div>
                ) : (
                  <div className="preview-final-zoom-single preview-final-zoom-page-change" key={fullscreenPageChangeKey}>
                    {singleHtml ? (
                      <iframe title="Aperçu plein écran" srcDoc={singleHtml} className="preview-final-zoom-frame" />
                    ) : (
                      <div className="atelier-page-placeholder" />
                    )}
                  </div>
                )}
              </PageZoomStage>
            </div>

            <div className="preview-final-fullscreen-footer" onClick={(event) => event.stopPropagation()}>
              <div className="preview-final-fullscreen-nav">
                <button type="button" className="btn btn-outline" onClick={goPrevious} disabled={!canGoPrevious}>
                  ‹ Précédent
                </button>
                <span className="preview-final-fullscreen-nav-label">{viewLabel}</span>
                <button type="button" className="btn btn-outline" onClick={goNext} disabled={!canGoNext}>
                  Suivant ›
                </button>
              </div>
              <ZoomControls zoom={zoom} onZoomChange={setZoom} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
