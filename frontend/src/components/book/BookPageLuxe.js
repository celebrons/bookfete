// C:\Users\USER\bookfete\frontend\src\components\book\BookPageLuxe.js
import React, { useState, useEffect, useRef } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';
import { listOrdersByBook } from '../../services/ordersApi';
import BookConfigLuxe from './BookConfigLuxe';
import ContributorsTabLuxe from './contributors/ContributorsTabLuxe';
import Loading from '../common/Loading';
import {
  getBookLifecycleConfig,
  getBookLifecycleStatusFromBook,
  isBookLifecycleAtLeast,
  normalizeBookLifecycleStatus,
  applyLifecycleStatus
} from '../../utils/bookLifecycle';
import '../../styles/luxe-theme.css';
import './BookLuxe.css';

const CHAPTER_STATE_EMAIL = '__chapter_state__@system.local';
const CHAPTER_DRAFT_EMAIL = '__chapter_draft__@system.local';
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
  config: 'Titre, type d\'album et prix estime du livre.'
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
  const [selectedPreviewFormat, setSelectedPreviewFormat] = useState('standard');
  const [draftLayoutSettings, setDraftLayoutSettings] = useState(DEFAULT_DRAFT_LAYOUT_SETTINGS);
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
  const [user, setUser] = useState(null);
  const [pageNotice, setPageNotice] = useState(null);
  const chapterIdsRef = useRef(new Set());
  const pdfExportPollRef = useRef(null);
  const pdfPanelRef = useRef(null);
  const mainContentRef = useRef(null);
  useEffect(() => {
    getUser();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search || '');
    const requestedTab = params.get('tab');

    if (requestedTab === 'chapitres' || requestedTab === 'contributeurs' || requestedTab === 'config') {
      setActiveTab(requestedTab);
    }
  }, [location.search]);

  // L'onglet "Edition" (chapitres) n'a plus de contenu propre depuis que
  // tout se construit dans l'atelier — jamais un ecran a soi, seulement une
  // redirection. Contributeurs/Configuration restent atteignables sans
  // passer par ici : lien direct depuis l'atelier (BookAtelierLuxe.js) vers
  // /book/:bookId?tab=config, qui fixe activeTab avant meme que cet effet ne
  // s'execute (voir l'effet ci-dessus).
  useEffect(() => {
    if (activeTab === 'chapitres') {
      navigate(`/book/${bookId}/atelier`, { replace: true });
    }
  }, [activeTab, bookId, navigate]);

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

    if (!pdfPreviewModal.open) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [pdfPreviewModal.open]);

  useEffect(() => (
    () => {
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
      return {
        paidAccess: false,
        latestPdfOrder: null,
        latestBookOrder: null
      };
    }
  };

  const getApiBaseUrl = () => process.env.REACT_APP_API_URL || 'http://localhost:5001/api';
  const showPageNotice = (message, type = 'info') => {
    setPageNotice({ message, type });
  };
  const dismissPageNotice = () => {
    setPageNotice(null);
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

  // Enrobe le coeur partage (utils/bookLifecycle.js: applyLifecycleStatus,
  // extrait de cette meme fonction) avec la notification/etat de chargement
  // propres a cet ecran — comportement inchange pour tout appelant existant.
  const setBookLifecycleStatus = async (
    nextStatus,
    { silent = false, onlyForward = false } = {}
  ) => {
    const normalizedStatus = normalizeBookLifecycleStatus(nextStatus);
    if (!normalizedStatus || !book) {
      return false;
    }

    setUpdatingLifecycleStatus(normalizedStatus);
    try {
      const applied = await applyLifecycleStatus(normalizedStatus, { book, onUpdateBook: handleUpdateBook, onlyForward });

      if (applied && !silent) {
        showPageNotice(
          `Etat du livre: ${getBookLifecycleConfig(normalizedStatus).label}.`,
          'success'
        );
      }
      return applied;
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

  if (loading) return <Loading message="Chargement du livre..." />;
  if (!book) return <div>Livre non trouvé</div>;

  const isSoloMode = getSoloMode(book);
  const visibleGuideSteps = isSoloMode
    ? WRITING_GUIDE_STEPS.filter((step) => step.title !== 'Invitations')
    : WRITING_GUIDE_STEPS;
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
  const displayBookTitle = getDisplayBookTitle(book?.title || '');
  const useFocusedWorkspaceTopbar = activeTab === 'contributeurs' || activeTab === 'config';

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
          // Jamais visible plus d'un instant (l'effet ci-dessus redirige
          // immediatement vers l'atelier) : simple etat de transition, plus
          // de lanceur/bouton ici.
          <div className="atelier-loading">Redirection vers l'atelier...</div>
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
          />
        )}

      </div>

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

