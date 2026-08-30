// C:\Users\USER\bookfete\frontend\src\components\book\BookPageLuxe.js
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';
import { listOrdersByBook } from '../../services/ordersApi';
import ChapterListLuxe from './ChapterListLuxe';
import BookConfigLuxe from './BookConfigLuxe';
import ContributorsTabLuxe from './contributors/ContributorsTabLuxe';
import Loading from '../common/Loading';
import BookWorkspaceHeader from './BookWorkspaceHeader';
import {
  BOOK_LIFECYCLE_ORDER,
  getBookLifecycleConfig,
  getBookLifecycleStatusFromBook,
  isBookLifecycleAtLeast,
  normalizeBookLifecycleStatus
} from '../../utils/bookLifecycle';
import '../../styles/luxe-theme.css';
import './BookLuxe.css';

const CHAPTER_STATE_EMAIL = '__chapter_state__@system.local';
const CHAPTER_DRAFT_EMAIL = '__chapter_draft__@system.local';
const MAX_CHAPTERS = 12;
const WRITING_GUIDE_STEPS = [
  {
    title: 'Edition du livre',
    text: 'Travaillez en galerie ou en sommaire. Cliquez un chapitre, la zone de travail s ouvre a droite.'
  },
  {
    title: 'Workflow chapitre (1 a 4)',
    text: 'Suivez l ordre Questions > Contribution > Invitations > Generation. Les etapes valides passent en bas.'
  },
  {
    title: 'Couverture et 4e',
    text: 'Configurez la couverture et la 4e de couverture depuis la meme galerie, comme des elements du livre.'
  },
  {
    title: 'Contributeurs et temps reel',
    text: 'Les compteurs et statuts se mettent a jour en direct sans rafraichir la page.'
  },
  {
    title: 'Apercu puis validation',
    text: 'Quand chapitres + couverture + 4e sont valides, generez un apercu. Vous pouvez encore modifier avant validation finale.'
  },
  {
    title: 'Suivi de production',
    text: 'Apres validation definitive, la commande devient disponible puis la timeline suit production et expedition.'
  }
];

const TAB_HELP = {
  chapitres: 'Structure du livre, couverture/4e et travail chapitre par chapitre.',
  contributeurs: 'Ajout, suivi et gestion des personnes qui peuvent contribuer au livre.',
  config: 'Reglages du livre: style, papier, finition, volume et prix.'
};

const getSoloMode = (book) => Boolean(book?.cover_config?.soloMode);
const normalizeText = (value) => (value === null || value === undefined ? '' : String(value).trim());
const getDisplayBookTitle = (value) => {
  const normalized = normalizeText(value);
  if (!normalized) return '';
  return normalized.replace(/^(?:\[[^\]]+\]\s*)+/g, '').trim() || normalized;
};
const INVALID_CHAPTER_TITLE_PATTERNS = [
  /system settings/i,
  /user management/i,
  /roles?, permissions?/i,
  /database configuration/i,
  /database connections?/i,
  /api integrations?/i,
  /api keys?/i,
  /environment variables?/i,
  /\badmin\b/i,
  /\bdashboard\b/i,
  /\bsettings\b/i,
  /\bbackend\b/i,
  /\bfrontend\b/i,
  /\bschema\b/i,
  /\bprompts?\b/i,
  /\bplatform\b/i,
  /\berror messages?\b/i,
  /\bissues?\b/i,
  /\bi['’]d be happy\b/i,
  /\bguide you\b/i
];
const sanitizeChapterDisplayTitle = (value) => normalizeText(value)
  .replace(/^["'`]+|["'`]+$/g, '')
  .replace(/^\*\*|\*\*$/g, '')
  .replace(/^(?:chapitre|chapter)\s*\d+\s*[:\-]\s*/i, '')
  .replace(/^\d+[\.\)\-:]\s*/g, '')
  .trim();
const isLikelyDisplayChapterTitle = (value) => {
  const normalized = sanitizeChapterDisplayTitle(value);
  if (!normalized) return false;
  if (normalized.length < 4 || normalized.length > 84) return false;
  if (normalized.endsWith('?')) return false;
  if (/\*\*/.test(normalized)) return false;
  if (/[{}[\]]/.test(normalized)) return false;
  const wordCount = normalized.split(/\s+/).filter(Boolean).length;
  if (wordCount > 8) return false;
  if (/^(?:what|which|why|how|are|is|can|could|would|please|it\s+seems|i['’]d)/i.test(normalized)) return false;
  if (INVALID_CHAPTER_TITLE_PATTERNS.some((pattern) => pattern.test(normalized))) return false;
  return true;
};
const getSafeChapterTitle = (value, index) => {
  if (index === 0) return 'Introduction';
  const normalized = sanitizeChapterDisplayTitle(value);
  return isLikelyDisplayChapterTitle(normalized) ? normalized : `Chapitre ${index + 1}`;
};
const ORDER_STATUSES_WITH_PDF_ACCESS = new Set([
  'paid',
  'pdf_generating',
  'pdf_ready',
  'print_queued',
  'sent_to_printer',
  'printed',
  'shipped',
  'delivered'
]);
const wait = (durationMs) => new Promise((resolve) => {
  setTimeout(resolve, durationMs);
});
const isMissingPdfJobError = (error) => (
  /job export introuvable|introuvable/i.test(String(error?.message || ''))
);
const getPdfFallbackName = (kind) => {
  if (kind === 'cover') return 'couverture.pdf';
  if (kind === 'interior') return 'interieur.pdf';
  return 'livre-final.pdf';
};
const PREVIEW_FORMAT_ALIASES = {
  prestige: 'standard',
  carre: 'luxe'
};
const BOOK_PREVIEW_FORMATS = [
  {
    id: 'livret',
    label: 'Livret',
    note: '148 x 210 mm'
  },
  {
    id: 'standard',
    label: 'Standard',
    note: '210 x 297 mm'
  },
  {
    id: 'luxe',
    label: 'Luxe',
    note: '240 x 320 mm'
  }
];
const PREVIEW_FORMAT_LAYOUT_DEFAULTS = {
  livret: {
    textDensity: 'compact',
    imageDensity: 'discrete',
    lineSpacing: 'compact',
    fontScale: 0.96
  },
  standard: {
    textDensity: 'balanced',
    imageDensity: 'balanced',
    lineSpacing: 'balanced',
    fontScale: 1
  },
  luxe: {
    textDensity: 'airy',
    imageDensity: 'immersive',
    lineSpacing: 'airy',
    fontScale: 1.04
  }
};
const PREVIEW_TEXT_DENSITY_OPTIONS = [
  { id: 'airy', label: 'Aere' },
  { id: 'balanced', label: 'Standard' },
  { id: 'compact', label: 'Dense' }
];
const PREVIEW_IMAGE_DENSITY_OPTIONS = [
  { id: 'discrete', label: 'Discret' },
  { id: 'balanced', label: 'Equilibre' },
  { id: 'immersive', label: 'Immersif' }
];
const PREVIEW_LINE_SPACING_OPTIONS = [
  { id: 'compact', label: 'Serre', factor: 0.9 },
  { id: 'balanced', label: 'Normal', factor: 1 },
  { id: 'airy', label: 'Aere', factor: 1.16 }
];
const PREVIEW_FORMAT_IMPACT = {
  livret: 'Format compact: lecture dense, ideal pour recits courts et directs.',
  standard: 'Format equilibre: bon compromis texte / respiration visuelle.',
  luxe: 'Grand format: mise en page plus aeree avec presence visuelle renforcee.'
};
const PREVIEW_TEXT_DENSITY_IMPACT = {
  airy: 'Plus d air entre les paragraphes, rendu editorial premium.',
  balanced: 'Mise en page reguliere pour une lecture fluide.',
  compact: 'Plus de texte visible par page, rythme plus soutenu.'
};
const PREVIEW_IMAGE_DENSITY_IMPACT = {
  discrete: 'Photos plus discretes pour privilegier le recit.',
  balanced: 'Equilibre visuel entre texte et photos.',
  immersive: 'Images plus presentes pour un rendu album.'
};
const PREVIEW_LINE_SPACING_IMPACT = {
  compact: 'Interligne serre, utile pour condenser le contenu.',
  balanced: 'Interligne standard, lecture naturelle.',
  airy: 'Interligne plus ouvert, rendu elegant et respire.'
};
const DEFAULT_DRAFT_LAYOUT_SETTINGS = {
  textDensity: 'balanced',
  imageDensity: 'balanced',
  lineSpacing: 'balanced',
  fontScale: 1
};
const normalizePreviewFormatId = (rawValue) => {
  const normalized = normalizeText(rawValue).toLowerCase();
  const canonical = PREVIEW_FORMAT_ALIASES[normalized] || normalized;
  return BOOK_PREVIEW_FORMATS.some((format) => format.id === canonical) ? canonical : '';
};

const normalizeDraftLayoutSettings = (rawValue) => {
  const source = rawValue && typeof rawValue === 'object' ? rawValue : {};
  const textDensity = PREVIEW_TEXT_DENSITY_OPTIONS.some((option) => option.id === source.textDensity)
    ? source.textDensity
    : DEFAULT_DRAFT_LAYOUT_SETTINGS.textDensity;
  const imageDensity = PREVIEW_IMAGE_DENSITY_OPTIONS.some((option) => option.id === source.imageDensity)
    ? source.imageDensity
    : DEFAULT_DRAFT_LAYOUT_SETTINGS.imageDensity;
  const lineSpacing = PREVIEW_LINE_SPACING_OPTIONS.some((option) => option.id === source.lineSpacing)
    ? source.lineSpacing
    : DEFAULT_DRAFT_LAYOUT_SETTINGS.lineSpacing;
  const rawFontScale = Number(source.fontScale);
  const fontScale = Number.isFinite(rawFontScale)
    ? Math.min(1.08, Math.max(0.9, rawFontScale))
    : DEFAULT_DRAFT_LAYOUT_SETTINGS.fontScale;

  return {
    textDensity,
    imageDensity,
    lineSpacing,
    fontScale
  };
};
const areDraftLayoutSettingsEqual = (leftValue, rightValue) => {
  const left = normalizeDraftLayoutSettings(leftValue);
  const right = normalizeDraftLayoutSettings(rightValue);
  return (
    left.textDensity === right.textDensity
    && left.imageDensity === right.imageDensity
    && left.lineSpacing === right.lineSpacing
    && left.fontScale === right.fontScale
  );
};

const buildDraftPreviewPages = (html) => {
  if (!html || typeof window === 'undefined') {
    return [];
  }

  try {
    const parser = new window.DOMParser();
    const document = parser.parseFromString(html, 'text/html');
    const root = document.querySelector('.draft-book') || document.body;
    if (!root) {
      return [];
    }

    const pages = [];
    Array.from(root.children || []).forEach((child) => {
      if (!(child instanceof window.HTMLElement)) {
        return;
      }

      if (child.classList.contains('draft-book-chapter')) {
        const chapterPages = Array.from(
          child.querySelectorAll('.draft-book-chapter-shell > .draft-book-page')
        );

        chapterPages.forEach((page) => {
          if (page instanceof window.HTMLElement && page.outerHTML) {
            pages.push(page.outerHTML);
          }
        });

        const chapterSections = Array.from(
          child.querySelectorAll(':scope > .draft-book-section')
        );
        chapterSections.forEach((section) => {
          if (section instanceof window.HTMLElement && section.outerHTML) {
            pages.push(section.outerHTML);
          }
        });
        return;
      }

      if (child.outerHTML) {
        pages.push(child.outerHTML);
      }
    });

    return pages.filter(Boolean);
  } catch (_error) {
    return [];
  }
};

const parseChapterDraftState = (rawValue) => {
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue);
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    return {
      version: parsed.version || 1,
      status: parsed.status || 'draft',
      generationCount: Number(parsed.generationCount || 0),
      maxGenerations: Number(parsed.maxGenerations || 3),
      title: parsed.title || '',
      summary: parsed.summary || '',
      html: parsed.html || '',
      aiQuality: parsed.aiQuality && typeof parsed.aiQuality === 'object'
        ? {
            score: Number(parsed.aiQuality.score || 0),
            issues: Array.isArray(parsed.aiQuality.issues)
              ? parsed.aiQuality.issues
              : []
          }
        : null,
      aiPlan: parsed.aiPlan && typeof parsed.aiPlan === 'object' ? parsed.aiPlan : null,
      generationMode: parsed.generationMode || '',
      lastGeneratedAt: parsed.lastGeneratedAt || null,
      lastEditedAt: parsed.lastEditedAt || null,
      finalizedAt: parsed.finalizedAt || null
    };
  } catch (error) {
    return null;
  }
};

const BookPageLuxe = () => {
  const { bookId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [book, setBook] = useState(null);
  const [chapters, setChapters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('chapitres');
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [isChapterWorkspaceActive, setIsChapterWorkspaceActive] = useState(false);
  const [selectedPreviewFormat, setSelectedPreviewFormat] = useState('standard');
  const [draftReadingMode, setDraftReadingMode] = useState('horizontal');
  const [draftLayoutSettings, setDraftLayoutSettings] = useState(DEFAULT_DRAFT_LAYOUT_SETTINGS);
  const [draftSpreadIndex, setDraftSpreadIndex] = useState(0);
  const [generatingDraft, setGeneratingDraft] = useState(false);
  const [draftPreview, setDraftPreview] = useState(null);
  const [pdfExportJob, setPdfExportJob] = useState(null);
  const [downloadingPdfKind, setDownloadingPdfKind] = useState('');
  const [loadingPdfPreview, setLoadingPdfPreview] = useState(false);
  const [regeneratingPdfPreview, setRegeneratingPdfPreview] = useState(false);
  const [isPdfPreviewControlsCollapsed, setIsPdfPreviewControlsCollapsed] = useState(false);
  const [pdfPreviewModal, setPdfPreviewModal] = useState({
    open: false,
    kind: 'final',
    url: ''
  });
  const [updatingLifecycleStatus, setUpdatingLifecycleStatus] = useState('');
  const [hasPaidOrderAccess, setHasPaidOrderAccess] = useState(false);
  const [latestPdfOrder, setLatestPdfOrder] = useState(null);
  const [latestBookOrder, setLatestBookOrder] = useState(null);
  const [user, setUser] = useState(null);
  const [pageNotice, setPageNotice] = useState(null);
  const [editionGalleryRequest, setEditionGalleryRequest] = useState(0);
  const chapterIdsRef = useRef(new Set());
  const pdfExportPollRef = useRef(null);
  const draftLayoutSaveTimeoutRef = useRef(null);
  const pdfPanelRef = useRef(null);
  const mainContentRef = useRef(null);
  const areAllChaptersValidated = chapters.length > 0 && chapters.every(
    (chapter) => chapter?.chapterDraft?.status === 'validated'
  );
  const validatedChapterCount = chapters.filter(
    (chapter) => chapter?.chapterDraft?.status === 'validated'
  ).length;
  const coverConfig = (book?.cover_config && typeof book.cover_config === 'object')
    ? book.cover_config
    : {};
  const backCoverConfig = (book?.back_cover_config && typeof book.back_cover_config === 'object')
    ? book.back_cover_config
    : {};
  const isFrontCoverValidated = Boolean(
    normalizeText(coverConfig.title || book?.title)
    && normalizeText(coverConfig.recipientLine)
    && normalizeText(coverConfig.eventLine)
  );
  const isBackCoverValidated = Boolean(
    normalizeText(backCoverConfig.blurb)
    && normalizeText(backCoverConfig.signature)
  );
  const isBookReadyForPreview = Boolean(
    areAllChaptersValidated
    && isFrontCoverValidated
    && isBackCoverValidated
  );

  useEffect(() => {
    getUser();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search || '');
    const requestedTab = params.get('tab');
    const requestedView = params.get('view');

    if (requestedTab === 'chapitres' || requestedTab === 'contributeurs' || requestedTab === 'config') {
      setActiveTab(requestedTab);
    }

    if (requestedTab === 'chapitres' && requestedView === 'gallery') {
      setEditionGalleryRequest((previous) => previous + 1);
      if (typeof window !== 'undefined') {
        window.requestAnimationFrame(() => {
          scrollToMainContent();
        });
        window.setTimeout(() => {
          scrollToMainContent();
        }, 120);
      }
    }
  }, [location.search]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.scrollTo({
      top: 0,
      left: 0,
      behavior: 'auto'
    });
  }, [activeTab, location.pathname]);

  useEffect(() => {
    if (bookId && user) {
      loadBookAndChapters();
    }
  }, [bookId, user]);

  useEffect(() => {
    if (!bookId || !user) {
      return;
    }

    loadBookOrderAccess();
  }, [bookId, user]);

  useEffect(() => {
    const configuredFormat = normalizePreviewFormatId(book?.cover_config?.previewFormat || '');
    if (configuredFormat && configuredFormat !== selectedPreviewFormat) {
      setSelectedPreviewFormat(configuredFormat);
    }
  }, [book?.id, book?.cover_config?.previewFormat, selectedPreviewFormat]);

  useEffect(() => {
    const nextSettings = normalizeDraftLayoutSettings(book?.cover_config?.previewLayoutSettings);
    setDraftLayoutSettings((previous) => {
      if (
        previous.textDensity === nextSettings.textDensity
        && previous.imageDensity === nextSettings.imageDensity
        && previous.lineSpacing === nextSettings.lineSpacing
        && previous.fontScale === nextSettings.fontScale
      ) {
        return previous;
      }
      return nextSettings;
    });
  }, [book?.id, book?.cover_config?.previewLayoutSettings]);

  useEffect(() => {
    chapterIdsRef.current = new Set(
      chapters
        .map((chapter) => chapter?.id)
        .filter(Boolean)
    );
  }, [chapters]);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return undefined;
    }

    if (!pdfPreviewModal.open && !draftPreview) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [pdfPreviewModal.open, draftPreview]);

  useEffect(() => (
    () => {
      if (draftLayoutSaveTimeoutRef.current) {
        clearTimeout(draftLayoutSaveTimeoutRef.current);
        draftLayoutSaveTimeoutRef.current = null;
      }
      if (pdfExportPollRef.current) {
        clearInterval(pdfExportPollRef.current);
        pdfExportPollRef.current = null;
      }
      if (pdfPreviewModal.url && typeof window !== 'undefined') {
        window.URL.revokeObjectURL(pdfPreviewModal.url);
      }
    }
  ), [pdfPreviewModal.url]);

  useEffect(() => {
    if (!bookId || !user) {
      return undefined;
    }

    const shouldRefreshForChapter = (payload) => {
      const changedChapterId = payload?.new?.chapter_id || payload?.old?.chapter_id;
      return Boolean(changedChapterId && chapterIdsRef.current.has(changedChapterId));
    };

    const channel = supabase
      .channel(`book-page-${bookId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'contributions' },
        (payload) => {
          if (shouldRefreshForChapter(payload)) {
            loadBookAndChapters({ silent: true });
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chapter_invites' },
        (payload) => {
          if (shouldRefreshForChapter(payload)) {
            loadBookAndChapters({ silent: true });
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chapters', filter: `book_id=eq.${bookId}` },
        () => {
          loadBookAndChapters({ silent: true });
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'books', filter: `id=eq.${bookId}` },
        () => {
          loadBookAndChapters({ silent: true });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [bookId, user]);

  const getUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    setUser(user);
  };

  const loadBookOrderAccess = async () => {
    try {
      const orders = await listOrdersByBook(bookId);
      const latestBookLevelOrder = Array.isArray(orders) && orders.length > 0
        ? orders[0]
        : null;
      const latestPdfRelatedOrder = Array.isArray(orders)
        ? orders.find((order) => ['pdf', 'pack'].includes(String(order?.type || '').toLowerCase()))
        : null;
      const paidAccess = Array.isArray(orders) && orders.some((order) => (
        ORDER_STATUSES_WITH_PDF_ACCESS.has(String(order?.status || '').toLowerCase())
      ));
      setHasPaidOrderAccess(paidAccess);
      setLatestPdfOrder(latestPdfRelatedOrder || null);
      setLatestBookOrder(latestBookLevelOrder || null);

      const jobId = String(latestPdfRelatedOrder?.metadata?.pdfJobId || '').trim();
      if (jobId) {
        setPdfExportJob((previous) => {
          const orderStatus = String(latestPdfRelatedOrder?.status || '').toLowerCase();
          const inferredStatus = (
            latestPdfRelatedOrder?.metadata?.pdfReady || orderStatus === 'pdf_ready'
          )
            ? 'ready'
            : orderStatus === 'pdf_generating'
              ? 'rendering'
              : previous?.status || 'queued';

          return {
            jobId,
            status: inferredStatus,
            createdAt: previous?.createdAt || latestPdfRelatedOrder?.metadata?.pdfRequestedAt || null,
            completedAt: latestPdfRelatedOrder?.metadata?.pdfCompletedAt || previous?.completedAt || null,
            renderer: latestPdfRelatedOrder?.metadata?.pdfRenderer || previous?.renderer || null,
            error: latestPdfRelatedOrder?.metadata?.pdfError || null
          };
        });
      }

      return {
        paidAccess,
        latestPdfOrder: latestPdfRelatedOrder || null,
        latestBookOrder: latestBookLevelOrder || null
      };
    } catch (error) {
      setHasPaidOrderAccess(false);
      setLatestPdfOrder(null);
      setLatestBookOrder(null);
      return {
        paidAccess: false,
        latestPdfOrder: null,
        latestBookOrder: null
      };
    }
  };

  const handlePreviewFormatChange = async (nextFormat) => {
    const formatId = normalizePreviewFormatId(nextFormat);
    const isSupported = Boolean(formatId);
    if (!isSupported || formatId === selectedPreviewFormat) {
      return;
    }

    stopPdfExportPolling();
    setPdfExportJob(null);
    if (pdfPreviewModal.open) {
      closePdfPreviewModal();
    }
    setSelectedPreviewFormat(formatId);
    const formatLayoutDefaults = normalizeDraftLayoutSettings(
      PREVIEW_FORMAT_LAYOUT_DEFAULTS[formatId] || DEFAULT_DRAFT_LAYOUT_SETTINGS
    );
    setDraftLayoutSettings(formatLayoutDefaults);
    setDraftSpreadIndex(0);
    if (!book?.id) {
      return;
    }

    try {
      const currentCoverConfig = (book?.cover_config && typeof book.cover_config === 'object')
        ? book.cover_config
        : {};
      await handleUpdateBook({
        cover_config: {
          ...currentCoverConfig,
          previewFormat: formatId,
          previewLayoutSettings: formatLayoutDefaults
        }
      });
    } catch (_error) {
      showPageNotice('Le format est applique localement. Reessayez pour l enregistrer.', 'info');
    }
  };

  const queueDraftLayoutSettingsSave = (nextSettings) => {
    if (!book?.id) {
      return;
    }
    if (draftLayoutSaveTimeoutRef.current) {
      clearTimeout(draftLayoutSaveTimeoutRef.current);
      draftLayoutSaveTimeoutRef.current = null;
    }
    draftLayoutSaveTimeoutRef.current = setTimeout(async () => {
      draftLayoutSaveTimeoutRef.current = null;
      const currentCoverConfig = (book?.cover_config && typeof book.cover_config === 'object')
        ? book.cover_config
        : {};
      const persistedLayout = normalizeDraftLayoutSettings(currentCoverConfig.previewLayoutSettings);
      if (areDraftLayoutSettingsEqual(persistedLayout, nextSettings)) {
        return;
      }
      try {
        await handleUpdateBook({
          cover_config: {
            ...currentCoverConfig,
            previewFormat: selectedPreviewFormat,
            previewLayoutSettings: nextSettings
          }
        });
      } catch (_error) {
        showPageNotice('Reglage applique localement. Reessayez pour l enregistrer.', 'info');
      }
    }, 420);
  };

  const applyDraftLayoutSettings = (recipe) => {
    setDraftLayoutSettings((previous) => {
      const candidate = typeof recipe === 'function'
        ? recipe(previous)
        : { ...previous, ...recipe };
      const next = normalizeDraftLayoutSettings(candidate);
      if (areDraftLayoutSettingsEqual(previous, next)) {
        return previous;
      }
      queueDraftLayoutSettingsSave(next);
      return next;
    });
  };

  const getApiBaseUrl = () => process.env.REACT_APP_API_URL || 'http://localhost:5001/api';
  const showPageNotice = (message, type = 'info') => {
    setPageNotice({ message, type });
  };
  const dismissPageNotice = () => {
    setPageNotice(null);
  };

  const stopPdfExportPolling = () => {
    if (pdfExportPollRef.current) {
      clearInterval(pdfExportPollRef.current);
      pdfExportPollRef.current = null;
    }
  };

  const parseFileNameFromDisposition = (disposition, fallback) => {
    if (!disposition) {
      return fallback;
    }

    const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
    if (utf8Match?.[1]) {
      return decodeURIComponent(utf8Match[1]);
    }

    const standardMatch = disposition.match(/filename="?([^";]+)"?/i);
    if (standardMatch?.[1]) {
      return standardMatch[1];
    }

    return fallback;
  };

  const closePdfPreviewModal = () => {
    setPdfPreviewModal((previous) => {
      if (previous.url && typeof window !== 'undefined') {
        window.URL.revokeObjectURL(previous.url);
      }

      return {
        ...previous,
        open: false,
        url: ''
      };
    });
    setLoadingPdfPreview(false);
    setIsPdfPreviewControlsCollapsed(false);
  };

  const getAuthAccessToken = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;

    if (!token) {
      throw new Error('Session introuvable');
    }

    return token;
  };

  const fetchPdfFileBlob = async ({ kind, jobId }) => {
    const token = await getAuthAccessToken();

    const response = await fetch(
      `${getApiBaseUrl()}/books/${bookId}/export-final-pdf/${jobId}/download/${kind}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    );

    if (!response.ok) {
      const errorPayload = await response.json().catch(() => ({}));
      throw new Error(errorPayload.error || 'Erreur lors du telechargement du PDF');
    }

    const fallbackFileName = getPdfFallbackName(kind);
    const fileName = parseFileNameFromDisposition(
      response.headers.get('content-disposition'),
      fallbackFileName
    );
    const blob = await response.blob();

    return {
      blob,
      fileName
    };
  };

  const startFinalPdfExportJob = async (orderId = '', options = {}) => {
    const token = await getAuthAccessToken();
    const normalizedOrderId = String(orderId || '').trim();
    const forceRegenerate = Boolean(options?.forceRegenerate);
    const payloadBody = {
      previewFormat: selectedPreviewFormat,
      previewLayoutSettings: {
        textDensity: draftLayoutSettings.textDensity,
        imageDensity: draftLayoutSettings.imageDensity,
        lineSpacing: draftLayoutSettings.lineSpacing,
        fontScale: draftLayoutSettings.fontScale
      }
    };
    if (forceRegenerate) {
      payloadBody.forceRegenerate = true;
    }
    if (normalizedOrderId) {
      payloadBody.orderId = normalizedOrderId;
    }
    const response = await fetch(
      `${getApiBaseUrl()}/books/${bookId}/export-final-pdf`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payloadBody)
      }
    );
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.error || 'Impossible de relancer la generation PDF');
    }
    return payload;
  };

  const pollFinalPdfExportJobUntilReady = async (jobId) => {
    const token = await getAuthAccessToken();
    const maxAttempts = 90;
    const delayMs = 2200;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      // eslint-disable-next-line no-await-in-loop
      const response = await fetch(
        `${getApiBaseUrl()}/books/${bookId}/export-final-pdf/${jobId}/status`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );
      // eslint-disable-next-line no-await-in-loop
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || 'Erreur pendant la generation du PDF');
      }

      setPdfExportJob((previous) => ({
        ...previous,
        ...payload
      }));

      if (payload.status === 'ready') {
        return payload;
      }
      if (payload.status === 'failed') {
        throw new Error(payload.error || 'La generation du PDF a echoue');
      }

      // eslint-disable-next-line no-await-in-loop
      await wait(delayMs);
    }

    throw new Error('Le PDF met trop de temps a etre genere. Reessayez dans quelques instants.');
  };

  const recoverMissingPdfJob = async (orderOverride = null) => {
    const accessSnapshot = await loadBookOrderAccess();
    const paidAccess = accessSnapshot?.paidAccess ?? hasPaidOrderAccess;
    const linkedOrder = orderOverride || accessSnapshot?.latestPdfOrder || latestPdfOrder;

    if (!paidAccess || !linkedOrder?.id) {
      throw new Error('Commande associee au PDF introuvable');
    }

    showPageNotice('Le job PDF a expire. Regeneration en cours...', 'info');
    let restartedJob;
    try {
      restartedJob = await startFinalPdfExportJob(linkedOrder.id);
    } catch (error) {
      const message = String(error?.message || '').toLowerCase();
      if (!message.includes('commande associee au pdf introuvable')) {
        throw error;
      }
      restartedJob = await startFinalPdfExportJob('');
    }

    setPdfExportJob((previous) => ({
      ...previous,
      ...restartedJob,
      status: restartedJob?.status || previous?.status || 'queued'
    }));

    const readyJob = await pollFinalPdfExportJobUntilReady(restartedJob.jobId);
    await loadBookOrderAccess();

    showPageNotice('PDF regenere. Le telechargement demarre.', 'success');
    return readyJob.jobId;
  };

  const openPdfPreviewModal = async (kind = 'final', jobOverride = null) => {
    const accessSnapshot = await loadBookOrderAccess();
    const canAccessPdf = accessSnapshot?.paidAccess ?? hasPaidOrderAccess;
    const currentPdfOrder = accessSnapshot?.latestPdfOrder || latestPdfOrder;
    const currentPdfOrderStatus = String(currentPdfOrder?.status || '').toLowerCase();

    if (!canAccessPdf) {
      showPageNotice('Le PDF fidele est disponible apres paiement. Utilisez l apercu protege en attendant.', 'info');
      return;
    }

    const targetJob = jobOverride || pdfExportJob;
    if (
      currentPdfOrderStatus === 'pdf_generating'
      && targetJob?.status !== 'ready'
    ) {
      showPageNotice('Paiement valide. Le PDF final est en cours de generation et sera disponible sous peu.', 'info');
      return;
    }

    setLoadingPdfPreview(true);

    try {
      let jobIdToUse = String(targetJob?.jobId || '').trim();
      if (!jobIdToUse) {
        jobIdToUse = await recoverMissingPdfJob(currentPdfOrder);
      }

      let blobResult;
      try {
        blobResult = await fetchPdfFileBlob({ kind, jobId: jobIdToUse });
      } catch (error) {
        if (!isMissingPdfJobError(error)) {
          throw error;
        }
        const recoveredJobId = await recoverMissingPdfJob(currentPdfOrder);
        blobResult = await fetchPdfFileBlob({ kind, jobId: recoveredJobId });
      }

      const { blob } = blobResult;
      const objectUrl = window.URL.createObjectURL(blob);

      setPdfPreviewModal((previous) => {
        if (previous.url && typeof window !== 'undefined') {
          window.URL.revokeObjectURL(previous.url);
        }

        return {
          open: true,
          kind,
          url: objectUrl
        };
      });
      setIsPdfPreviewControlsCollapsed(true);
    } catch (error) {
      showPageNotice(error.message || 'Impossible de charger l apercu PDF.', 'error');
    } finally {
      setLoadingPdfPreview(false);
    }
  };

  const regeneratePdfPreviewWithCurrentSettings = async () => {
    const accessSnapshot = await loadBookOrderAccess();
    const canAccessPdf = accessSnapshot?.paidAccess ?? hasPaidOrderAccess;
    const currentPdfOrder = accessSnapshot?.latestPdfOrder || latestPdfOrder;

    if (!canAccessPdf) {
      showPageNotice('Le PDF fidele est disponible apres paiement.', 'info');
      return;
    }

    setRegeneratingPdfPreview(true);
    setLoadingPdfPreview(true);

    try {
      const restartedJob = await startFinalPdfExportJob(currentPdfOrder?.id || '', { forceRegenerate: true });
      setPdfExportJob((previous) => ({
        ...previous,
        ...restartedJob,
        status: restartedJob?.status || previous?.status || 'queued'
      }));

      const readyJob = await pollFinalPdfExportJobUntilReady(restartedJob.jobId);
      const blobResult = await fetchPdfFileBlob({
        kind: pdfPreviewModal.kind || 'final',
        jobId: readyJob.jobId
      });
      await loadBookOrderAccess();

      const objectUrl = window.URL.createObjectURL(blobResult.blob);
      setPdfPreviewModal((previous) => {
        if (previous.url && typeof window !== 'undefined') {
          window.URL.revokeObjectURL(previous.url);
        }

        return {
          open: true,
          kind: previous.kind || 'final',
          url: objectUrl
        };
      });

      showPageNotice('Apercu imprimeur regenere avec les reglages actuels.', 'success');
    } catch (error) {
      showPageNotice(error.message || 'Impossible de regenerer l apercu imprimeur.', 'error');
    } finally {
      setRegeneratingPdfPreview(false);
      setLoadingPdfPreview(false);
    }
  };

  const decorateChapter = (chapter) => {
    const contributions = Array.isArray(chapter?.contributions) ? chapter.contributions : [];
    const chapterInvites = Array.isArray(chapter?.chapter_invites) ? chapter.chapter_invites : [];
    const respondedInvitesCount = chapterInvites.filter(
      (invite) => invite?.accepted || invite?.contributed
    ).length;
    const stateContribution = contributions
      .filter((contribution) => contribution?.contributor_email === CHAPTER_STATE_EMAIL)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0] || null;
    const draftContribution = contributions
      .filter((contribution) => contribution?.contributor_email === CHAPTER_DRAFT_EMAIL)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0] || null;
    const workflowState = stateContribution?.message || null;
    const chapterDraft = parseChapterDraftState(draftContribution?.message);
    const visibleContributions = contributions.filter(
      (contribution) =>
        contribution.contributor_email !== user?.email &&
        contribution.contributor_email !== CHAPTER_STATE_EMAIL &&
        contribution.contributor_email !== CHAPTER_DRAFT_EMAIL &&
        contribution.is_finalized !== false
    );
    const matchingContributions = contributions
      .filter((contribution) => contribution.contributor_email === user?.email)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const currentUserContribution = chapter?.currentUserContribution || matchingContributions[0] || null;

    return {
      ...chapter,
      workflowState,
      chapterDraft,
      contributionsClosed: workflowState === 'contributions_closed' || workflowState === 'closed',
      isChapterClosed: workflowState === 'closed',
      currentUserContribution,
      hasContributed: Boolean(currentUserContribution),
      isFinalized: Boolean(currentUserContribution?.is_finalized),
      contributionsCount: Math.max(visibleContributions.length, respondedInvitesCount),
      invitationsCount: Array.isArray(chapter?.chapter_invites)
        ? chapterInvites.length
        : chapter?.invitationsCount || 0
    };
  };

  const normalizeChaptersForState = (chapterList) => (
    [...(chapterList || [])]
      .sort((a, b) => (a?.order_index || 0) - (b?.order_index || 0))
      .map((chapter, index) => decorateChapter({
        ...chapter,
        order_index: index,
        title: getSafeChapterTitle(chapter?.title, index)
      }))
  );

  const updateChapterInState = (chapterId, updater) => {
    setChapters((prevChapters) =>
      normalizeChaptersForState(prevChapters.map((chapter) => {
        if (chapter.id !== chapterId) {
          return chapter;
        }

        return typeof updater === 'function'
          ? updater(chapter)
          : { ...chapter, ...updater };
      }))
    );
  };

  const mergeContributionIntoChapterState = (chapterId, contribution) => {
    if (!contribution?.id) {
      return;
    }

    updateChapterInState(chapterId, (chapter) => {
      const contributions = Array.isArray(chapter?.contributions) ? [...chapter.contributions] : [];
      const existingIndex = contributions.findIndex((item) => item.id === contribution.id);

      if (existingIndex >= 0) {
        contributions[existingIndex] = contribution;
      } else {
        contributions.push(contribution);
      }

      return {
        ...chapter,
        contributions
      };
    });
  };

  const persistChapterWorkflowState = async (chapterId, nextState) => {
    const currentChapter = chapters.find((chapter) => chapter.id === chapterId);
    const existingStateContribution = Array.isArray(currentChapter?.contributions)
      ? currentChapter.contributions.find(
          (contribution) => contribution?.contributor_email === CHAPTER_STATE_EMAIL
        )
      : null;
    let savedStateContribution = null;

    if (existingStateContribution?.id) {
      const { data, error } = await supabase
        .from('contributions')
        .update({
          contributor_name: '__chapter_state__',
          message: nextState,
          photo_urls: [],
          approved: true,
          is_finalized: true,
          needs_revision: false,
          moderation_feedback: null
        })
        .eq('id', existingStateContribution.id)
        .select()
        .single();

      if (error) throw error;
      savedStateContribution = data;
    } else {
      const { data, error } = await supabase
        .from('contributions')
        .insert([{
          chapter_id: chapterId,
          contributor_name: '__chapter_state__',
          contributor_email: CHAPTER_STATE_EMAIL,
          message: nextState,
          photo_urls: [],
          approved: true,
          is_finalized: true,
          needs_revision: false
        }])
        .select()
        .single();

      if (error) throw error;
      savedStateContribution = data;
    }

    updateChapterInState(chapterId, (chapter) => {
      const contributions = Array.isArray(chapter?.contributions) ? [...chapter.contributions] : [];
      const existingIndex = contributions.findIndex(
        (contribution) => contribution.id === savedStateContribution.id
      );

      if (existingIndex >= 0) {
        contributions[existingIndex] = savedStateContribution;
      } else {
        contributions.push(savedStateContribution);
      }

      return {
        ...chapter,
        contributions
      };
    });

    return savedStateContribution;
  };

  const loadBookAndChapters = async ({ silent = false } = {}) => {
    try {
      if (!silent) {
        setLoading(true);
      }
      
      const { data: bookData, error: bookError } = await supabase
        .from('books')
        .select('*')
        .eq('id', bookId)
        .single();

      if (bookError) throw bookError;
      setBook(bookData);

      // Charger les chapitres avec toutes leurs contributions
      const { data: chaptersData, error: chaptersError } = await supabase
        .from('chapters')
        .select(`
          *,
          contributions:contributions(*),
          chapter_invites:chapter_invites(*)
        `)
        .eq('book_id', bookId)
        .order('order_index', { ascending: true });

      if (chaptersError) throw chaptersError;

      setChapters(normalizeChaptersForState(chaptersData || []));

    } catch (error) {
      console.error('❌ Erreur chargement:', error);
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  };

  const generateChapterAmorce = async (chapterId, { force = false } = {}) => {
    const token = await getAuthAccessToken();
    const response = await fetch(`${getApiBaseUrl()}/chapters/${chapterId}/generate-amorce`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ force })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.error || 'Erreur lors de la generation de l amorce.');
    }
    return payload?.chapter || null;
  };

  const handleUpdateChapter = async (chapterId, updates) => {
    try {
      const currentChapter = chapters.find((chapter) => chapter.id === chapterId);
      if (currentChapter?.isChapterClosed) {
        throw new Error('Ce chapitre est verrouille apres validation finale.');
      }

      const { status, ...chapterUpdates } = updates || {};
      const currentChapterIndex = chapters.findIndex((chapter) => chapter.id === chapterId);
      const safeChapterUpdates = { ...chapterUpdates };

      if (
        currentChapterIndex === 0 &&
        Object.prototype.hasOwnProperty.call(safeChapterUpdates, 'title')
      ) {
        safeChapterUpdates.title = 'Introduction';
      }

      if (status === 'contributions_closed' || status === 'closed') {
        await persistChapterWorkflowState(chapterId, status);

        if (Object.keys(safeChapterUpdates).length === 0) {
          return { workflowState: status };
        }
      }

      if (Object.keys(safeChapterUpdates).length === 0) {
        return null;
      }

      const { data, error } = await supabase
        .from('chapters')
        .update(safeChapterUpdates)
        .eq('id', chapterId)
        .select()
        .single();

      if (error) throw error;
      updateChapterInState(chapterId, (chapter) => ({ ...chapter, ...data }));

      const titleChanged = Object.prototype.hasOwnProperty.call(safeChapterUpdates, 'title')
        && normalizeText(safeChapterUpdates.title) !== normalizeText(currentChapter?.title);
      const canAutoRefreshAmorce = titleChanged
        && !currentChapter?.amorce_validated
        && (!currentChapter?.amorce_text || Boolean(currentChapter?.amorce_generated_at));

      if (canAutoRefreshAmorce) {
        try {
          const regeneratedChapter = await generateChapterAmorce(chapterId);
          if (regeneratedChapter) {
            updateChapterInState(chapterId, (chapter) => ({ ...chapter, ...regeneratedChapter }));
            return regeneratedChapter;
          }
        } catch (amorceError) {
          showPageNotice(amorceError.message || 'Le titre a ete modifie, mais l amorce n a pas pu etre regeneree.', 'info');
        }
      }

      return data;
    } catch (error) {
      console.error('❌ Erreur mise à jour:', error);
      showPageNotice('Erreur lors de la mise à jour du chapitre.', 'error');
      throw error;
    }
  };

  const handleSaveContribution = async (chapterId, contributionData) => {
    try {
      const currentChapter = chapters.find((chapter) => chapter.id === chapterId);
      if (currentChapter?.isChapterClosed) {
        throw new Error('Ce chapitre est verrouille apres validation finale.');
      }

      const existingContribution = currentChapter?.currentUserContribution;
      let savedContribution = null;

      if (existingContribution?.id) {
        const { data, error } = await supabase
          .from('contributions')
          .update({
            message: contributionData.message,
            photo_urls: contributionData.photo_urls,
            is_finalized: false
          })
          .eq('id', existingContribution.id)
          .select()
          .single();

        if (error) throw error;
        savedContribution = data;
      } else {
        const { data, error } = await supabase
          .from('contributions')
          .insert([{
            chapter_id: chapterId,
            ...contributionData
          }])
          .select()
          .single();

        if (error) throw error;
        savedContribution = data;
      }

      updateChapterInState(chapterId, (chapter) => {
        const contributions = Array.isArray(chapter.contributions) ? [...chapter.contributions] : [];
        const existingIndex = contributions.findIndex((contribution) => contribution.id === savedContribution.id);

        if (existingIndex >= 0) {
          contributions[existingIndex] = savedContribution;
        } else {
          contributions.push(savedContribution);
        }

        return {
          ...chapter,
          contributions,
          currentUserContribution: savedContribution,
          hasContributed: true,
          isFinalized: Boolean(savedContribution?.is_finalized)
        };
      });

      return savedContribution;
    } catch (error) {
      console.error('❌ Erreur sauvegarde contribution:', error);
      throw error;
    }
  };

  const handleFinalizeContribution = async (chapterId) => {
    try {
      const currentChapter = chapters.find((chapter) => chapter.id === chapterId);
      if (currentChapter?.isChapterClosed) {
        throw new Error('Ce chapitre est verrouille apres validation finale.');
      }

      const existingContribution = currentChapter?.currentUserContribution;

      if (!existingContribution?.id) {
        throw new Error('Contribution introuvable');
      }

      const { data, error } = await supabase
        .from('contributions')
        .update({ is_finalized: true })
        .eq('id', existingContribution.id)
        .select()
        .single();

      if (error) throw error;

      updateChapterInState(chapterId, (chapter) => {
        const contributions = Array.isArray(chapter.contributions) ? [...chapter.contributions] : [];
        const existingIndex = contributions.findIndex((contribution) => contribution.id === data.id);

        if (existingIndex >= 0) {
          contributions[existingIndex] = data;
        }

        return {
          ...chapter,
          contributions,
          currentUserContribution: data,
          hasContributed: true,
          isFinalized: true
        };
      });

      return data;
    } catch (error) {
      console.error('❌ Erreur finalisation contribution:', error);
      throw error;
    }
  };

  const handleGenerateChapterDraft = async (chapterId, options = {}) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      if (!token) {
        throw new Error('Session introuvable');
      }

      const response = await fetch(`${getApiBaseUrl()}/books/${bookId}/chapters/${chapterId}/generate-draft`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(options || {})
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erreur lors de la generation du chapitre');
      }

      if (data?.draftContribution) {
        mergeContributionIntoChapterState(chapterId, data.draftContribution);
      }
      return data;
    } catch (error) {
      console.error('Erreur generation chapitre:', error);
      throw error;
    }
  };

  const handleSaveChapterDraft = async (chapterId, html) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      if (!token) {
        throw new Error('Session introuvable');
      }

      const response = await fetch(`${getApiBaseUrl()}/books/${bookId}/chapters/${chapterId}/save-draft`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ html })
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erreur lors de la sauvegarde du chapitre');
      }

      mergeContributionIntoChapterState(chapterId, data.draftContribution);
      return data;
    } catch (error) {
      console.error('Erreur sauvegarde chapitre:', error);
      throw error;
    }
  };

  const handleFinalizeChapterDraft = async (chapterId, html) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      if (!token) {
        throw new Error('Session introuvable');
      }

      const response = await fetch(`${getApiBaseUrl()}/books/${bookId}/chapters/${chapterId}/finalize-draft`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ html })
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erreur lors de la validation finale');
      }

      mergeContributionIntoChapterState(chapterId, data.draftContribution);
      mergeContributionIntoChapterState(chapterId, data.workflowContribution);
      return data;
    } catch (error) {
      console.error('Erreur validation finale chapitre:', error);
      throw error;
    }
  };

  const handleDeleteChapter = async (chapterId) => {
    try {
      if (chapters.length <= 4) {
        showPageNotice('Le livre doit conserver au moins 4 chapitres.', 'info');
        return;
      }

      const { error } = await supabase
        .from('chapters')
        .delete()
        .eq('id', chapterId);

      if (error) throw error;

      const remainingChapters = chapters.filter((chapter) => chapter.id !== chapterId);
      const reorderUpdates = remainingChapters
        .map((chapter, index) => ({
          id: chapter.id,
          updates: {
            order_index: index,
            ...(index === 0 ? { title: 'Introduction' } : {})
          },
          shouldUpdate:
            chapter.order_index !== index ||
            (index === 0 && chapter.title !== 'Introduction')
        }))
        .filter((chapter) => chapter.shouldUpdate);

      if (reorderUpdates.length > 0) {
        await Promise.all(
          reorderUpdates.map(({ id, updates }) =>
            supabase
              .from('chapters')
              .update(updates)
              .eq('id', id)
          )
        );
      }

      setChapters(normalizeChaptersForState(remainingChapters));
      const syncedPages = Math.max(32, remainingChapters.length * 8);
      if (Number(book?.pages || 0) !== syncedPages) {
        await handleUpdateBook({ pages: syncedPages });
      }
      showPageNotice('Chapitre supprimé.', 'success');
    } catch (error) {
      console.error('❌ Erreur suppression:', error);
      showPageNotice('Erreur lors de la suppression du chapitre.', 'error');
    }
  };

  const handleUpdateBook = async (updates) => {
    try {
      const { error } = await supabase
        .from('books')
        .update(updates)
        .eq('id', bookId);

      if (error) throw error;
      setBook(prev => ({ ...prev, ...updates }));
      return true;
    } catch (error) {
      console.error('❌ Erreur mise à jour livre:', error);
      throw error;
    }
  };

  const setBookLifecycleStatus = async (
    nextStatus,
    { silent = false, onlyForward = false } = {}
  ) => {
    const normalizedStatus = normalizeBookLifecycleStatus(nextStatus);
    if (!normalizedStatus || !book) {
      return false;
    }

    const currentStatus = getBookLifecycleStatusFromBook(book);
    if (currentStatus === normalizedStatus) {
      return true;
    }

    if (onlyForward && !isBookLifecycleAtLeast(normalizedStatus, currentStatus)) {
      return false;
    }

    const currentCoverConfig = (book?.cover_config && typeof book.cover_config === 'object')
      ? book.cover_config
      : {};
    const nowIso = new Date().toISOString();
    const nextCoverConfig = {
      ...currentCoverConfig,
      lifecycleStatus: normalizedStatus,
      lifecycleUpdatedAt: nowIso
    };

    if (normalizedStatus === 'preview_available' && !nextCoverConfig.previewAvailableAt) {
      nextCoverConfig.previewAvailableAt = nowIso;
    }
    if (normalizedStatus === 'finalized' && !nextCoverConfig.finalPdfReadyAt) {
      nextCoverConfig.finalPdfReadyAt = nowIso;
    }
    if (normalizedStatus === 'finalized' && !nextCoverConfig.finalValidatedAt) {
      nextCoverConfig.finalValidatedAt = nowIso;
    }
    if (normalizedStatus === 'sent_to_printer' && !nextCoverConfig.sentToPrinterAt) {
      nextCoverConfig.sentToPrinterAt = nowIso;
    }
    if (normalizedStatus === 'printed' && !nextCoverConfig.printedAt) {
      nextCoverConfig.printedAt = nowIso;
    }
    if (normalizedStatus === 'shipped' && !nextCoverConfig.shippedAt) {
      nextCoverConfig.shippedAt = nowIso;
    }

    setUpdatingLifecycleStatus(normalizedStatus);
    try {
      await handleUpdateBook({
        cover_config: nextCoverConfig
      });

      if (!silent) {
        showPageNotice(
          `Etat du livre: ${getBookLifecycleConfig(normalizedStatus).label}.`,
          'success'
        );
      }
      return true;
    } catch (error) {
      if (!silent) {
        showPageNotice('Impossible de mettre a jour l etat du livre.', 'error');
      }
      return false;
    } finally {
      setUpdatingLifecycleStatus('');
    }
  };

  const getAutomaticLifecycleStatus = () => {
    if (!book) {
      return 'editing';
    }

    const persistedStatus = getBookLifecycleStatusFromBook(book);
    if (isBookLifecycleAtLeast(persistedStatus, 'finalized')) {
      return persistedStatus;
    }

    if (persistedStatus === 'preview_available') {
      return 'preview_available';
    }

    return 'editing';
  };

  useEffect(() => {
    if (!book || updatingLifecycleStatus) {
      return;
    }

    const currentStatus = getBookLifecycleStatusFromBook(book);
    const automaticStatus = getAutomaticLifecycleStatus();
    if (currentStatus !== automaticStatus) {
      setBookLifecycleStatus(automaticStatus, { silent: true, onlyForward: true });
    }
  }, [
    book?.id,
    book?.statut,
    book?.cover_config?.lifecycleStatus,
    updatingLifecycleStatus
  ]);

  const handleGenerateDraft = async () => {
    try {
      if (!isBookReadyForPreview) {
        throw new Error('Validez tous les chapitres, la couverture et la 4e avant l apercu global');
      }

      setGeneratingDraft(true);

      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      if (!token) {
        throw new Error('Session introuvable');
      }

      const response = await fetch(`${getApiBaseUrl()}/books/${bookId}/generate-draft`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          previewFormat: selectedPreviewFormat,
          previewLayoutSettings: {
            textDensity: draftLayoutSettings.textDensity,
            imageDensity: draftLayoutSettings.imageDensity,
            lineSpacing: draftLayoutSettings.lineSpacing,
            fontScale: draftLayoutSettings.fontScale
          }
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erreur lors de l apercu du livre');
      }

      setDraftPreview({
        ...data,
        previewFormat: selectedPreviewFormat,
        previewLayoutSettings: data?.previewLayoutSettings || {
          textDensity: draftLayoutSettings.textDensity,
          imageDensity: draftLayoutSettings.imageDensity
        }
      });
      setDraftSpreadIndex(0);
      dismissPageNotice();
      await setBookLifecycleStatus('preview_available', { silent: true, onlyForward: true });
    } catch (error) {
      console.error('Erreur apercu livre:', error);
      showPageNotice(error.message || 'Erreur lors de l apercu du livre', 'error');
    } finally {
      setGeneratingDraft(false);
    }
  };

  const handleFinalizeBook = async () => {
    try {
      if (!isBookReadyForPreview) {
        throw new Error('Le livre doit etre complet (chapitres + couverture + 4e) avant validation finale.');
      }

      const lifecycleStatus = getAutomaticLifecycleStatus();
      if (!isBookLifecycleAtLeast(lifecycleStatus, 'preview_available')) {
        throw new Error('Generez d abord un apercu avant la validation finale.');
      }

      if (typeof window !== 'undefined') {
        const confirmed = window.confirm(
          'Validation definitive du livre ?\n\nCette action verrouille le contenu (chapitres, couverture et 4e de couverture).\nVous pourrez commander ensuite, mais plus modifier le livre.'
        );
        if (!confirmed) {
          return;
        }
      }

      const updated = await setBookLifecycleStatus('finalized', { onlyForward: true });
      if (!updated) {
        throw new Error('Impossible de valider le livre pour le moment.');
      }

      showPageNotice('Livre valide definitivement. Vous pouvez maintenant commander.', 'success');
    } catch (error) {
      showPageNotice(error.message || 'Erreur lors de la validation finale du livre.', 'error');
    }
  };

  const handleDownloadPdfFile = async (kind) => {
    const accessSnapshot = await loadBookOrderAccess();
    const canAccessPdf = accessSnapshot?.paidAccess ?? hasPaidOrderAccess;
    const currentPdfOrder = accessSnapshot?.latestPdfOrder || latestPdfOrder;
    const currentPdfOrderStatus = String(currentPdfOrder?.status || '').toLowerCase();
    let jobIdToUse = String(pdfExportJob?.jobId || '').trim();

    if (!canAccessPdf) {
      showPageNotice('Telechargement bloque avant paiement.', 'error');
      return;
    }

    if (currentPdfOrderStatus === 'pdf_generating' && pdfExportJob?.status !== 'ready' && !jobIdToUse) {
      showPageNotice('Paiement valide. Le PDF final est en cours de generation.', 'info');
      return;
    }

    try {
      setDownloadingPdfKind(kind);
      if (!jobIdToUse) {
        jobIdToUse = await recoverMissingPdfJob(currentPdfOrder);
      }

      let downloadResult;
      try {
        downloadResult = await fetchPdfFileBlob({
          kind,
          jobId: jobIdToUse
        });
      } catch (error) {
        if (!isMissingPdfJobError(error)) {
          throw error;
        }
        const recoveredJobId = await recoverMissingPdfJob(currentPdfOrder);
        downloadResult = await fetchPdfFileBlob({
          kind,
          jobId: recoveredJobId
        });
      }

      const { blob, fileName } = downloadResult;

      const objectUrl = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      window.URL.revokeObjectURL(objectUrl);
    } catch (error) {
      showPageNotice(error.message || 'Erreur lors du telechargement du PDF.', 'error');
    } finally {
      setDownloadingPdfKind('');
    }
  };

  useEffect(() => {
    if (!bookId || !user || !pdfExportJob?.jobId) {
      return undefined;
    }
    if (pdfExportJob.status === 'ready' || pdfExportJob.status === 'failed') {
      return undefined;
    }

    let active = true;
    let timer = null;

    const refreshPdfJobStatus = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token || !active) {
          return;
        }

        const response = await fetch(
          `${getApiBaseUrl()}/books/${bookId}/export-final-pdf/${pdfExportJob.jobId}/status`,
          {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${token}`
            }
          }
        );
        const payload = await response.json().catch(() => ({}));

        if (!active) {
          return;
        }

        if (response.ok && payload?.jobId) {
          setPdfExportJob((previous) => ({
            ...previous,
            ...payload
          }));
          if (payload.status === 'ready' || payload.status === 'failed') {
            await loadBookOrderAccess();
            return;
          }
        }
      } catch (_error) {
        // silent background refresh
      }

      if (active) {
        timer = setTimeout(refreshPdfJobStatus, 3500);
      }
    };

    timer = setTimeout(refreshPdfJobStatus, 1800);

    return () => {
      active = false;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [bookId, user, pdfExportJob?.jobId, pdfExportJob?.status]);

  const handleUpdateChaptersFromPages = async (newPages) => {
    try {
      const minPages = 32;
      const maxPages = MAX_CHAPTERS * 8;
      const pagesToPersist = Math.max(minPages, Math.min(newPages, maxPages));
      const newChaptersCount = Math.max(4, Math.min(MAX_CHAPTERS, Math.floor(pagesToPersist / 8)));
      const currentChaptersCount = chapters.length;

      if (newPages > maxPages) {
        showPageNotice(`Le livre est limité à ${MAX_CHAPTERS} chapitres maximum.`, 'info');
      }

      if (newPages < minPages) {
        showPageNotice('Le livre conserve un minimum de 4 chapitres.', 'info');
      }

      if (newChaptersCount > currentChaptersCount) {
        const chaptersToAdd = newChaptersCount - currentChaptersCount;
        
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;

        const response = await fetch(`${getApiBaseUrl()}/ai/generate-chapters`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            bookId,
            eventType: book.event_type,
            style: book.style_narratif,
            count: chaptersToAdd,
            bookTitle: book.title,
            recipientName: book.recipient_name,
            recipientAge: book.recipient_age,
            recipientGender: book.recipient_gender,
            recipientNickname: '',
            recipientTrait: '',
            recipientAnecdote: '',
            additionalContext: book?.cover_config?.aiProjectBrief || ''
          })
        });

        const data = await response.json();
        
        if (response.ok) {
          const newChapters = data.chapters.map((ch, index) => ({
            book_id: bookId,
            title: getSafeChapterTitle(ch.title, currentChaptersCount + index),
            description: ch.description || `Chapitre ${currentChaptersCount + index + 1}`,
            order_index: currentChaptersCount + index,
            amorce_text: null,
            triggers: [],
            amorce_generated_at: null,
            amorce_validated: false,
            questions_ia: []
          }));

          const { data: insertedChapters, error: insertError } = await supabase
            .from('chapters')
            .insert(newChapters)
            .select('*');

          if (insertError) throw insertError;

          if (Array.isArray(insertedChapters) && insertedChapters.length > 0) {
            for (const insertedChapter of insertedChapters) {
              try {
                // eslint-disable-next-line no-await-in-loop
                await generateChapterAmorce(insertedChapter.id);
              } catch (_error) {
                // Keep chapter creation resilient even if the amorce prompt is unavailable.
              }
            }
          }
        }
      } else if (newChaptersCount < currentChaptersCount) {
        const chaptersToRemove = currentChaptersCount - newChaptersCount;
        const chaptersToDelete = chapters.slice(-chaptersToRemove).map(ch => ch.id);

        const { error: deleteError } = await supabase
          .from('chapters')
          .delete()
          .in('id', chaptersToDelete);

        if (deleteError) throw deleteError;
      }
      
      await loadBookAndChapters();
      await handleUpdateBook({ pages: pagesToPersist });
      
    } catch (error) {
      console.error('❌ Erreur mise à jour chapitres:', error);
      showPageNotice('Erreur lors de la mise à jour des chapitres.', 'error');
    }
  };

  const draftPreviewPages = useMemo(
    () => buildDraftPreviewPages(draftPreview?.html || ''),
    [draftPreview?.html]
  );
  const draftSpreadCount = Math.max(1, Math.ceil(draftPreviewPages.length / 2));
  const currentDraftSpreadIndex = Math.min(
    draftSpreadIndex,
    Math.max(0, draftSpreadCount - 1)
  );
  const leftDraftPageHtml = draftPreviewPages[currentDraftSpreadIndex * 2] || '';
  const rightDraftPageHtml = draftPreviewPages[currentDraftSpreadIndex * 2 + 1] || '';
  const canGoToPreviousSpread = currentDraftSpreadIndex > 0;
  const canGoToNextSpread = currentDraftSpreadIndex < draftSpreadCount - 1;
  const isHorizontalDraftMode = draftReadingMode === 'horizontal';
  const draftPreviewHasImages = useMemo(
    () => draftPreviewPages.some((pageHtml) => /<img[\s>]/i.test(String(pageHtml || ''))),
    [draftPreviewPages]
  );
  const lineSpacingFactor = (
    PREVIEW_LINE_SPACING_OPTIONS.find((option) => option.id === draftLayoutSettings.lineSpacing)?.factor
    || 1
  );
  const draftPreviewInlineStyle = useMemo(
    () => ({
      '--draft-font-scale': String(draftLayoutSettings.fontScale || 1),
      '--draft-line-height-factor': String(lineSpacingFactor)
    }),
    [draftLayoutSettings.fontScale, lineSpacingFactor]
  );

  const shiftDraftSpread = (direction) => {
    setDraftSpreadIndex((previous) => {
      const max = Math.max(0, draftSpreadCount - 1);
      const next = previous + direction;
      return Math.min(max, Math.max(0, next));
    });
  };

  useEffect(() => {
    setDraftSpreadIndex((previous) => {
      const max = Math.max(0, draftSpreadCount - 1);
      return Math.min(previous, max);
    });
  }, [draftSpreadCount]);

  useEffect(() => {
    if (typeof window === 'undefined' || !draftPreview) {
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setDraftPreview(null);
        return;
      }

      if (!isHorizontalDraftMode) {
        return;
      }

      if (event.key === 'ArrowLeft' && canGoToPreviousSpread) {
        event.preventDefault();
        setDraftSpreadIndex((previous) => Math.max(0, previous - 1));
      }
      if (event.key === 'ArrowRight' && canGoToNextSpread) {
        event.preventDefault();
        setDraftSpreadIndex((previous) => Math.min(draftSpreadCount - 1, previous + 1));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    draftPreview,
    isHorizontalDraftMode,
    canGoToPreviousSpread,
    canGoToNextSpread,
    draftSpreadCount
  ]);

  if (loading) return <Loading message="Chargement du livre..." />;
  if (!book) return <div>Livre non trouvé</div>;

  const isSoloMode = getSoloMode(book);
  const visibleGuideSteps = isSoloMode
    ? WRITING_GUIDE_STEPS.filter((step) => step.title !== 'Invitations')
    : WRITING_GUIDE_STEPS;
  const bookLifecycleStatus = getAutomaticLifecycleStatus();
  const hasPreviewBeenGenerated = isBookLifecycleAtLeast(bookLifecycleStatus, 'preview_available');
  const canGenerateBookPreview = isBookReadyForPreview;
  const previewUnavailableReason = canGenerateBookPreview
    ? ''
    : 'Validez chapitres + couverture + 4e avant l apercu';
  const canFinalizeBook = (
    hasPreviewBeenGenerated
    && !isBookLifecycleAtLeast(bookLifecycleStatus, 'finalized')
    && isBookReadyForPreview
  );
  const selectedPreviewFormatMeta = BOOK_PREVIEW_FORMATS.find(
    (format) => format.id === selectedPreviewFormat
  ) || BOOK_PREVIEW_FORMATS.find((format) => format.id === 'standard') || BOOK_PREVIEW_FORMATS[0];
  const selectedTextDensityMeta = PREVIEW_TEXT_DENSITY_OPTIONS.find(
    (option) => option.id === draftLayoutSettings.textDensity
  ) || PREVIEW_TEXT_DENSITY_OPTIONS[1];
  const selectedImageDensityMeta = PREVIEW_IMAGE_DENSITY_OPTIONS.find(
    (option) => option.id === draftLayoutSettings.imageDensity
  ) || PREVIEW_IMAGE_DENSITY_OPTIONS[1];
  const selectedLineSpacingMeta = PREVIEW_LINE_SPACING_OPTIONS.find(
    (option) => option.id === draftLayoutSettings.lineSpacing
  ) || PREVIEW_LINE_SPACING_OPTIONS[1];
  const pdfExportStatusLabel = (() => {
    switch (pdfExportJob?.status) {
      case 'queued':
        return 'File en attente';
      case 'rendering':
        return 'Generation en cours';
      case 'ready':
        return 'Pret au telechargement';
      case 'failed':
        return 'Generation en erreur';
      default:
        return 'Non lance';
    }
  })();
  const isPdfReady = pdfExportJob?.status === 'ready';
  function scrollToMainContent() {
    if (typeof window === 'undefined' || !mainContentRef.current) {
      return;
    }

    const top = mainContentRef.current.getBoundingClientRect().top + window.scrollY - 96;
    window.scrollTo({
      top: Math.max(top, 0),
      behavior: 'smooth'
    });
  }
  const forceOpenEditionGalleryDom = () => {
    if (typeof document === 'undefined') {
      return;
    }

    const chapterTab = document.querySelector('button.tab[data-tab="chapitres"]');
    if (chapterTab instanceof HTMLButtonElement) {
      chapterTab.click();
    }

    const backToStructureButton = document.querySelector('button.sidebar-gallery-btn');
    if (backToStructureButton instanceof HTMLButtonElement) {
      backToStructureButton.click();
    }

    const galleryLayoutButton = document.querySelector('button.edition-layout-btn[data-layout="gallery"]');
    if (galleryLayoutButton instanceof HTMLButtonElement) {
      galleryLayoutButton.click();
    }
  };
  const openEditionGallery = () => {
    setActiveTab('chapitres');
    setEditionGalleryRequest((previous) => previous + 1);

    const nextParams = new URLSearchParams(location.search || '');
    nextParams.set('tab', 'chapitres');
    nextParams.set('view', 'gallery');
    nextParams.set('reset', String(Date.now()));
    navigate({
      pathname: `/book/${bookId}`,
      search: `?${nextParams.toString()}`
    });

    if (typeof window !== 'undefined') {
      window.requestAnimationFrame(forceOpenEditionGalleryDom);
      window.setTimeout(forceOpenEditionGalleryDom, 0);
      window.setTimeout(scrollToMainContent, 120);
    }
  };
  const displayBookTitle = getDisplayBookTitle(book?.title || '');
  const useFocusedWorkspaceTopbar = (
    (activeTab === 'chapitres' && isChapterWorkspaceActive)
    || activeTab === 'contributeurs'
    || activeTab === 'config'
  );

  return (
    <div className="book-container">
      {!useFocusedWorkspaceTopbar && (
        <div className="tabs-container book-tabs-legacy">
          <div className="tabs-toolbar">
            <div className="tabs">
              <button
                data-tab="chapitres"
                onClick={() => setActiveTab('chapitres')}
                className={`tab ${activeTab === 'chapitres' ? 'active' : ''}`}
                title={TAB_HELP.chapitres}
                aria-label={`Edition du livre. ${TAB_HELP.chapitres}`}
              >
                Edition du livre
                <span className="tab-icon-luxe tab-icon-book" aria-hidden="true" />
                <span className="tab-help" aria-hidden="true">?</span>
              </button>
              <button
                data-tab="contributeurs"
                onClick={() => setActiveTab('contributeurs')}
                className={`tab ${activeTab === 'contributeurs' ? 'active' : ''}`}
                title={TAB_HELP.contributeurs}
                aria-label={`Contributeurs. ${TAB_HELP.contributeurs}`}
              >
                Contributeurs
                <span className="tab-icon-luxe tab-icon-contributors" aria-hidden="true" />
                <span className="tab-help" aria-hidden="true">?</span>
              </button>
              <button
                data-tab="config"
                onClick={() => setActiveTab('config')}
                className={`tab ${activeTab === 'config' ? 'active' : ''}`}
                title={TAB_HELP.config}
                aria-label={`Configuration. ${TAB_HELP.config}`}
              >
                Configuration
                <span className="tab-icon-luxe tab-icon-config" aria-hidden="true" />
                <span className="tab-help" aria-hidden="true">?</span>
              </button>
            </div>

            <div className="guide-toggle-wrap">
              <button
                type="button"
                className={`guide-toggle-btn ${isGuideOpen ? 'active' : ''}`}
                onClick={() => setIsGuideOpen((prev) => !prev)}
                aria-expanded={isGuideOpen}
                aria-controls="book-writing-guide"
                title="Guide rapide"
              >
                <span className="guide-toggle-question" aria-hidden="true">?</span>
                <span className="guide-toggle-label">Guide rapide</span>
              </button>
            </div>
          </div>

        {isGuideOpen && (
          <div id="book-writing-guide" className="writing-guide-popover is-expanded">
            <div className="writing-guide-top">
              <div>
                <div className="writing-guide-header">Guide rapide</div>
                <div className="writing-guide-subtitle">
                  Parcours recommande pour avancer vite et proprement.
                </div>
              </div>
              <button
                type="button"
                className="writing-guide-close"
                onClick={() => setIsGuideOpen(false)}
                aria-label="Fermer le guide"
              >
                x
              </button>
            </div>

            <div className="writing-guide-list">
              {visibleGuideSteps.map((step, index) => (
                <div key={step.title} className="writing-guide-item">
                  <span className="writing-guide-index">{index + 1}</span>
                  <div className="writing-guide-copy">
                    <span className="writing-guide-label">{step.title}</span>
                    <span className="writing-guide-text">{step.text}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      )}

      <div ref={mainContentRef} className="book-main-content">
        {pageNotice?.message && (
          <div className={`luxe-feedback-banner is-${pageNotice.type || 'info'}`}>
            <span>{pageNotice.message}</span>
            <button
              type="button"
              className="luxe-feedback-close"
              onClick={dismissPageNotice}
              aria-label="Fermer le message"
            >
              x
            </button>
          </div>
        )}

        {pdfExportJob?.jobId && (
          <div ref={pdfPanelRef} className={`book-pdf-panel is-${pdfExportJob.status || 'queued'}`}>
            <div className="book-pdf-head">
              <div className="book-pdf-title">Export PDF final</div>
              <div className="book-pdf-status">{pdfExportStatusLabel}</div>
            </div>
            <div className="book-pdf-meta">Bloc visible apres paiement valide.</div>
            <div className="book-pdf-meta">
              Job: {pdfExportJob.jobId}
              {pdfExportJob.renderer && (
                <span> | Moteur: {pdfExportJob.renderer === 'browser' ? 'rendu navigateur fidele' : 'fallback simplifie'}</span>
              )}
              {pdfExportJob.completedAt && (
                <span> | Termine le {new Date(pdfExportJob.completedAt).toLocaleString('fr-FR')}</span>
              )}
            </div>
            {pdfExportJob.error && (
              <div className="book-pdf-error">{pdfExportJob.error}</div>
            )}
            {isPdfReady && hasPaidOrderAccess && (
              <div className="book-pdf-actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => openPdfPreviewModal('final')}
                  disabled={loadingPdfPreview}
                >
                  {loadingPdfPreview ? 'Chargement...' : 'Voir apercu imprimeur'}
                </button>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => handleDownloadPdfFile('final')}
                  disabled={downloadingPdfKind === 'final'}
                >
                  {downloadingPdfKind === 'final' ? 'Telechargement...' : 'Telecharger PDF final complet'}
                </button>
              </div>
            )}
            {isPdfReady && !hasPaidOrderAccess && (
              <div className="book-pdf-error">
                PDF final verrouille avant paiement.
              </div>
            )}
          </div>
        )}

        {activeTab === 'chapitres' && (
          <div className={`book-edition-live ${isChapterWorkspaceActive ? 'is-workspace-active' : ''}`}>
            {!isChapterWorkspaceActive && (
              <>
                <BookWorkspaceHeader
                  sectionLabel="Edition"
                  bookTitle={displayBookTitle || book?.title || ''}
                  activeTab={activeTab}
                  onOpenTab={setActiveTab}
                />

                {canGenerateBookPreview && (
                  <div className="book-edition-actions">
                    <button
                      type="button"
                      className="chapter-editor-primary-action"
                      onClick={handleGenerateDraft}
                      disabled={generatingDraft || !canGenerateBookPreview}
                      title={canGenerateBookPreview
                        ? 'Afficher l apercu assemble du livre'
                        : 'Validez chapitres + couverture + 4e avant l apercu'}
                    >
                      {generatingDraft ? 'Generation...' : 'Apercu livre'}
                    </button>
                  </div>
                )}

                <div className="book-edition-actions">
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => navigate(`/book/${bookId}/composer`)}
                    title="Mettre en page ce livre a partir de vos photos et textes, sans IA"
                  >
                    Composer sans IA
                  </button>
                </div>
              </>
            )}

            <ChapterListLuxe
              key={`edition-gallery-${editionGalleryRequest}`}
              chapters={chapters}
              bookId={bookId}
              book={book}
              bookTitle={displayBookTitle || book?.title || ''}
              onWorkspaceModeChange={setIsChapterWorkspaceActive}
              onOpenTab={setActiveTab}
              onUpdateChapter={handleUpdateChapter}
              onSaveContribution={handleSaveContribution}
              onFinalizeContribution={handleFinalizeContribution}
              onGenerateChapterDraft={handleGenerateChapterDraft}
              onSaveChapterDraft={handleSaveChapterDraft}
              onFinalizeChapterDraft={handleFinalizeChapterDraft}
              onDeleteChapter={handleDeleteChapter}
              onUpdateBook={handleUpdateBook}
              editionGalleryRequest={editionGalleryRequest}
            />
          </div>
        )}
        
        {activeTab === 'contributeurs' && (
          <ContributorsTabLuxe
            bookId={bookId}
            book={book}
            bookTitle={displayBookTitle || book?.title || ''}
            onOpenTab={setActiveTab}
            onUpdateBook={handleUpdateBook}
          />
        )}
        
        {activeTab === 'config' && (
          <BookConfigLuxe 
              book={book} 
              bookTitle={displayBookTitle || book?.title || ''}
              onOpenTab={setActiveTab}
              onUpdateBook={handleUpdateBook}
            chaptersCount={chapters.length}
            onPagesChange={handleUpdateChaptersFromPages}
            onOpenBookPreview={handleGenerateDraft}
            canOpenBookPreview={canGenerateBookPreview}
            previewUnavailableReason={previewUnavailableReason}
            isGeneratingPreview={generatingDraft}
            onOpenCoverConfig={openEditionGallery}
          />
        )}

      </div>

      {draftPreview && (
        <div className="modal-overlay">
          <div className="modal-content book-draft-modal">
            <div className="book-draft-modal-shell">
            <div className="book-draft-modal-toolbar is-visible is-sidebar">
              <div className="book-draft-modal-header">
                <div className="book-draft-modal-heading">
                  <h3 className="book-draft-modal-title">Apercu du livre</h3>
                  {draftPreview.generatedAt && (
                    <div className="book-draft-modal-meta">
                      Genere le {new Date(draftPreview.generatedAt).toLocaleString('fr-FR')} | Format {selectedPreviewFormatMeta.label}
                    </div>
                  )}
                </div>
                <div className="book-draft-modal-header-actions">
                  <button
                    type="button"
                    className="modal-close"
                    onClick={() => setDraftPreview(null)}
                  >
                    x
                  </button>
                </div>
              </div>

              <div className="book-draft-modal-format">
                <div className="book-draft-modal-format-block">
                  <span className="book-preview-format-label">Formats</span>
                  <div className="book-preview-format-switch is-modal">
                    {BOOK_PREVIEW_FORMATS.map((format) => (
                      <button
                        key={format.id}
                        type="button"
                        className={`book-preview-format-btn ${selectedPreviewFormat === format.id ? 'is-active' : ''}`}
                        onClick={() => handlePreviewFormatChange(format.id)}
                      >
                        <span>{format.label}</span>
                        <small>{format.note}</small>
                      </button>
                    ))}
                  </div>
                  <div className="book-draft-layout-hint">
                    {PREVIEW_FORMAT_IMPACT[selectedPreviewFormatMeta.id] || PREVIEW_FORMAT_IMPACT.standard}
                  </div>
                </div>
                <div className="book-draft-reading-toggle" role="group" aria-label="Mode de lecture">
                  <button
                    type="button"
                    className={`book-draft-reading-btn ${isHorizontalDraftMode ? 'is-active' : ''}`}
                    onClick={() => {
                      setDraftReadingMode('horizontal');
                      setDraftSpreadIndex(0);
                    }}
                  >
                    Feuilletage
                  </button>
                  <button
                    type="button"
                    className={`book-draft-reading-btn ${!isHorizontalDraftMode ? 'is-active' : ''}`}
                    onClick={() => setDraftReadingMode('vertical')}
                  >
                    Vertical
                  </button>
                </div>
              </div>

              <div className="book-draft-layout-controls">
                <div className="book-draft-layout-group">
                  <span className="book-preview-format-label">Texte</span>
                  <div className="book-draft-layout-switch" role="group" aria-label="Densite de texte">
                    {PREVIEW_TEXT_DENSITY_OPTIONS.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        className={`book-draft-layout-btn ${draftLayoutSettings.textDensity === option.id ? 'is-active' : ''}`}
                        onClick={() => {
                          applyDraftLayoutSettings({
                            textDensity: option.id
                          });
                        }}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                  <span className="book-draft-layout-hint">
                    {PREVIEW_TEXT_DENSITY_IMPACT[draftLayoutSettings.textDensity] || PREVIEW_TEXT_DENSITY_IMPACT.balanced}
                  </span>
                </div>

                <div className="book-draft-layout-group">
                  <span className="book-preview-format-label">Images</span>
                  <div className="book-draft-layout-switch" role="group" aria-label="Densite d images">
                    {PREVIEW_IMAGE_DENSITY_OPTIONS.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        className={`book-draft-layout-btn ${draftLayoutSettings.imageDensity === option.id ? 'is-active' : ''}`}
                        onClick={() => {
                          applyDraftLayoutSettings({
                            imageDensity: option.id
                          });
                        }}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                  <span className="book-draft-layout-hint">
                    {PREVIEW_IMAGE_DENSITY_IMPACT[draftLayoutSettings.imageDensity] || PREVIEW_IMAGE_DENSITY_IMPACT.balanced}
                  </span>
                  {!draftPreviewHasImages && (
                    <span className="book-draft-layout-hint is-warning">
                      Aucune image detectee dans cet apercu: ce reglage agira sur les pages avec photos.
                    </span>
                  )}
                </div>

                <div className="book-draft-layout-group">
                  <span className="book-preview-format-label">Interligne</span>
                  <div className="book-draft-layout-switch" role="group" aria-label="Interligne">
                    {PREVIEW_LINE_SPACING_OPTIONS.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        className={`book-draft-layout-btn ${draftLayoutSettings.lineSpacing === option.id ? 'is-active' : ''}`}
                        onClick={() => {
                          applyDraftLayoutSettings({
                            lineSpacing: option.id
                          });
                        }}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                  <span className="book-draft-layout-hint">
                    {PREVIEW_LINE_SPACING_IMPACT[draftLayoutSettings.lineSpacing] || PREVIEW_LINE_SPACING_IMPACT.balanced}
                  </span>
                </div>

                <div className="book-draft-layout-group is-span-2">
                  <span className="book-preview-format-label">Taille texte</span>
                  <div className="book-draft-slider">
                    <input
                      type="range"
                      min="0.9"
                      max="1.08"
                      step="0.02"
                      value={draftLayoutSettings.fontScale}
                      onChange={(event) => {
                        applyDraftLayoutSettings({
                          fontScale: Number(event.target.value)
                        });
                      }}
                      aria-label="Taille de texte"
                    />
                    <span className="book-draft-slider-value">
                      {Math.round((draftLayoutSettings.fontScale || 1) * 100)}%
                    </span>
                  </div>
                </div>

                <div className="book-draft-layout-summary" aria-live="polite">
                  <span>Format: {selectedPreviewFormatMeta.label}</span>
                  <span>Texte: {selectedTextDensityMeta.label}</span>
                  <span>Images: {selectedImageDensityMeta.label}</span>
                  <span>Interligne: {selectedLineSpacingMeta.label}</span>
                </div>
              </div>

              <div className="book-draft-modal-actions">
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={handleGenerateDraft}
                  disabled={generatingDraft}
                  title="Regenerer le contenu de l apercu avec l IA, en conservant vos reglages"
                >
                  {generatingDraft ? 'Generation...' : 'Regenerer le contenu IA'}
                </button>
                <div className="book-draft-modal-action-note">
                  Les reglages de mise en page s appliquent en direct. Ce bouton relance uniquement la generation IA.
                </div>
              </div>

            </div>

            <div
              className={`book-draft-preview book-draft-preview-format-${selectedPreviewFormat} book-draft-layout-text-${draftLayoutSettings.textDensity} book-draft-layout-image-${draftLayoutSettings.imageDensity} ${isHorizontalDraftMode ? 'is-horizontal' : 'is-vertical'} ${hasPaidOrderAccess ? '' : 'is-protected'}`.trim()}
              style={draftPreviewInlineStyle}
            >
              {!hasPaidOrderAccess && (
                <div className="book-draft-protected-badge" aria-hidden="true">
                  Apercu non contractuel
                </div>
              )}
              {isHorizontalDraftMode && draftPreviewPages.length > 0 ? (
                <div className="book-draft-preview-stage book-draft-preview-stage-spread">
                  <button
                    type="button"
                    className="book-draft-nav-arrow is-left"
                    onClick={() => shiftDraftSpread(-1)}
                    disabled={!canGoToPreviousSpread}
                    aria-label="Page precedente"
                  >
                    &lt;
                  </button>
                  <div className="book-draft-book-spread">
                    <article className="draft-book-leaf is-left">
                      <div
                        className="draft-book-leaf-content"
                        dangerouslySetInnerHTML={{ __html: leftDraftPageHtml }}
                      />
                    </article>
                    <article className="draft-book-leaf is-right">
                      <div
                        className="draft-book-leaf-content"
                        dangerouslySetInnerHTML={{
                          __html: rightDraftPageHtml || '<div class="draft-book-leaf-empty"></div>'
                        }}
                      />
                    </article>
                  </div>
                  <button
                    type="button"
                    className="book-draft-nav-arrow is-right"
                    onClick={() => shiftDraftSpread(1)}
                    disabled={!canGoToNextSpread}
                    aria-label="Page suivante"
                  >
                    &gt;
                  </button>
                </div>
              ) : (
                <div className="book-draft-preview-stage">
                  <div
                    className="book-draft-preview-paper"
                    dangerouslySetInnerHTML={{ __html: draftPreview.html }}
                  />
                </div>
              )}
              {isHorizontalDraftMode && draftPreviewPages.length > 0 && (
                <div className="book-draft-spread-meta">
                  Pages {currentDraftSpreadIndex * 2 + 1}-{Math.min((currentDraftSpreadIndex + 1) * 2, draftPreviewPages.length)} / {draftPreviewPages.length}
                </div>
              )}
            </div>
            </div>
          </div>
        </div>
      )}

      {pdfPreviewModal.open && (
        <div className="modal-overlay" onClick={closePdfPreviewModal}>
          <div
            className={`modal-content book-pdf-preview-modal ${isPdfPreviewControlsCollapsed ? 'is-controls-collapsed' : ''}`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="book-pdf-preview-top">
              <div className="book-pdf-preview-head">
                <div className="book-pdf-preview-head-copy">
                  <div className="label-gold">Apercu imprimeur</div>
                  <h3 className="book-pdf-preview-title">Rendu PDF fidele</h3>
                  <div className="book-pdf-preview-meta">
                    Visualisation du PDF final complet
                  </div>
                </div>
                <div className="book-pdf-preview-head-actions">
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={regeneratePdfPreviewWithCurrentSettings}
                    disabled={loadingPdfPreview || regeneratingPdfPreview}
                  >
                    {regeneratingPdfPreview ? 'Regeneration...' : 'Regenerer'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline book-pdf-preview-toggle"
                    onClick={() => setIsPdfPreviewControlsCollapsed((previous) => !previous)}
                    aria-expanded={!isPdfPreviewControlsCollapsed}
                  >
                    {isPdfPreviewControlsCollapsed ? 'Deplier' : 'Replier'}
                  </button>
                  <button
                    type="button"
                    className="modal-close"
                    onClick={closePdfPreviewModal}
                    aria-label="Fermer l apercu PDF"
                  >
                    x
                  </button>
                </div>
              </div>

            </div>

            <div className="book-pdf-preview-frame-wrap">
              {loadingPdfPreview && (
                <div className="book-pdf-preview-loading">Chargement du PDF...</div>
              )}
              {!loadingPdfPreview && pdfPreviewModal.url && (
                <iframe
                  title={`Apercu PDF ${pdfPreviewModal.kind}`}
                  className="book-pdf-preview-frame"
                  src={pdfPreviewModal.url}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BookPageLuxe;

