const express = require('express');
const router = express.Router();
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const { pathToFileURL } = require('url');
const PDFDocument = require('pdfkit');
const { createClient } = require('@supabase/supabase-js');
const supabase = require('../config/supabase');
const aiService = require('../services/aiService');
const promptEngine = require('../services/promptEngine');
const {
  getBookPromptAdminContext,
  testInlineBookPrompt,
  publishInlineBookPrompt,
  buildFramePromptVariables
} = require('../services/bookPromptInlineAdminService');
const authenticate = require('../middleware/auth');

const CHAPTER_STATE_EMAIL = '__chapter_state__@system.local';
const CHAPTER_DRAFT_EMAIL = '__chapter_draft__@system.local';
const MAX_CHAPTER_AI_GENERATIONS = 3;
const CHAPTER_DRAFT_PAGE_COUNT = 8;
const CHAPTER_DRAFT_MIN_TOTAL_CHARS = 3800;
const CHAPTER_DRAFT_MIN_PAGE_CHARS = 300;
const CHAPTER_DRAFT_QUALITY_THRESHOLD = 72;
const CHAPTER_DRAFT_FILLER_PATTERNS = [
  /dans ce chapitre/gi,
  /ce chapitre (?:montre|raconte|presente|met en lumiere|se referme|ouvre)/gi,
  /il est important de/gi,
  /nous allons/gi,
  /ce texte/gi,
  /volet\s*\d+/gi
];
const MM_TO_PT = 72 / 25.4;
const PDF_EXPORT_JOB_TTL_MS = 6 * 60 * 60 * 1000;
const PDF_EXPORT_DIR = path.join(__dirname, '..', 'tmp', 'pdf-exports');
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
const ORDER_STATUS_FLOW = [
  'draft',
  'awaiting_payment',
  'paid',
  'pdf_generating',
  'pdf_ready',
  'print_queued',
  'sent_to_printer',
  'printed',
  'shipped',
  'delivered',
  'cancelled',
  'failed'
];
const ORDER_STATUS_RANK = ORDER_STATUS_FLOW.reduce((accumulator, status, index) => {
  accumulator[status] = index;
  return accumulator;
}, {});
const DEFAULT_PREVIEW_FORMAT = 'standard';
const PREVIEW_FORMAT_ALIASES = {
  prestige: 'standard',
  carre: 'luxe'
};
const PREVIEW_FORMATS = {
  livret: {
    id: 'livret',
    label: 'Livret',
    trimWidthMm: 148,
    trimHeightMm: 210,
    defaultTextDensity: 'compact',
    defaultImageDensity: 'discrete',
    defaultLineSpacing: 'compact',
    defaultFontScale: 0.96
  },
  standard: {
    id: 'standard',
    label: 'Standard',
    trimWidthMm: 210,
    trimHeightMm: 297,
    defaultTextDensity: 'balanced',
    defaultImageDensity: 'balanced',
    defaultLineSpacing: 'balanced',
    defaultFontScale: 1
  },
  luxe: {
    id: 'luxe',
    label: 'Luxe',
    trimWidthMm: 240,
    trimHeightMm: 320,
    defaultTextDensity: 'airy',
    defaultImageDensity: 'immersive',
    defaultLineSpacing: 'airy',
    defaultFontScale: 1.04
  }
};
const PREVIEW_TEXT_DENSITY_PROFILES = {
  airy: {
    id: 'airy',
    firstPageChars: 560,
    firstPageFlexChars: 120,
    maxChars: 3000,
    chunkSize: 240
  },
  balanced: {
    id: 'balanced',
    firstPageChars: 700,
    firstPageFlexChars: 150,
    maxChars: 3600,
    chunkSize: 300
  },
  compact: {
    id: 'compact',
    firstPageChars: 820,
    firstPageFlexChars: 180,
    maxChars: 4300,
    chunkSize: 340
  }
};
const PREVIEW_IMAGE_DENSITY_PROFILES = {
  discrete: {
    id: 'discrete',
    maxPhotos: 3,
    showHero: false,
    galleryColumns: 2
  },
  balanced: {
    id: 'balanced',
    maxPhotos: 5,
    showHero: true,
    galleryColumns: 2
  },
  immersive: {
    id: 'immersive',
    maxPhotos: 8,
    showHero: true,
    galleryColumns: 3
  }
};
const PREVIEW_FORMAT_TEXT_BUDGET_FACTORS = {
  livret: 0.84,
  standard: 1,
  luxe: 1.08
};
const pdfExportJobs = new Map();

function ensurePromptAdmin(req, res, next) {
  const allowListRaw = process.env.AI_PROMPT_ADMIN_EMAILS || '';
  const allowList = allowListRaw
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  if (allowList.length === 0) {
    return next();
  }

  const userEmail = String(req.user?.email || '').trim().toLowerCase();
  if (!userEmail || !allowList.includes(userEmail)) {
    return res.status(403).json({
      error: 'Acces refuse. Utilisateur non autorise a gerer les prompts.'
    });
  }

  return next();
}

const pdfExportCleanupTimer = setInterval(() => {
  cleanupExpiredPdfExportJobs();
}, 30 * 60 * 1000);

if (typeof pdfExportCleanupTimer.unref === 'function') {
  pdfExportCleanupTimer.unref();
}

router.get('/', authenticate, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('books')
      .select('*')
      .eq('owner_id', req.user.id)
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id', authenticate, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('books')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error) {
      throw error;
    }

    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', authenticate, async (req, res) => {
  try {
    const newBook = {
      ...req.body,
      owner_id: req.user.id
    };

    const { data, error } = await supabase
      .from('books')
      .insert([newBook])
      .select()
      .single();

    if (error) {
      throw error;
    }

    res.status(201).json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id', authenticate, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('books')
      .update(req.body)
      .eq('id', req.params.id)
      .eq('owner_id', req.user.id)
      .select()
      .single();

    if (error) {
      throw error;
    }

    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', authenticate, async (req, res) => {
  try {
    const { error } = await supabase
      .from('books')
      .delete()
      .eq('id', req.params.id)
      .eq('owner_id', req.user.id);

    if (error) {
      throw error;
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id/prompt-admin/:promptKey', authenticate, ensurePromptAdmin, async (req, res) => {
  try {
    const context = await getBookPromptAdminContext({
      bookId: req.params.id,
      ownerId: req.user?.id,
      promptKey: req.params.promptKey
    });

    return res.json({
      ok: true,
      activeTemplate: context.activeTemplate
        ? {
            id: context.activeTemplate.id,
            type: context.activeTemplate.type,
            label: context.activeTemplate.label,
            version: context.activeTemplate.version,
            status: context.activeTemplate.status
          }
        : null,
      directives: context.directives || '',
      contextSummary: context.contextSummary,
      variables: context.variables,
      templateVariables: context.templateVariables || [],
      availableVariables: Object.keys(context.variables || {})
    });
  } catch (error) {
    const status = Number(error?.status) || 500;
    return res.status(status).json({
      error: error.message || 'Erreur chargement administration prompt livre.',
      missingVariables: Array.isArray(error?.details?.missingVariables)
        ? error.details.missingVariables
        : []
    });
  }
});

router.post('/:id/prompt-admin/:promptKey/test', authenticate, ensurePromptAdmin, async (req, res) => {
  try {
    const tested = await testInlineBookPrompt({
      bookId: req.params.id,
      ownerId: req.user?.id,
      promptKey: req.params.promptKey,
      directives: req.body?.directives || '',
      model: req.body?.model || process.env.MISTRAL_MODEL || 'mistral-small-latest'
    });

    return res.json({
      ok: true,
      activeTemplate: tested.template
        ? {
            id: tested.template.id,
            type: tested.template.type,
            label: tested.template.label,
            version: tested.template.version,
            status: tested.template.status
          }
        : null,
      directives: req.body?.directives || '',
      contextSummary: tested.contextSummary,
      variables: tested.variables,
      templateVariables: tested.templateVariables || [],
      availableVariables: Object.keys(tested.variables || {}),
      result: tested.result
    });
  } catch (error) {
    const status = Number(error?.status) || 500;
    return res.status(status).json({
      error: error.message || 'Erreur test prompt livre.',
      missingVariables: Array.isArray(error?.details?.missingVariables)
        ? error.details.missingVariables
        : []
    });
  }
});

router.post('/:id/prompt-admin/:promptKey/publish', authenticate, ensurePromptAdmin, async (req, res) => {
  try {
    const published = await publishInlineBookPrompt({
      bookId: req.params.id,
      ownerId: req.user?.id,
      promptKey: req.params.promptKey,
      directives: req.body?.directives || '',
      createdBy: req.user?.email || req.user?.id || 'inline-admin'
    });

    return res.json({
      ok: true,
      activeTemplate: published.template
        ? {
            id: published.template.id,
            type: published.template.type,
            label: published.template.label,
            version: published.template.version,
            status: published.template.status
          }
        : null,
      directives: published.directives || '',
      contextSummary: published.contextSummary,
      variables: published.variables,
      templateVariables: published.templateVariables || [],
      availableVariables: Object.keys(published.variables || {})
    });
  } catch (error) {
    const status = Number(error?.status) || 500;
    return res.status(status).json({
      error: error.message || 'Erreur validation prompt livre.',
      missingVariables: Array.isArray(error?.details?.missingVariables)
        ? error.details.missingVariables
        : []
    });
  }
});

router.post('/:id/chapters/:chapterId/generate-draft', authenticate, async (req, res) => {
  try {
    const { book, config, chapters, currentChapter, contributors } = await loadOwnedBookChapterContext({
      bookId: req.params.id,
      chapterId: req.params.chapterId,
      ownerId: req.user.id
    });
    const existingDraftState = extractChapterDraftState(currentChapter);
    const generationCount = Number(existingDraftState?.generationCount || 0);
    const isValidatedDraft = existingDraftState?.status === 'validated';
    const allowValidatedRegeneration = Boolean(req.body?.allowValidatedRegeneration);
    const previewOnly = Boolean(req.body?.previewOnly);
    const isValidatedPreviewOnly = isValidatedDraft && allowValidatedRegeneration && previewOnly;

    if (isValidatedDraft && !allowValidatedRegeneration) {
      return res.status(400).json({ error: 'Ce chapitre est deja valide definitivement' });
    }

    if (isValidatedDraft && allowValidatedRegeneration && !previewOnly) {
      return res.status(400).json({
        error: 'Pour conserver le verrouillage final, utilisez la regeneration en mode apercu uniquement'
      });
    }

    if (previewOnly && !isValidatedDraft) {
      return res.status(400).json({
        error: 'Le mode apercu de regeneration est reserve aux chapitres valides'
      });
    }

    if (!isValidatedPreviewOnly && generationCount >= MAX_CHAPTER_AI_GENERATIONS) {
      return res.status(400).json({ error: 'La limite de 3 generations IA a ete atteinte pour ce chapitre' });
    }

    const contributorNamesByEmail = buildContributorNamesByEmail(contributors);
    const sourcePayload = buildChapterDraftSourcePayload({
      book,
      config,
      chapters,
      currentChapter,
      organizerEmail: req.user.email || '',
      contributorNamesByEmail
    });
    const generatedDraft = await generateChapterDraftFromAI(sourcePayload);
    const html = renderChapterDraftPreviewHtml({
      book,
      chapter: currentChapter,
      draft: generatedDraft,
      sourcePayload
    });
    const generatedAt = new Date().toISOString();
    const nextState = {
      version: 1,
      status: previewOnly ? (existingDraftState?.status || 'draft') : 'draft',
      generationCount: previewOnly ? generationCount : (generationCount + 1),
      maxGenerations: MAX_CHAPTER_AI_GENERATIONS,
      title: cleanText(generatedDraft.title, 180) || cleanText(currentChapter.title, 180) || 'Chapitre',
      summary: cleanText(generatedDraft.summary, 600) || summarizeHtmlForChapter(html),
      html,
      aiQuality: generatedDraft?.quality || null,
      aiPlan: generatedDraft?.plan || null,
      sections: generatedDraft?.sections && typeof generatedDraft.sections === 'object'
        ? {
            ouverture: cleanText(generatedDraft.sections.ouverture, 5000),
            corps: cleanText(generatedDraft.sections.corps, 20000),
            coda: cleanText(generatedDraft.sections.coda, 5000)
          }
        : null,
      generationMode: cleanText(generatedDraft?.generationMode, 40) || 'single_pass',
      lastGeneratedAt: generatedAt,
      lastEditedAt: existingDraftState?.lastEditedAt || null,
      finalizedAt: previewOnly
        ? (existingDraftState?.finalizedAt || null)
        : null
    };

    if (previewOnly) {
      return res.json({
        generatedAt,
        previewOnly: true,
        draft: {
          ...nextState,
          previewOnly: true
        }
      });
    }

    const draftContribution = await upsertSystemContributionRecord({
      chapterId: currentChapter.id,
      existingRow: findSystemContribution(currentChapter, CHAPTER_DRAFT_EMAIL),
      email: CHAPTER_DRAFT_EMAIL,
      name: '__chapter_draft__',
      message: JSON.stringify(nextState)
    });

    res.json({
      generatedAt,
      draft: nextState,
      draftContribution
    });
  } catch (error) {
    console.error('Erreur generation brouillon chapitre:', error);
    res.status(error.status || 500).json({
      error: error.message || 'Erreur lors de la generation du chapitre'
    });
  }
});

router.post('/:id/chapters/:chapterId/save-draft', authenticate, async (req, res) => {
  try {
    const { currentChapter } = await loadOwnedBookChapterContext({
      bookId: req.params.id,
      chapterId: req.params.chapterId,
      ownerId: req.user.id
    });
    const existingDraftState = extractChapterDraftState(currentChapter);

    if (existingDraftState?.status === 'validated') {
      return res.status(400).json({ error: 'La version finale de ce chapitre est deja validee' });
    }

    const nextHtml = normalizeDraftHtml(
      typeof req.body?.html === 'string' ? req.body.html : existingDraftState?.html
    );

    if (!nextHtml) {
      return res.status(400).json({ error: 'Aucun contenu HTML a enregistrer' });
    }

    const nextState = {
      version: 1,
      status: 'draft',
      generationCount: Number(existingDraftState?.generationCount || 0),
      maxGenerations: MAX_CHAPTER_AI_GENERATIONS,
      title: cleanText(existingDraftState?.title, 180) || cleanText(currentChapter.title, 180) || 'Chapitre',
      summary: summarizeHtmlForChapter(nextHtml),
      html: nextHtml,
      aiQuality: existingDraftState?.aiQuality || null,
      aiPlan: existingDraftState?.aiPlan || null,
      sections: existingDraftState?.sections || null,
      generationMode: cleanText(existingDraftState?.generationMode, 40) || 'single_pass',
      lastGeneratedAt: existingDraftState?.lastGeneratedAt || null,
      lastEditedAt: new Date().toISOString(),
      finalizedAt: null
    };
    const draftContribution = await upsertSystemContributionRecord({
      chapterId: currentChapter.id,
      existingRow: findSystemContribution(currentChapter, CHAPTER_DRAFT_EMAIL),
      email: CHAPTER_DRAFT_EMAIL,
      name: '__chapter_draft__',
      message: JSON.stringify(nextState)
    });

    res.json({
      savedAt: nextState.lastEditedAt,
      draft: nextState,
      draftContribution
    });
  } catch (error) {
    console.error('Erreur sauvegarde revision chapitre:', error);
    res.status(error.status || 500).json({
      error: error.message || 'Erreur lors de la sauvegarde du chapitre'
    });
  }
});

router.post('/:id/chapters/:chapterId/finalize-draft', authenticate, async (req, res) => {
  try {
    const { currentChapter } = await loadOwnedBookChapterContext({
      bookId: req.params.id,
      chapterId: req.params.chapterId,
      ownerId: req.user.id
    });
    const existingDraftState = extractChapterDraftState(currentChapter);

    if (existingDraftState?.status === 'validated') {
      return res.status(400).json({ error: 'Ce chapitre est deja valide definitivement' });
    }

    const nextHtml = normalizeDraftHtml(
      typeof req.body?.html === 'string' ? req.body.html : existingDraftState?.html
    );

    if (!nextHtml) {
      return res.status(400).json({ error: 'Generez ou enregistrez un brouillon avant la validation finale' });
    }

    const finalizedAt = new Date().toISOString();
    const nextState = {
      version: 1,
      status: 'validated',
      generationCount: Number(existingDraftState?.generationCount || 0),
      maxGenerations: MAX_CHAPTER_AI_GENERATIONS,
      title: cleanText(existingDraftState?.title, 180) || cleanText(currentChapter.title, 180) || 'Chapitre',
      summary: summarizeHtmlForChapter(nextHtml),
      html: nextHtml,
      aiQuality: existingDraftState?.aiQuality || null,
      aiPlan: existingDraftState?.aiPlan || null,
      sections: existingDraftState?.sections || null,
      generationMode: cleanText(existingDraftState?.generationMode, 40) || 'single_pass',
      lastGeneratedAt: existingDraftState?.lastGeneratedAt || null,
      lastEditedAt: existingDraftState?.lastEditedAt || finalizedAt,
      finalizedAt
    };
    const draftContribution = await upsertSystemContributionRecord({
      chapterId: currentChapter.id,
      existingRow: findSystemContribution(currentChapter, CHAPTER_DRAFT_EMAIL),
      email: CHAPTER_DRAFT_EMAIL,
      name: '__chapter_draft__',
      message: JSON.stringify(nextState)
    });
    const workflowContribution = await upsertSystemContributionRecord({
      chapterId: currentChapter.id,
      existingRow: findSystemContribution(currentChapter, CHAPTER_STATE_EMAIL),
      email: CHAPTER_STATE_EMAIL,
      name: '__chapter_state__',
      message: 'closed'
    });

    res.json({
      finalizedAt,
      draft: nextState,
      draftContribution,
      workflowContribution
    });
  } catch (error) {
    console.error('Erreur validation finale chapitre:', error);
    res.status(error.status || 500).json({
      error: error.message || 'Erreur lors de la validation finale'
    });
  }
});

function normalizeCoverField(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function getBookCoverValidationState(book) {
  const coverConfig = book?.cover_config && typeof book.cover_config === 'object'
    ? book.cover_config
    : {};
  const backCoverConfig = book?.back_cover_config && typeof book.back_cover_config === 'object'
    ? book.back_cover_config
    : {};
  const isFrontCoverValidated = Boolean(
    normalizeCoverField(coverConfig.title || book?.title)
    && normalizeCoverField(coverConfig.recipientLine)
    && normalizeCoverField(coverConfig.eventLine)
  );
  const isBackCoverValidated = Boolean(
    normalizeCoverField(backCoverConfig.blurb)
    && normalizeCoverField(backCoverConfig.signature)
  );

  return {
    isFrontCoverValidated,
    isBackCoverValidated,
    isBookCoverValidated: isFrontCoverValidated && isBackCoverValidated
  };
}

function normalizePreviewFormat(value) {
  const normalized = cleanText(value, 40).toLowerCase();
  const canonical = PREVIEW_FORMAT_ALIASES[normalized] || normalized;
  return PREVIEW_FORMATS[canonical] ? canonical : '';
}

function resolveBookPreviewFormat(book, requestedFormat = '') {
  const requested = normalizePreviewFormat(requestedFormat);
  if (requested) {
    return requested;
  }

  const configured = normalizePreviewFormat(book?.cover_config?.previewFormat);
  if (configured) {
    return configured;
  }

  return DEFAULT_PREVIEW_FORMAT;
}

function getPreviewFormatSpec(previewFormat = '') {
  const formatId = resolveBookPreviewFormat(null, previewFormat);
  return PREVIEW_FORMATS[formatId] || PREVIEW_FORMATS[DEFAULT_PREVIEW_FORMAT];
}

function normalizePreviewTextDensity(value) {
  const normalized = cleanText(value, 40).toLowerCase();
  return PREVIEW_TEXT_DENSITY_PROFILES[normalized]?.id || PREVIEW_TEXT_DENSITY_PROFILES.balanced.id;
}

function normalizePreviewImageDensity(value) {
  const normalized = cleanText(value, 40).toLowerCase();
  return PREVIEW_IMAGE_DENSITY_PROFILES[normalized]?.id || PREVIEW_IMAGE_DENSITY_PROFILES.balanced.id;
}

function normalizePreviewLineSpacing(value) {
  const normalized = cleanText(value, 40).toLowerCase();
  if (normalized === 'compact') return 'compact';
  if (normalized === 'airy') return 'airy';
  return 'balanced';
}

function normalizePreviewFontScale(value, fallback = 1) {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return Math.min(1.08, Math.max(0.9, numeric));
  }
  return Math.min(1.08, Math.max(0.9, Number(fallback) || 1));
}

function normalizePreviewLayoutSettings(value, previewFormat = '') {
  const candidate = value && typeof value === 'object' ? value : {};
  const formatSpec = getPreviewFormatSpec(previewFormat);
  const defaultTextDensity = normalizePreviewTextDensity(formatSpec?.defaultTextDensity);
  const defaultImageDensity = normalizePreviewImageDensity(formatSpec?.defaultImageDensity);
  const defaultLineSpacing = normalizePreviewLineSpacing(formatSpec?.defaultLineSpacing);
  const defaultFontScale = normalizePreviewFontScale(formatSpec?.defaultFontScale, 1);

  return {
    textDensity: normalizePreviewTextDensity(candidate.textDensity || defaultTextDensity),
    imageDensity: normalizePreviewImageDensity(candidate.imageDensity || defaultImageDensity),
    lineSpacing: normalizePreviewLineSpacing(candidate.lineSpacing || defaultLineSpacing),
    fontScale: normalizePreviewFontScale(candidate.fontScale, defaultFontScale)
  };
}

function buildPreviewLayoutClassName(layoutSettings, previewFormat = '') {
  const normalized = normalizePreviewLayoutSettings(layoutSettings, previewFormat);
  return `draft-book-layout-text-${normalized.textDensity} draft-book-layout-image-${normalized.imageDensity} draft-book-layout-line-${normalized.lineSpacing}`;
}

function buildPreviewLayoutInlineStyle(layoutSettings, previewFormat = '') {
  const normalized = normalizePreviewLayoutSettings(layoutSettings, previewFormat);
  return `--layout-font-scale:${normalized.fontScale};`;
}

function extractBearerToken(req) {
  const authHeader = req.headers?.authorization || '';
  const [scheme, token] = authHeader.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return '';
  }
  return token;
}

function createUserScopedClient(req) {
  const token = extractBearerToken(req);
  if (!token) {
    return null;
  }

  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      global: {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    }
  );
}

function normalizeIdentifier(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeOrderStatus(value) {
  return String(value || '').trim().toLowerCase();
}

function isOrderLinkedToBook(order, bookId) {
  const expectedBookId = normalizeIdentifier(bookId);
  if (!expectedBookId) {
    return false;
  }

  const directBookId = normalizeIdentifier(order?.book_id);
  if (directBookId && directBookId === expectedBookId) {
    return true;
  }

  const snapshotBookId = normalizeIdentifier(order?.snapshot?.bookId);
  if (snapshotBookId && snapshotBookId === expectedBookId) {
    return true;
  }

  const metadataBookId = normalizeIdentifier(order?.metadata?.bookId);
  if (metadataBookId && metadataBookId === expectedBookId) {
    return true;
  }

  return false;
}

function hasOrderPdfAccess(order) {
  const normalizedStatus = normalizeOrderStatus(order?.status);
  if (ORDER_STATUSES_WITH_PDF_ACCESS.has(normalizedStatus)) {
    return true;
  }

  const stripePaymentStatus = normalizeOrderStatus(order?.metadata?.stripePaymentStatus);
  if (stripePaymentStatus === 'paid') {
    return true;
  }

  if (order?.paid_at || order?.metadata?.stripeConfirmedAt || order?.metadata?.paymentValidatedAt) {
    return true;
  }

  return false;
}

async function hasPaidPdfAccessForBook({ db = supabase, ownerId, bookId }) {
  const { data, error } = await db
    .from('orders')
    .select('id, status, paid_at, metadata, book_id, snapshot')
    .eq('owner_id', ownerId || '')
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) {
    throw error;
  }

  const ownerScopedPaid = Array.isArray(data) && data.some(
    (order) => isOrderLinkedToBook(order, bookId) && hasOrderPdfAccess(order)
  );
  if (ownerScopedPaid) {
    return true;
  }

  // Fallback for legacy/misaligned rows where owner_id can be missing or inconsistent.
  const { data: rawBookOrders, error: rawBookOrdersError } = await db
    .from('orders')
    .select('id, status, paid_at, metadata, book_id, snapshot')
    .eq('book_id', bookId)
    .order('created_at', { ascending: false })
    .limit(500);

  if (rawBookOrdersError) {
    throw rawBookOrdersError;
  }

  return Array.isArray(rawBookOrders) && rawBookOrders.some(hasOrderPdfAccess);
}

function getOrderStatusRank(status) {
  const normalized = String(status || '').toLowerCase();
  const rank = ORDER_STATUS_RANK[normalized];
  return Number.isFinite(rank) ? rank : -1;
}

function mergeOrderMetadata(existingMetadata, patchMetadata) {
  return {
    ...(existingMetadata && typeof existingMetadata === 'object' ? existingMetadata : {}),
    ...(patchMetadata && typeof patchMetadata === 'object' ? patchMetadata : {})
  };
}

function getPdfCompletionTargetStatus(orderType) {
  const normalizedType = String(orderType || '').toLowerCase();
  if (normalizedType === 'print' || normalizedType === 'pack') {
    return 'print_queued';
  }
  return 'pdf_ready';
}

async function syncOrderWithPdfJobResult({ job, outcome, errorMessage = '' }) {
  const orderId = cleanText(job?.orderId, 120);
  if (!orderId) {
    return;
  }

  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .eq('owner_id', job.ownerId)
    .single();

  if (orderError || !order) {
    return;
  }

  const nowIso = new Date().toISOString();
  const nextMetadata = mergeOrderMetadata(order.metadata, {
    pdfJobId: job.jobId,
    pdfRequestedAt: order?.metadata?.pdfRequestedAt || job.createdAt || nowIso,
    pdfPreviewFormat: job.previewFormat || order?.metadata?.pdfPreviewFormat || DEFAULT_PREVIEW_FORMAT
  });
  const updatePayload = {
    metadata: nextMetadata,
    updated_at: nowIso
  };

  if (outcome === 'ready') {
    const targetStatus = getPdfCompletionTargetStatus(order.type);
    const currentRank = getOrderStatusRank(order.status);
    const targetRank = getOrderStatusRank(targetStatus);
    const completedAt = job.completedAt || nowIso;

    nextMetadata.pdfReady = true;
    nextMetadata.pdfCompletedAt = completedAt;
    nextMetadata.pdfError = null;
    nextMetadata.pdfRenderer = job?.files?.renderer || null;

    if (targetRank > currentRank) {
      updatePayload.status = targetStatus;
    }

    updatePayload.pdf_ready_at = completedAt;
  }

  if (outcome === 'failed') {
    nextMetadata.pdfReady = false;
    nextMetadata.pdfError = cleanText(errorMessage || 'Generation PDF impossible', 260);

    if (String(order.status || '').toLowerCase() === 'pdf_generating') {
      updatePayload.status = 'paid';
    }
  }

  await supabase
    .from('orders')
    .update(updatePayload)
    .eq('id', order.id)
    .eq('owner_id', job.ownerId);
}

router.post('/:id/generate-draft', authenticate, async (req, res) => {
  try {
    const bookId = req.params.id;
    const { book, config, chapters } = await loadOwnedBookChapterContext({
      bookId,
      ownerId: req.user.id
    });
    const previewFormat = resolveBookPreviewFormat(book, req.body?.previewFormat);
    const previewLayoutSettings = normalizePreviewLayoutSettings(
      req.body?.previewLayoutSettings || book?.cover_config?.previewLayoutSettings,
      previewFormat
    );
    const chaptersWithDrafts = (chapters || []).map((chapter) => ({
      chapter,
      draft: extractChapterDraftState(chapter)
    }));
    const incompleteCount = chaptersWithDrafts.filter(
      ({ draft }) => draft?.status !== 'validated'
    ).length;

    if (incompleteCount > 0) {
      return res.status(400).json({
        error: `Tous les chapitres doivent etre generes et valides avant l'aperçu du livre (${incompleteCount} restant(s))`
      });
    }

    const coverValidation = getBookCoverValidationState(book);
    if (!coverValidation.isBookCoverValidated) {
      return res.status(400).json({
        error: 'La couverture et la 4e de couverture doivent etre validees avant l apercu global.'
      });
    }

    const frameTexts = await generateBookFrameTextsForPreview({
      book,
      config,
      chaptersWithDrafts
    });

    const html = renderValidatedBookPreviewHtml({
      book,
      chaptersWithDrafts,
      previewFormat,
      previewLayoutSettings,
      frameTexts
    });

    res.json({
      generatedAt: new Date().toISOString(),
      html,
      previewFormat,
      previewLayoutSettings,
      frameTexts
    });
  } catch (error) {
    console.error('Erreur apercu livre:', error);
    res.status(error.status || 500).json({ error: error.message || 'Erreur lors de la generation du brouillon' });
  }
});

router.post('/:id/export-final-pdf', authenticate, async (req, res) => {
  try {
    const db = supabase;
    const bookId = req.params.id;
    const { book, config, chapters } = await loadOwnedBookChapterContext({
      bookId,
      ownerId: req.user.id
    });
    const previewFormat = resolveBookPreviewFormat(book, req.body?.previewFormat);
    const previewLayoutSettings = normalizePreviewLayoutSettings(
      req.body?.previewLayoutSettings || book?.cover_config?.previewLayoutSettings,
      previewFormat
    );
    const forceRegenerate = (
      req.body?.forceRegenerate === true
      || req.body?.forceRegenerate === 'true'
      || req.body?.forceRegenerate === 1
      || req.body?.forceRegenerate === '1'
    );

    const chaptersWithDrafts = (chapters || []).map((chapter) => ({
      chapter,
      draft: extractChapterDraftState(chapter)
    }));
    const frameTexts = await generateBookFrameTextsForPreview({
      book,
      config,
      chaptersWithDrafts
    });
    const incompleteCount = chaptersWithDrafts.filter(
      ({ draft }) => draft?.status !== 'validated'
    ).length;

    if (!chaptersWithDrafts.length) {
      return res.status(400).json({
        error: 'Aucun chapitre disponible pour generer le PDF final'
      });
    }

    if (incompleteCount > 0) {
      return res.status(400).json({
        error: `Tous les chapitres doivent etre valides avant l export PDF (${incompleteCount} restant(s))`
      });
    }

    const coverValidation = getBookCoverValidationState(book);
    if (!coverValidation.isBookCoverValidated) {
      return res.status(400).json({
        error: 'La couverture et la 4e de couverture doivent etre validees avant l export PDF final.'
      });
    }

    const requestedOrderId = cleanText(req.body?.orderId, 120);
    let targetOrder = null;
    let hasPaidAccess = false;

    if (requestedOrderId) {
      const { data: matchedOrder, error: matchedOrderError } = await db
        .from('orders')
        .select('*')
        .eq('id', requestedOrderId)
        .eq('owner_id', req.user.id)
        .eq('book_id', bookId)
        .single();

      if (!matchedOrderError && matchedOrder) {
        targetOrder = matchedOrder;
      } else {
        const { data: fallbackOrder, error: fallbackOrderError } = await db
          .from('orders')
          .select('*')
          .eq('id', requestedOrderId)
          .eq('owner_id', req.user.id)
          .single();

        if (!fallbackOrderError && fallbackOrder && isOrderLinkedToBook(fallbackOrder, bookId)) {
          targetOrder = fallbackOrder;
        } else {
          const { data: rawOrder, error: rawOrderError } = await db
            .from('orders')
            .select('*')
            .eq('id', requestedOrderId)
            .single();

          if (!rawOrderError && rawOrder && isOrderLinkedToBook(rawOrder, bookId)) {
            targetOrder = rawOrder;
          }
        }
      }

      if (targetOrder) {
        hasPaidAccess = hasOrderPdfAccess(targetOrder);
      } else {
        hasPaidAccess = await hasPaidPdfAccessForBook({
          db,
          ownerId: req.user.id,
          bookId
        });
      }
    } else {
      hasPaidAccess = await hasPaidPdfAccessForBook({
        db,
        ownerId: req.user.id,
        bookId
      });
    }

    if (!hasPaidAccess) {
      return res.status(403).json({
        error: 'Le PDF final est disponible uniquement apres paiement.'
      });
    }

    if (!targetOrder) {
      const { data: candidateOrders, error: candidateOrdersError } = await db
        .from('orders')
        .select('*')
        .eq('owner_id', req.user.id)
        .order('created_at', { ascending: false })
        .limit(500);

      if (!candidateOrdersError && Array.isArray(candidateOrders)) {
        targetOrder = candidateOrders.find(
          (order) => isOrderLinkedToBook(order, bookId) && hasOrderPdfAccess(order)
        ) || null;
      }
    }

    const linkedJobId = cleanText(targetOrder?.metadata?.pdfJobId, 120);
    if (linkedJobId && !forceRegenerate) {
      const linkedJob = getOwnedPdfExportJob({
        jobId: linkedJobId,
        bookId,
        ownerId: req.user.id
      });

      if (linkedJob && ['queued', 'rendering', 'ready'].includes(String(linkedJob.status || '').toLowerCase())) {
        return res.status(202).json({
          jobId: linkedJob.jobId,
          status: linkedJob.status,
          createdAt: linkedJob.createdAt,
          previewFormat: linkedJob.previewFormat || previewFormat,
          previewLayoutSettings: linkedJob.previewLayoutSettings || previewLayoutSettings
        });
      }
    }

    if (
      targetOrder
      && String(targetOrder.status || '').toLowerCase() === 'pdf_generating'
      && !forceRegenerate
    ) {
      const recoveredJob = await recoverMissingPdfExportJob({
        db,
        bookId,
        ownerId: req.user.id,
        requestedJobId: linkedJobId || ''
      });

      if (recoveredJob && ['queued', 'rendering', 'ready'].includes(String(recoveredJob.status || '').toLowerCase())) {
        return res.status(202).json({
          jobId: recoveredJob.jobId,
          status: recoveredJob.status,
          createdAt: recoveredJob.createdAt,
          previewFormat: recoveredJob.previewFormat || previewFormat,
          previewLayoutSettings: recoveredJob.previewLayoutSettings || previewLayoutSettings
        });
      }
    }

    const jobId = createPdfExportJobId();
    const createdAt = new Date().toISOString();

    pdfExportJobs.set(jobId, {
      jobId,
      bookId,
      ownerId: req.user.id,
      orderId: targetOrder?.id || null,
      status: 'queued',
      createdAt,
      startedAt: null,
      completedAt: null,
      error: null,
      files: null,
      previewFormat,
      previewLayoutSettings
    });

    if (targetOrder) {
      const nextOrderMetadata = mergeOrderMetadata(targetOrder.metadata, {
        pdfJobId: jobId,
        pdfRequestedAt: createdAt,
        pdfPreviewFormat: previewFormat,
        pdfPreviewLayoutSettings: previewLayoutSettings,
        pdfReady: false,
        pdfError: null
      });
      const orderUpdatePayload = {
        metadata: nextOrderMetadata,
        updated_at: createdAt
      };
      if (String(targetOrder.status || '').toLowerCase() === 'paid') {
        orderUpdatePayload.status = 'pdf_generating';
      }

      await db
        .from('orders')
        .update(orderUpdatePayload)
        .eq('id', targetOrder.id)
        .eq('owner_id', req.user.id);
    }

    processPdfExportJob({
      jobId,
      book,
      chaptersWithDrafts,
      previewFormat,
      previewLayoutSettings
    }).catch((error) => {
      console.error('Erreur pipeline export PDF:', error);
    });

    return res.status(202).json({
      jobId,
      status: 'queued',
      createdAt,
      previewFormat,
      previewLayoutSettings
    });
  } catch (error) {
    console.error('Erreur lancement export PDF:', error);
    return res.status(error.status || 500).json({
      error: error.message || 'Erreur lors du lancement de la generation PDF'
    });
  }
});

router.get('/:id/export-final-pdf/:jobId/status', authenticate, async (req, res) => {
  try {
    const db = supabase;
    const bookId = req.params.id;
    const jobId = req.params.jobId;
    let job = getOwnedPdfExportJob({
      jobId,
      bookId,
      ownerId: req.user.id
    });

    if (!job) {
      job = await recoverMissingPdfExportJob({
        db,
        bookId,
        ownerId: req.user.id,
        requestedJobId: jobId
      });
    }

    if (!job) {
      return res.status(404).json({ error: 'Job export introuvable' });
    }

    const hasPaidAccess = await hasPaidPdfAccessForBook({
      db,
      ownerId: req.user.id,
      bookId
    });

    if (!hasPaidAccess && !job.orderId) {
      return res.status(403).json({
        error: 'Le PDF final est disponible uniquement apres paiement.'
      });
    }

    return res.json({
      jobId: job.jobId,
      status: job.status,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      error: job.error,
      renderer: job.files?.renderer || null,
      previewFormat: job.previewFormat || DEFAULT_PREVIEW_FORMAT,
      files: job.status === 'ready'
        ? {
            final: {
              kind: 'final',
              fileName: job.files?.final?.fileName || 'livre-final.pdf'
            }
          }
        : null
    });
  } catch (error) {
    console.error('Erreur statut export PDF:', error);
    return res.status(error.status || 500).json({
      error: error.message || 'Erreur lors de la recuperation du statut export'
    });
  }
});

router.get('/:id/export-final-pdf/:jobId/download/:kind', authenticate, async (req, res) => {
  try {
    const db = supabase;
    const bookId = req.params.id;
    const jobId = req.params.jobId;
    const kind = req.params.kind;
    let job = getOwnedPdfExportJob({
      jobId,
      bookId,
      ownerId: req.user.id
    });

    if (!job) {
      job = await recoverMissingPdfExportJob({
        db,
        bookId,
        ownerId: req.user.id,
        requestedJobId: jobId
      });
    }

    if (!job) {
      return res.status(404).json({ error: 'Job export introuvable' });
    }

    const hasPaidAccess = await hasPaidPdfAccessForBook({
      db,
      ownerId: req.user.id,
      bookId
    });

    if (!hasPaidAccess && !job.orderId) {
      return res.status(403).json({
        error: 'Le telechargement PDF est disponible uniquement apres paiement.'
      });
    }

    if (job.status !== 'ready') {
      return res.status(409).json({
        error: 'Le PDF final est en cours de generation',
        jobId: job.jobId,
        status: job.status
      });
    }

    const normalizedKind = kind === 'book' ? 'final' : kind;
    if (!['final', 'interior', 'cover'].includes(normalizedKind)) {
      return res.status(400).json({ error: 'Type de fichier invalide' });
    }

    const targetFile = (
      job.files?.[normalizedKind]
      || (normalizedKind === 'final' ? job.files?.book : null)
      || (normalizedKind === 'final' ? job.files?.interior : null)
      || job.files?.final
    );
    if (!targetFile?.path || !fs.existsSync(targetFile.path)) {
      return res.status(404).json({ error: 'Fichier PDF introuvable' });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${targetFile.fileName || `${normalizedKind}.pdf`}"`
    );

    const fileStream = fs.createReadStream(targetFile.path);
    fileStream.on('error', (streamError) => {
      console.error('Erreur lecture fichier PDF:', streamError);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Impossible de lire le fichier PDF' });
      } else {
        res.end();
      }
    });
    fileStream.pipe(res);
  } catch (error) {
    console.error('Erreur telechargement PDF:', error);
    return res.status(error.status || 500).json({
      error: error.message || 'Erreur lors du telechargement du PDF'
    });
  }
});

async function loadOwnedBookChapterContext({ bookId, chapterId = null, ownerId }) {
  const { data: book, error: bookError } = await supabase
    .from('books')
    .select('*')
    .eq('id', bookId)
    .eq('owner_id', ownerId)
    .single();

  if (bookError || !book) {
    const error = new Error('Livre introuvable');
    error.status = 404;
    throw error;
  }

  const [{ data: chapters, error: chaptersError }, { data: contributors, error: contributorsError }, { data: config, error: configError }] = await Promise.all([
    supabase
      .from('chapters')
      .select(`
        *,
        contributions:contributions(*),
        chapter_invites:chapter_invites(*)
      `)
      .eq('book_id', bookId)
      .order('order_index', { ascending: true }),
    supabase
      .from('book_contributors')
      .select('id, name, email')
      .eq('book_id', bookId),
    supabase
      .from('book_configs')
      .select('*')
      .eq('book_id', bookId)
      .maybeSingle()
  ]);

  if (chaptersError) {
    throw chaptersError;
  }

  if (contributorsError) {
    throw contributorsError;
  }

  if (configError) {
    throw configError;
  }

  const orderedChapters = Array.isArray(chapters) ? chapters : [];
  const currentChapter = chapterId
    ? orderedChapters.find((chapter) => chapter.id === chapterId) || null
    : null;

  if (chapterId && !currentChapter) {
    const error = new Error('Chapitre introuvable');
    error.status = 404;
    throw error;
  }

  return {
    book,
    config: config || {},
    chapters: orderedChapters,
    contributors: contributors || [],
    currentChapter
  };
}

function buildContributorNamesByEmail(contributors) {
  return (contributors || []).reduce((acc, contributor) => {
    const normalizedEmail = normalizeEmail(contributor?.email);
    if (normalizedEmail) {
      acc[normalizedEmail] = cleanText(contributor.name, 180) || null;
    }
    return acc;
  }, {});
}

function findSystemContribution(chapter, systemEmail) {
  const contributions = Array.isArray(chapter?.contributions) ? chapter.contributions : [];
  return contributions
    .filter((contribution) => normalizeEmail(contribution?.contributor_email) === systemEmail)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0] || null;
}

function extractChapterDraftState(chapter) {
  const draftContribution = findSystemContribution(chapter, CHAPTER_DRAFT_EMAIL);

  if (!draftContribution?.message) {
    return null;
  }

  try {
    const parsed = JSON.parse(draftContribution.message);
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    return {
      version: parsed.version || 1,
      status: parsed.status || 'draft',
      generationCount: Number(parsed.generationCount || 0),
      maxGenerations: Number(parsed.maxGenerations || MAX_CHAPTER_AI_GENERATIONS),
      title: cleanText(parsed.title, 180),
      summary: cleanText(parsed.summary, 600),
      html: normalizeDraftHtml(parsed.html),
      aiQuality: parsed.aiQuality && typeof parsed.aiQuality === 'object'
        ? {
            score: Number(parsed.aiQuality.score || 0),
            issues: Array.isArray(parsed.aiQuality.issues)
              ? parsed.aiQuality.issues.map((issue) => cleanText(issue, 180)).filter(Boolean).slice(0, 8)
              : []
          }
        : null,
      aiPlan: parsed.aiPlan && typeof parsed.aiPlan === 'object'
        ? parsed.aiPlan
        : null,
      sections: parsed.sections && typeof parsed.sections === 'object'
        ? {
            ouverture: cleanText(parsed.sections.ouverture, 5000),
            corps: cleanText(parsed.sections.corps, 20000),
            coda: cleanText(parsed.sections.coda, 5000)
          }
        : null,
      generationMode: cleanText(parsed.generationMode, 40),
      lastGeneratedAt: parsed.lastGeneratedAt || null,
      lastEditedAt: parsed.lastEditedAt || null,
      finalizedAt: parsed.finalizedAt || null
    };
  } catch (error) {
    return null;
  }
}

async function upsertSystemContributionRecord({
  chapterId,
  existingRow,
  email,
  name,
  message
}) {
  const payload = {
    contributor_name: name,
    contributor_email: email,
    message,
    photo_urls: [],
    approved: true,
    is_finalized: true,
    needs_revision: false,
    moderation_feedback: null
  };

  if (existingRow?.id) {
    const { data, error } = await supabase
      .from('contributions')
      .update(payload)
      .eq('id', existingRow.id)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return data;
  }

  const { data, error } = await supabase
    .from('contributions')
    .insert([{
      chapter_id: chapterId,
      ...payload
    }])
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

function buildChapterDraftSourcePayload({
  book,
  config = {},
  chapters,
  currentChapter,
  organizerEmail,
  contributorNamesByEmail
}) {
  const organizerEmailKey = normalizeEmail(organizerEmail);
  const chapterContributions = Array.isArray(currentChapter?.contributions) ? currentChapter.contributions : [];
  const chapterInvites = Array.isArray(currentChapter?.chapter_invites) ? currentChapter.chapter_invites : [];
  const organizerContribution = chapterContributions
    .filter((contribution) => (
      normalizeEmail(contribution?.contributor_email) === organizerEmailKey &&
      contribution.is_finalized !== false
    ))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0] || null;
  const guestContributions = chapterContributions
    .filter((contribution) => {
      const normalizedEmail = normalizeEmail(contribution?.contributor_email);
      return (
        normalizedEmail &&
        normalizedEmail !== organizerEmailKey &&
        normalizedEmail !== CHAPTER_STATE_EMAIL &&
        normalizedEmail !== CHAPTER_DRAFT_EMAIL &&
        contribution.approved === true &&
        contribution.is_finalized !== false &&
        !contribution.needs_revision
      );
    })
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    .map((contribution) => {
      const normalizedEmail = normalizeEmail(contribution?.contributor_email);
      return {
        contributorName:
          cleanText(contribution.contributor_name, 180) ||
          contributorNamesByEmail[normalizedEmail] ||
          cleanText(normalizedEmail.split('@')[0], 180) ||
          'Contributeur',
        role: normalizeEmail(contribution?.contributor_email) || 'proche',
        message: cleanText(contribution.message, 2400),
        photoUrls: normalizePhotoUrls(contribution.photo_urls),
        createdAt: contribution?.created_at || null
      };
    });

  const orderedChapters = Array.isArray(chapters)
    ? [...chapters].sort((left, right) => Number(left?.order_index || 0) - Number(right?.order_index || 0))
    : [];
  const currentOrderIndex = Number(currentChapter?.order_index || 0);
  const previousChapter = orderedChapters
    .filter((chapter) => Number(chapter?.order_index || 0) < currentOrderIndex)
    .slice(-1)[0] || null;
  const nextChapter = orderedChapters
    .find((chapter) => Number(chapter?.order_index || 0) > currentOrderIndex) || null;

  return {
    book: {
      id: book.id,
      title: cleanText(book.title, 180) || 'Livre souvenir',
      recipientName: cleanText(book.recipient_name, 180) || 'la personne celebree',
      recipientAge: book.recipient_age || null,
      recipientGender: cleanText(book.recipient_gender, 120) || '',
      eventType: cleanText(book.event_type, 120) || 'evenement',
      styleNarratif: cleanText(book.style_narratif, 120) || 'intime',
      aiProjectBrief: cleanText(book?.cover_config?.aiProjectBrief, 900),
      minPagesPerChapter: 4
    },
    config: {
      eventType: cleanText(config?.event_type || book.event_type, 120) || 'evenement',
      eventSubtype: cleanText(config?.event_subtype, 120) || '',
      narrativePerson: cleanText(config?.narrative_person, 120) || 'third_person',
      recipientNickname: cleanText(config?.recipient_nickname, 160) || '',
      characterTrait: cleanText(config?.character_trait, 220) || '',
      signatureAnecdote: cleanText(config?.signature_anecdote, 500) || '',
      signaturePhrase: cleanText(config?.signature_phrase, 220) || '',
      futureWish: cleanText(config?.future_wish, 320) || ''
    },
      chapter: {
        id: currentChapter.id,
        orderIndex: Number(currentChapter.order_index || 0),
        chapterTotal: orderedChapters.length,
        title: cleanText(currentChapter.title, 180) || 'Chapitre',
        description: cleanText(currentChapter.description, 700),
        previousTitle: cleanText(previousChapter?.title, 180),
        nextTitle: cleanText(nextChapter?.title, 180),
        amorceText: cleanText(currentChapter.amorce_text, 320),
        triggers: Array.isArray(currentChapter.triggers)
          ? currentChapter.triggers.map((trigger) => cleanText(trigger, 80)).filter(Boolean)
          : [],
        organizerContribution: organizerContribution
          ? {
            message: cleanText(organizerContribution.message, 3200),
            photoUrls: normalizePhotoUrls(organizerContribution.photo_urls),
            createdAt: organizerContribution?.created_at || null
          }
          : null,
        guestContributions,
      photoUrls: collectChapterPhotos({
        organizerContribution: organizerContribution
          ? { photoUrls: normalizePhotoUrls(organizerContribution.photo_urls) }
          : null,
        guestContributions
      }),
      stats: {
        invitedCount: chapterInvites.length,
        respondedCount: chapterInvites.filter((invite) => invite.accepted || invite.contributed).length
      }
    },
    previousChapterSummaries: (chapters || [])
      .filter((chapter) => Number(chapter?.order_index || 0) < Number(currentChapter?.order_index || 0))
      .map((chapter) => {
        const draftState = extractChapterDraftState(chapter);
        if (draftState?.status !== 'validated' || !draftState.summary) {
          return null;
        }

        return {
          title: cleanText(chapter.title, 180) || 'Chapitre',
          summary: cleanText(draftState.summary, 500)
        };
      })
      .filter(Boolean)
  };
}

function extractLeadSentenceForPlan(value, maxLength = 220) {
  const text = cleanText(value, 1600);
  if (!text) {
    return '';
  }
  const firstSentence = text.split(/[\.\!\?]\s+/)[0] || text;
  return cleanText(firstSentence, maxLength);
}

function extractDetailAnchorsFromSourcePayload(sourcePayload, maxItems = 8) {
  const chapter = sourcePayload?.chapter || {};
  const chunks = [
    cleanText(chapter?.description, 700),
    cleanText(chapter?.organizerContribution?.message, 2600),
    ...(Array.isArray(chapter?.guestContributions)
      ? chapter.guestContributions.map((contribution) => cleanText(contribution?.message, 1800))
      : [])
  ].filter(Boolean);
  const results = [];
  const seen = new Set();

  for (const chunk of chunks) {
    const sentences = String(chunk)
      .split(/[\.\!\?]+\s+/)
      .map((sentence) => cleanText(sentence, 180))
      .filter(Boolean);

    for (const sentence of sentences) {
      const comparable = normalizeComparableText(sentence);
      if (!comparable) {
        continue;
      }
      if (seen.has(comparable)) {
        continue;
      }
      if (sentence.length < 24) {
        continue;
      }
      if (/^(ce chapitre|dans ce chapitre|il est important)/i.test(sentence)) {
        continue;
      }

      seen.add(comparable);
      results.push(sentence);
      if (results.length >= maxItems) {
        return results;
      }
    }
  }

  return results;
}

function buildChapterGenerationSourceSnapshot(sourcePayload, detailAnchors = [], maxGuest = 4) {
  const chapter = sourcePayload?.chapter || {};
  const guestContributions = Array.isArray(chapter?.guestContributions)
    ? chapter.guestContributions
    : [];

  return {
    book: sourcePayload?.book || {},
    chapter: {
      id: chapter.id,
      orderIndex: chapter.orderIndex,
      title: chapter.title,
      description: chapter.description,
      amorceText: cleanText(chapter.amorceText, 320),
      triggers: Array.isArray(chapter.triggers) ? chapter.triggers : [],
      organizerContribution: chapter.organizerContribution
        ? {
            message: cleanText(chapter.organizerContribution.message, 2200),
            photoCount: Array.isArray(chapter.organizerContribution.photoUrls)
              ? chapter.organizerContribution.photoUrls.length
              : 0
          }
        : null,
      guestContributions: guestContributions
        .slice(0, Math.max(1, maxGuest))
        .map((contribution) => ({
          contributorName: cleanText(contribution.contributorName, 180) || 'Contributeur',
          message: cleanText(contribution.message, 1700),
          photoCount: Array.isArray(contribution.photoUrls) ? contribution.photoUrls.length : 0
        })),
      stats: chapter.stats || {}
    },
    previousChapterSummaries: Array.isArray(sourcePayload?.previousChapterSummaries)
      ? sourcePayload.previousChapterSummaries.slice(-4)
      : [],
    detailAnchors: Array.isArray(detailAnchors)
      ? detailAnchors.slice(0, 8)
      : []
  };
}

function buildChapterPlanFallback(sourcePayload, fallbackDraft, detailAnchors = []) {
  const chapterTitle = cleanText(sourcePayload?.chapter?.title, 180)
    || cleanText(fallbackDraft?.title, 180)
    || 'Chapitre';
  const fallbackPages = Array.isArray(fallbackDraft?.pages) ? fallbackDraft.pages : [];
  const anchorPool = Array.isArray(detailAnchors) ? detailAnchors : [];

  return {
    narrativePromise: cleanText(sourcePayload?.chapter?.description, 280)
      || `Rendre le chapitre ${chapterTitle} vivant, concret et memorisable.`,
    pagePlans: Array.from({ length: CHAPTER_DRAFT_PAGE_COUNT }, (_, index) => {
      const fallbackPage = fallbackPages[index] || {};
      return {
        title: sanitizeDraftHeadingStrict(
          fallbackPage.title || `Page ${index + 1}`,
          index === 0 ? chapterTitle : `Volet ${index + 1}`
        ),
        focus: extractLeadSentenceForPlan(fallbackPage.body, 220)
          || `Developper un moment fort lie a ${chapterTitle}.`,
        anchors: anchorPool
          .slice(index, index + 2)
          .map((anchor) => cleanText(anchor, 160))
          .filter(Boolean)
      };
    }),
    forbidden: [
      'Phrases meta de type "dans ce chapitre".',
      'Generalites vagues sans details concrets.',
      'Repetition du meme angle narratif sur toutes les pages.'
    ]
  };
}

function normalizeChapterPlan(candidatePlan, sourcePayload, fallbackDraft, detailAnchors = []) {
  const fallbackPlan = buildChapterPlanFallback(sourcePayload, fallbackDraft, detailAnchors);
  if (!candidatePlan || typeof candidatePlan !== 'object') {
    return fallbackPlan;
  }

  const pagePlans = Array.from({ length: CHAPTER_DRAFT_PAGE_COUNT }, (_, index) => {
    const page = Array.isArray(candidatePlan.pagePlans) ? candidatePlan.pagePlans[index] : null;
    const fallbackPage = fallbackPlan.pagePlans[index];
    return {
      title: sanitizeDraftHeadingStrict(
        cleanText(page?.title, 180) || fallbackPage.title,
        fallbackPage.title
      ),
      focus: cleanText(page?.focus, 320) || fallbackPage.focus,
      anchors: Array.isArray(page?.anchors)
        ? page.anchors.map((anchor) => cleanText(anchor, 160)).filter(Boolean).slice(0, 3)
        : fallbackPage.anchors
    };
  });

  const forbidden = Array.isArray(candidatePlan.forbidden)
    ? candidatePlan.forbidden.map((item) => cleanText(item, 140)).filter(Boolean).slice(0, 5)
    : fallbackPlan.forbidden;

  return {
    narrativePromise: cleanText(candidatePlan.narrativePromise, 320) || fallbackPlan.narrativePromise,
    pagePlans,
    forbidden: forbidden.length > 0 ? forbidden : fallbackPlan.forbidden
  };
}

function buildDraftSummaryFromPages(pages, chapterTitle = '') {
  const pageBodies = Array.isArray(pages)
    ? pages.map((page) => cleanText(page?.body, 1200)).filter(Boolean)
    : [];
  const source = pageBodies.join(' ');
  const fallback = chapterTitle ? `Resume du chapitre ${chapterTitle}.` : 'Resume du chapitre.';
  return summarizePlainText(source, 420) || fallback;
}

function normalizeGeneratedDraft(rawDraft, fallbackDraft, chapterTitle = '') {
  const resolvedTitle = cleanText(rawDraft?.title, 180)
    || cleanText(fallbackDraft?.title, 180)
    || cleanText(chapterTitle, 180)
    || 'Chapitre';
  const pages = ensureDraftPages(rawDraft?.pages, fallbackDraft?.pages, resolvedTitle);
  const summary = cleanText(rawDraft?.summary, 600)
    || buildDraftSummaryFromPages(pages, resolvedTitle)
    || cleanText(fallbackDraft?.summary, 600)
    || `Resume du chapitre ${resolvedTitle}.`;

  return {
    title: resolvedTitle,
    pages,
    summary
  };
}

function analyzeChapterDraftQuality(draft, sourcePayload, detailAnchors = []) {
  const pages = Array.isArray(draft?.pages) ? draft.pages : [];
  const bodies = pages.map((page) => cleanText(page?.body, 5000));
  const pageLengths = bodies.map((body) => body.length);
  const totalChars = pageLengths.reduce((sum, size) => sum + size, 0);
  const combinedText = bodies.join('\n\n');
  const comparableCombined = normalizeComparableText(combinedText);
  const issues = [];
  let score = 100;

  if (totalChars < CHAPTER_DRAFT_MIN_TOTAL_CHARS) {
    issues.push(`Texte global trop court (${totalChars} caracteres).`);
    score -= 24;
    if (totalChars < 2200) {
      score -= 12;
    }
  }

  const shortPages = pageLengths.filter((size) => size < CHAPTER_DRAFT_MIN_PAGE_CHARS).length;
  if (shortPages > 0) {
    issues.push(`${shortPages} page(s) restent trop peu developpees.`);
    score -= shortPages * 10;
  }

  const veryShortPages = pageLengths.filter((size) => size < 320).length;
  if (veryShortPages > 0) {
    issues.push(`${veryShortPages} page(s) sont tres courtes (<320 caracteres).`);
    score -= veryShortPages * 8;
  }

  const fillerMatches = CHAPTER_DRAFT_FILLER_PATTERNS.reduce(
    (count, pattern) => count + ((combinedText.match(pattern) || []).length),
    0
  );
  if (fillerMatches > 0) {
    issues.push(`Expressions generiques detectees (${fillerMatches}).`);
    score -= Math.min(24, fillerMatches * 4);
  }

  if (/(^|\n)\s*[-*]\s+/m.test(combinedText)) {
    issues.push('Listes a puces detectees dans le recit.');
    score -= 8;
  }

  const normalizedParagraphs = combinedText
    .split(/\n{2,}/)
    .map((paragraph) => normalizeComparableText(paragraph))
    .filter((paragraph) => paragraph.length >= 28);
  const duplicates = normalizedParagraphs.reduce((accumulator, paragraph) => {
    accumulator[paragraph] = (accumulator[paragraph] || 0) + 1;
    return accumulator;
  }, {});
  const duplicateCount = Object.values(duplicates).filter((count) => count > 1).length;
  if (duplicateCount > 0) {
    issues.push(`Repetitions detectees (${duplicateCount} paragraphe(s) redondant(s)).`);
    score -= Math.min(16, duplicateCount * 6);
  }

  const anchorFragments = (Array.isArray(detailAnchors) ? detailAnchors : [])
    .map((anchor) => normalizeComparableText(anchor)
      .split(' ')
      .filter((token) => token.length >= 4)
      .slice(0, 4)
      .join(' '))
    .filter((fragment, index, list) => fragment && list.indexOf(fragment) === index);
  const anchorHits = anchorFragments.filter((fragment) => comparableCombined.includes(fragment)).length;
  const requiredAnchorHits = anchorFragments.length >= 4 ? 2 : anchorFragments.length > 0 ? 1 : 0;
  if (requiredAnchorHits > 0 && anchorHits < requiredAnchorHits) {
    issues.push('Le recit ne reutilise pas assez de details concrets issus des contributions.');
    score -= (requiredAnchorHits - anchorHits) * 10;
  }

  const longWords = comparableCombined.split(' ').filter((token) => token.length >= 4);
  const lexicalRatio = longWords.length > 0
    ? (new Set(longWords)).size / longWords.length
    : 1;
  if (longWords.length >= 140 && lexicalRatio < 0.38) {
    issues.push('Lexique trop repetitif, manque de variete narrative.');
    score -= 10;
  }

  const normalizedScore = Math.max(0, Math.min(100, Math.round(score)));

  return {
    score: normalizedScore,
    issues,
    metrics: {
      totalChars,
      pageLengths,
      fillerMatches,
      duplicateCount,
      anchorHits,
      requiredAnchorHits,
      lexicalRatio: Number(lexicalRatio.toFixed(3))
    }
  };
}

function countWords(value = '') {
  return String(value || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .length;
}

function evaluateContributionsRichness(contributions = []) {
  const safeContributions = Array.isArray(contributions) ? contributions : [];
  const wordCounts = safeContributions.map((entry) => countWords(cleanText(entry?.response_text || '', 5000)));
  const longResponses = wordCounts.filter((count) => count >= 100).length;
  const shortResponses = wordCounts.filter((count) => count < 50).length;

  if (safeContributions.length >= 6 && longResponses >= 6) {
    return 'riche';
  }

  if (safeContributions.length < 3 || shortResponses >= safeContributions.length) {
    return 'faible';
  }

  return 'moyenne';
}

function buildChapterBodyPromptVariables({
  sourcePayload,
  chapterTitle = '',
  chapterSummary = ''
}) {
  const book = sourcePayload?.book || {};
  const config = sourcePayload?.config || {};
  const chapter = sourcePayload?.chapter || {};
  const organizerContribution = chapter?.organizerContribution || null;
  const guestContributions = Array.isArray(chapter?.guestContributions)
    ? chapter.guestContributions
    : [];

  const promptContributions = [];
  if (organizerContribution?.message) {
    promptContributions.push({
      name: cleanText(book.recipientName, 180) ? 'Organisateur' : 'Organisateur',
      role: 'organisateur',
      response_text: cleanText(organizerContribution.message, 5000)
    });
  }

  guestContributions.forEach((contribution) => {
    const responseText = cleanText(contribution?.message, 5000);
    if (!responseText) return;
    promptContributions.push({
      name: cleanText(contribution?.contributorName, 180) || 'Contributeur',
      role: cleanText(contribution?.role, 180) || 'proche',
      response_text: responseText
    });
  });

  const chapterPhotos = collectChapterPhotos({
    organizerContribution: organizerContribution
      ? { photoUrls: normalizePhotoUrls(organizerContribution.photoUrls) }
      : null,
    guestContributions
  }).slice(0, 24);
  const promptPhotos = chapterPhotos.map((url, index) => ({
    caption: `Photo ${index + 1}`,
    date: null,
    url
  }));

  const normalizedEventType = cleanText(config?.eventType || book.eventType, 160) || 'evenement';
  const normalizedEventSubtype = cleanText(config?.eventSubtype, 160) || '';
  const normalizedNarrativePerson = cleanText(config?.narrativePerson, 120) || 'third_person';
  const normalizedRecipientName = cleanText(book.recipientName, 160) || 'la personne celebree';
  const normalizedRecipientNickname = cleanText(config?.recipientNickname, 160) || '';
  const normalizedCharacterTrait = cleanText(config?.characterTrait, 220) || '';
  const normalizedSignatureAnecdote = cleanText(config?.signatureAnecdote, 500) || '';
  const normalizedSignaturePhrase = cleanText(config?.signaturePhrase, 220) || '';
  const normalizedFutureWish = cleanText(config?.futureWish, 320) || '';
  const normalizedChapterTitle = cleanText(chapterTitle || chapter.title, 180) || 'Chapitre';
  const normalizedChapterTheme = cleanText(chapter.description, 700) || normalizedChapterTitle || 'Souvenirs marquants';
  const normalizedChapterArc = cleanText(chapterSummary, 1200) || '';
  const normalizedChapterEmotion = cleanText(book.styleNarratif, 120) || 'intime';
  const normalizedBookTitle = cleanText(book.title, 180) || 'Livre souvenir';
  const normalizedBookTone = cleanText(book.styleNarratif, 120) || 'intime';
  const normalizedBookLocation = cleanText(book.location, 140) || '';
  const normalizedBookYear = cleanText(book.year, 40) || String(new Date().getFullYear());
  const normalizedRecipientAge = cleanText(book.recipientAge, 80) || 'non specifie';
  const normalizedPrevChapterTitle = cleanText(chapter.previousTitle, 180) || '';
  const normalizedNextChapterTitle = cleanText(chapter.nextTitle, 180) || '';
  const normalizedChapterAmorce = cleanText(chapter.amorceText, 320) || '';
  const normalizedChapterTriggers = Array.isArray(chapter.triggers)
    ? chapter.triggers.map((trigger) => cleanText(trigger, 80)).filter(Boolean)
    : [];
  const chapterIndex = Number(chapter.orderIndex || 0) + 1;
  const chapterTotal = Number(chapter.chapterTotal || sourcePayload?.book?.chapterTotal || 0) || 0;
  const contributionsCount = promptContributions.length;
  const contributionsRichness = evaluateContributionsRichness(promptContributions);
  const contributionsText = promptContributions
    .map((entry) => `${cleanText(entry?.name, 160) || 'Contributeur'} (${cleanText(entry?.role, 120) || 'proche'}) : ${cleanText(entry?.response_text, 700)}`)
    .filter(Boolean)
    .join('\n');
  const photosText = promptPhotos
    .map((entry) => cleanText([entry.caption, entry.date].filter(Boolean).join(' '), 160))
    .filter(Boolean)
    .join('\n');

  return {
    book_title: normalizedBookTitle,
    book_occasion: normalizedEventType,
    event_type: normalizedEventType,
    event_subtype: normalizedEventSubtype,
    narrative_person: normalizedNarrativePerson,
    recipient_name: normalizedRecipientName,
    recipient_nickname: normalizedRecipientNickname,
    recipient_age: normalizedRecipientAge,
    book_tone: normalizedBookTone,
    book_location: normalizedBookLocation,
    book_year: normalizedBookYear,
    chapter_total: chapterTotal,
    chapter_index: chapterIndex,
    chapter_title: normalizedChapterTitle,
    chapter_theme: normalizedChapterTheme,
    chapter_arc: normalizedChapterArc,
    chapter_emotion: normalizedChapterEmotion,
    prev_chapter_title: normalizedPrevChapterTitle,
    next_chapter_title: normalizedNextChapterTitle,
    character_trait: normalizedCharacterTrait,
    signature_anecdote: normalizedSignatureAnecdote,
    signature_phrase: normalizedSignaturePhrase,
    future_wish: normalizedFutureWish,
    chapter_amorce: normalizedChapterAmorce,
    chapter_triggers: normalizedChapterTriggers,
    contributions_count: contributionsCount,
    contributions_richness: contributionsRichness,
    contributions: promptContributions,
    photos: promptPhotos,
    contributions_text: contributionsText,
    contributionstext: contributionsText,
    contributionsText: contributionsText,
    photos_text: photosText,
    photostext: photosText,
    photosText: photosText,

    bookTitle: normalizedBookTitle,
    bookOccasion: normalizedEventType,
    eventType: normalizedEventType,
    eventSubtype: normalizedEventSubtype,
    narrativePerson: normalizedNarrativePerson,
    recipientName: normalizedRecipientName,
    recipientNickname: normalizedRecipientNickname,
    recipientAge: normalizedRecipientAge,
    bookTone: normalizedBookTone,
    bookLocation: normalizedBookLocation,
    bookYear: normalizedBookYear,
    chapterTotal: chapterTotal,
    chapterIndex: chapterIndex,
    chapterTitle: normalizedChapterTitle,
    chapterTheme: normalizedChapterTheme,
    chapterArc: normalizedChapterArc,
    chapterEmotion: normalizedChapterEmotion,
    prevChapterTitle: normalizedPrevChapterTitle,
    nextChapterTitle: normalizedNextChapterTitle,
    characterTrait: normalizedCharacterTrait,
    signatureAnecdote: normalizedSignatureAnecdote,
    signaturePhrase: normalizedSignaturePhrase,
    futureWish: normalizedFutureWish,
    chapterAmorce: normalizedChapterAmorce,
    chapterTriggers: normalizedChapterTriggers,
    contributionsCount: contributionsCount,
    contributionsRichness: contributionsRichness,
    contributionsText: contributionsText,
    photosText: photosText
  };
}

function buildDraftFromChapterSections({
  chapterTitle = '',
  sections = {},
  sourcePayload
}) {
  const openingText = cleanText(sections?.ouverture, 5000);
  const bodyText = cleanText(sections?.corps, 20000);
  const codaText = cleanText(sections?.coda, 5000);

  const mergedNarrative = [
    openingText,
    bodyText,
    codaText
  ].filter(Boolean).join('\n\n');

  const normalizedNarrative = sanitizeDraftBodyText(
    mergedNarrative,
    chapterTitle
  );
  const segmented = splitDraftBody(normalizedNarrative, {
    textDensity: 'balanced',
    previewFormat: 'standard',
    chapterTitle,
    segmentCount: CHAPTER_DRAFT_PAGE_COUNT
  });

  const pages = Array.from({ length: CHAPTER_DRAFT_PAGE_COUNT }, (_, index) => {
    const defaultTitle = index === 0
      ? 'Ouverture'
      : index === CHAPTER_DRAFT_PAGE_COUNT - 1
        ? 'Cloture'
        : `Mouvement ${index + 1}`;

    const pageBody = cleanText(segmented[index], 3200)
      || cleanText(segmented[index - 1], 3200)
      || cleanText(mergedNarrative, 3200);

    return {
      title: defaultTitle,
      body: pageBody || 'Contenu en cours de structuration.'
    };
  });

  const chapterFallback = buildFallbackChapterDraft(sourcePayload);
  const normalizedDraft = normalizeGeneratedDraft(
    {
      title: cleanText(chapterTitle, 180) || chapterFallback.title,
      summary: buildDraftSummaryFromPages(pages, chapterTitle),
      pages,
      ouverture: openingText,
      corps: bodyText,
      coda: codaText
    },
    chapterFallback,
    chapterTitle
  );
  return {
    ...normalizedDraft,
    sections: {
      ouverture: openingText,
      corps: bodyText,
      coda: codaText
    }
  };
}

async function generateStructuredDraftFromContentPrompt({
  sourcePayload,
  outputType = 'chapter_content',
  chapterTitle = '',
  chapterSummary = '',
  targetLength = 2400,
  temperature,
  maxTokens
}) {
  if (!aiService?.mistral) {
    return null;
  }

  try {
    const normalizedOutputType = cleanText(outputType, 'chapter_content').toLowerCase();
    if (normalizedOutputType !== 'chapter_content') {
      return null;
    }

    const resolvedChapterTitle = cleanText(chapterTitle || sourcePayload?.chapter?.title, 180) || 'Chapitre';
    const promptVariables = buildChapterBodyPromptVariables({
      sourcePayload,
      chapterTitle: resolvedChapterTitle,
      chapterSummary
    });
    const generationResult = await promptEngine.runPromptGeneration({
      promptType: 'chapter_body',
      variables: promptVariables,
      mistralClient: aiService.mistral,
      model: 'mistral-small-latest',
      temperature: Number.isFinite(Number(temperature)) ? Number(temperature) : undefined,
      maxTokens: Number.isFinite(Number(maxTokens)) ? Number(maxTokens) : undefined,
      maxRetries: 2
    });

    const raw = generationResult?.output || '';
    const sections = promptEngine.parseChapterBodyBlocks(raw);
    const parsedDraft = buildDraftFromChapterSections({
      chapterTitle: resolvedChapterTitle,
      sections,
      sourcePayload
    });

    return {
      raw,
      parsed: parsedDraft,
      sections,
      promptSource: 'database',
      promptVersion: generationResult?.template?.version || null,
      promptTemplateId: generationResult?.template?.id || null,
      promptValidation: generationResult?.validation || null
    };
  } catch (error) {
    console.error('Erreur prompt chapter_body (structured):', error);
    return null;
  }
}

async function generateChapterPlanFromAI(sourcePayload, fallbackDraft, detailAnchors = []) {
  return buildChapterPlanFallback(sourcePayload, fallbackDraft, detailAnchors);
}

async function maybeRegenerateChapterDraftForQuality({
  sourcePayload,
  chapterPlan,
  detailAnchors,
  candidateDraft,
  fallbackDraft,
  qualityReport
}) {
  void sourcePayload;
  void chapterPlan;
  void detailAnchors;
  void fallbackDraft;

  return {
    draft: candidateDraft,
    quality: qualityReport,
    improved: false
  };
}

async function generateChapterDraftFromAI(sourcePayload) {
  const fallbackDraft = buildFallbackChapterDraft(sourcePayload);
  const detailAnchors = extractDetailAnchorsFromSourcePayload(sourcePayload, 8);
  const chapterPlan = await generateChapterPlanFromAI(sourcePayload, fallbackDraft, detailAnchors);

  try {
    const modelResult = await generateStructuredDraftFromContentPrompt({
      sourcePayload,
      outputType: 'chapter_content',
      chapterTitle: sourcePayload?.chapter?.title || fallbackDraft?.title || 'Chapitre',
      chapterSummary: fallbackDraft?.summary || '',
      targetLength: CHAPTER_DRAFT_PAGE_COUNT * 900,
      temperature: 0.52,
      maxTokens: 4400
    });
    const parsed = modelResult?.parsed;

    if (!parsed || !Array.isArray(parsed.pages)) {
      return {
        ...fallbackDraft,
        plan: chapterPlan,
        quality: analyzeChapterDraftQuality(fallbackDraft, sourcePayload, detailAnchors),
        generationMode: 'fallback'
      };
    }

    const normalizedCandidateDraft = normalizeGeneratedDraft(
      parsed,
      fallbackDraft,
      sourcePayload?.chapter?.title || fallbackDraft.title
    );
    const candidateDraft = {
      ...normalizedCandidateDraft,
      sections: parsed?.sections && typeof parsed.sections === 'object'
        ? {
            ouverture: cleanText(parsed.sections.ouverture, 5000),
            corps: cleanText(parsed.sections.corps, 20000),
            coda: cleanText(parsed.sections.coda, 5000)
          }
        : null
    };
    const qualityReport = analyzeChapterDraftQuality(candidateDraft, sourcePayload, detailAnchors);
    const reviewOutcome = await maybeRegenerateChapterDraftForQuality({
      sourcePayload,
      chapterPlan,
      detailAnchors,
      candidateDraft,
      fallbackDraft,
      qualityReport
    });

    return {
      ...reviewOutcome.draft,
      plan: chapterPlan,
      quality: reviewOutcome.quality,
      sections: candidateDraft.sections || null,
      generationMode: reviewOutcome.improved ? 'plan_plus_revision' : 'single_pass_db_prompt',
      promptSource: modelResult?.promptSource || 'database',
      promptVersion: modelResult?.promptVersion || null,
      promptTemplateId: modelResult?.promptTemplateId || null,
      promptValidation: modelResult?.promptValidation || null
    };
  } catch (error) {
    console.error('Erreur IA brouillon chapitre:', error);
    return {
      ...fallbackDraft,
      plan: chapterPlan,
      quality: analyzeChapterDraftQuality(fallbackDraft, sourcePayload, detailAnchors),
      generationMode: 'fallback'
    };
  }
}

function buildFallbackChapterDraft(sourcePayload) {
  const chapter = sourcePayload.chapter || {};
  const recipientName = sourcePayload.book?.recipientName || 'la personne celebree';
  const amorceText = cleanText(chapter.amorceText, 320);
  const triggers = Array.isArray(chapter.triggers) ? chapter.triggers : [];
  const guestContributions = Array.isArray(chapter.guestContributions) ? chapter.guestContributions : [];
  const detailAnchors = extractDetailAnchorsFromSourcePayload(sourcePayload, 6);
  const organizerText = chapter.organizerContribution?.message || '';
  const chapterTitle = cleanText(chapter.title, 180) || 'Chapitre';
  const organizerParagraphs = splitTextToParagraphs(
    sanitizeDraftBodyText(organizerText, chapterTitle),
    5600,
    { preserveParagraphs: true }
  );
  const organizerPrimary = cleanText(organizerParagraphs[0] || organizerText, 1500);
  const organizerSecondary = cleanText(organizerParagraphs.slice(1).join(' '), 1800);
  const guestVoices = guestContributions
    .slice(0, 6)
    .map((contribution) => {
      const contributorName = cleanText(contribution.contributorName, 140) || 'Un proche';
      const contributionBody = cleanText(contribution.message, 700);
      if (!contributionBody) {
        return '';
      }
      return `${contributorName} : ${contributionBody}`;
    })
    .filter(Boolean);
  const guestVoicesPrimary = guestVoices.slice(0, 3).join('\n\n');
  const guestVoicesSecondary = guestVoices.slice(3, 6).join('\n\n');
  const hasFewGuestContributions = guestContributions.length < 2;
  const previousBridge = sourcePayload.previousChapterSummaries.length > 0
    ? `Fil narratif precedent : ${sourcePayload.previousChapterSummaries.slice(-1)[0].summary}`
    : `Le recit se concentre sur un moment fondateur autour de ${recipientName}.`;
  const projectIntent = sourcePayload.book?.aiProjectBrief
    ? `Intention editoriale : ${sourcePayload.book.aiProjectBrief}`
    : '';

  return {
    title: chapterTitle,
    pages: [
      {
        title: chapterTitle,
        body: [
          chapter.description || `Nous ouvrons sur ${chapterTitle} avec un angle concret et narratif.`,
          previousBridge,
          projectIntent,
          amorceText ? `Amorce du chapitre : ${amorceText}` : '',
          triggers.length > 0 ? `Mots declencheurs : ${triggers.slice(0, 4).join(' | ')}` : '',
          detailAnchors.length > 0 ? `Details a faire vivre : ${detailAnchors.slice(0, 2).join(' | ')}` : ''
        ].filter(Boolean).join('\n\n')
      },
      {
        title: 'Le moment qui lance tout',
        body: organizerPrimary
          || `La narration principale s appuie sur une scene precise autour de ${recipientName}: qui etait la, ce qui a ete dit, et ce qui a ete ressenti.`
      },
      {
        title: hasFewGuestContributions ? 'Votre regard en lumiere' : 'La voix de l organisateur',
        body: [
          organizerPrimary,
          organizerSecondary
        ].filter(Boolean).join('\n\n') || `Le regard de l organisateur doit installer la tonalite et le rythme de ${chapterTitle}.`
      },
      {
        title: 'Vos proches ont dit...',
        body: [
          guestVoicesPrimary,
          guestVoicesPrimary
            ? ''
            : 'Vos proches ont dit... leurs regards seront integres ici au fur et a mesure des validations.'
        ].filter(Boolean).join('\n\n')
      },
      {
        title: 'Les details qui restent',
        body: [
          detailAnchors.length > 0 ? `Details saillants : ${detailAnchors.slice(0, 3).join(' | ')}` : '',
          cleanText(chapter.description, 520),
          `La narration doit rester concrete, situee et sensorielle, sans generalites.`
        ].filter(Boolean).join('\n\n')
      },
      {
        title: 'Galerie narrative',
        body: [
          organizerSecondary || organizerPrimary,
          detailAnchors.length > 3 ? `A prolonger avec : ${detailAnchors.slice(3, 6).join(' | ')}` : ''
        ].filter(Boolean).join('\n\n') || `Cette page accueille un tempo plus visuel et des respirations narratives.`
      },
      {
        title: 'Vos proches ont dit... (suite)',
        body: guestVoicesSecondary || (
          hasFewGuestContributions
            ? 'La suite des retours de proches prendra place ici quand de nouvelles contributions seront validees.'
            : 'Les retours complementaires des proches sont integres ici pour enrichir le regard croise.'
        )
      },
      {
        title: 'Clore la sequence',
        body: [
          `La cloture doit laisser une image nette et memorisable, dans une tonalite ${sourcePayload.book?.styleNarratif || 'sensible'}.`,
          detailAnchors.length > 2 ? `Derniers rappels concrets : ${detailAnchors.slice(2, 4).join(' | ')}` : '',
          chapter.stats?.respondedCount
            ? `${chapter.stats.respondedCount} contribution(s) validee(s) nourrissent deja ce brouillon.`
            : 'Le chapitre peut encore gagner en relief avec quelques scenes precises supplementaires.'
        ].filter(Boolean).join('\n\n')
      }
    ],
    summary: summarizePlainText([
      chapter.description,
      organizerText,
      guestContributions[0]?.message
    ].filter(Boolean).join(' '), 420) || `Resume du chapitre ${chapter.title || 'en cours'}.`
  };
}

function ensureDraftPages(pages, fallbackPages, chapterTitle = '') {
  const safePages = Array.isArray(pages) ? pages : [];
  const fallback = Array.isArray(fallbackPages) ? fallbackPages : [];
  const normalizedPages = [];
  const baseTitle = cleanText(chapterTitle, 180) || 'Chapitre';

  for (let index = 0; index < CHAPTER_DRAFT_PAGE_COUNT; index += 1) {
    const currentPage = safePages[index] || fallback[index] || {};
    const fallbackPage = fallback[index] || {};
    const pageTitle = sanitizeDraftHeadingStrict(
      cleanText(currentPage.title, 180)
      || cleanText(fallbackPage.title, 180)
      || (index === 0 ? baseTitle : `Volet ${index + 1}`),
      index === 0 ? baseTitle : `Volet ${index + 1}`
    );
    const pageBody = cleanText(
      sanitizeDraftBodyText(
        currentPage.body || fallbackPage.body || 'Contenu a enrichir.',
        baseTitle
      ),
      4200
    ) || cleanText(
      sanitizeDraftBodyText(fallbackPage.body || 'Contenu a enrichir.', baseTitle),
      4200
    ) || 'Contenu a enrichir.';

    normalizedPages.push({
      title: pageTitle,
      body: pageBody
    });
  }

  return normalizedPages;
}

function sanitizeDraftHeading(value, fallback = '') {
  const raw = cleanText(value, 180);
  if (!raw) {
    return cleanText(fallback, 180) || '';
  }

  const trimmed = raw
    .replace(/^chapitre\s*\d+\s*[-:–]\s*/i, '')
    .replace(/^page\s*\d+\s*[-:–]\s*/i, '')
    .trim();

  return trimmed || cleanText(fallback, 180) || raw;
}

function sanitizeDraftHeadingStrict(value, fallback = '') {
  const base = sanitizeDraftHeading(value, fallback);
  if (!base) {
    return cleanText(fallback, 180) || '';
  }

  const cleaned = base
    .replace(/^\s*page\s*\d+\s*[-:–—]*\s*/i, '')
    .replace(/^\s*chapitre\s*\d+\s*[-:–—]*\s*/i, '')
    .replace(/^\s*(?:page\s*\d+\s*)?(?:chapitre\s*\d+\s*)+/i, '')
    .trim();

  return cleaned || cleanText(fallback, 180) || base;
}

function sanitizeDraftBodyText(value, chapterTitle = '') {
  const raw = String(value || '').replace(/\r\n/g, '\n').trim();
  if (!raw) {
    return '';
  }

  const comparableTitle = normalizeComparableText(chapterTitle);
  const lines = raw.split('\n');
  let removed = 0;
  let cursor = 0;

  while (cursor < lines.length && removed < 3) {
    const current = String(lines[cursor] || '').trim();
    if (!current) {
      cursor += 1;
      continue;
    }

    const comparableCurrent = normalizeComparableText(current);
    const looksLikePageMarker = (
      /^page\s*\d+$/i.test(current)
      || /^chapitre\s*\d+$/i.test(current)
      || /^page\s*\d+\s*[-:–—]/i.test(current)
      || /^chapitre\s*\d+\s*[-:–—]/i.test(current)
      || /^\s*(?:page\s*\d+\s*)?(?:chapitre\s*\d+\s*)+/i.test(current)
    );
    const duplicatesChapterTitle = Boolean(comparableTitle && comparableCurrent && comparableCurrent === comparableTitle);

    if (looksLikePageMarker || duplicatesChapterTitle) {
      lines.splice(cursor, 1);
      removed += 1;
      continue;
    }

    break;
  }

  return lines.join('\n').trim();
}

function normalizeComparableText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function sanitizeOpeningLead(value, chapterTitle) {
  const raw = cleanText(value, 700);
  if (!raw) {
    return '';
  }
  const comparableRaw = normalizeComparableText(raw);
  const comparableTitle = normalizeComparableText(chapterTitle);

  if (!comparableRaw) {
    return '';
  }
  if (comparableRaw.startsWith('chapitre ')) {
    return '';
  }
  if (comparableTitle && comparableRaw === comparableTitle) {
    return '';
  }
  if (comparableTitle && comparableRaw.startsWith(`${comparableTitle} `)) {
    return '';
  }

  return raw;
}

function formatFolioNumber(value) {
  const safeNumber = Number.isFinite(Number(value)) ? Math.max(1, Number(value)) : 1;
  return String(Math.floor(safeNumber)).padStart(2, '0');
}

function toRomanNumeral(value) {
  const safeValue = Math.max(1, Math.floor(Number(value) || 1));
  const numerals = [
    ['M', 1000],
    ['CM', 900],
    ['D', 500],
    ['CD', 400],
    ['C', 100],
    ['XC', 90],
    ['L', 50],
    ['XL', 40],
    ['X', 10],
    ['IX', 9],
    ['V', 5],
    ['IV', 4],
    ['I', 1]
  ];
  let remaining = safeValue;
  let output = '';

  numerals.forEach(([token, amount]) => {
    while (remaining >= amount) {
      output += token;
      remaining -= amount;
    }
  });

  return output || String(safeValue);
}

function renderDraftPageFolio({ pageNumber, totalPages }) {
  const safePage = formatFolioNumber(pageNumber);
  const safeTotal = formatFolioNumber(totalPages || CHAPTER_DRAFT_PAGE_COUNT);
  return `
    <div class="draft-book-folio" aria-hidden="true">
      <span class="draft-book-folio-value">${safePage}</span>
      <span class="draft-book-folio-dot"></span>
      <span class="draft-book-folio-value">${safeTotal}</span>
    </div>
  `;
}

function renderChapterDraftPreviewHtml({ book, chapter, draft, sourcePayload }) {
  const chapterNumber = Number(chapter?.order_index || 0) + 1;
  const chapterHeading = sanitizeDraftHeadingStrict(
    draft.title || chapter?.title || `Volet ${chapterNumber}`,
    chapter?.title || `Volet ${chapterNumber}`
  );
  const openingLead = sanitizeOpeningLead(sourcePayload?.chapter?.description, chapterHeading);
  const resolvedPreviewFormat = resolveBookPreviewFormat(book);
  const normalizedLayoutSettings = normalizePreviewLayoutSettings(
    book?.cover_config?.previewLayoutSettings,
    resolvedPreviewFormat
  );
  const imageProfile = PREVIEW_IMAGE_DENSITY_PROFILES[normalizedLayoutSettings.imageDensity];
  const pageBudget = getPreviewPageTextBudget(
    normalizedLayoutSettings.textDensity,
    resolvedPreviewFormat
  );
  const allPhotos = Array.isArray(sourcePayload?.chapter?.photoUrls)
    ? sourcePayload.chapter.photoUrls
    : [];
  const visiblePhotos = allPhotos.slice(0, imageProfile.maxPhotos);
  const heroPhotoUrl = imageProfile.showHero ? (visiblePhotos[0] || '') : '';
  const galleryPhotos = heroPhotoUrl ? visiblePhotos.slice(1) : visiblePhotos;
  const guestHighlights = Array.isArray(sourcePayload?.chapter?.guestContributions)
    ? sourcePayload.chapter.guestContributions.slice(0, Math.max(1, pageBudget.guestItems))
    : [];
  const fallbackPages = [{
    title: chapterHeading,
    body: cleanText(draft?.body || '', pageBudget.pageBodyChars)
  }];
  const draftPages = ensureDraftPages(
    Array.isArray(draft?.pages) ? draft.pages : [],
    fallbackPages,
    chapterHeading
  );
  const totalPages = draftPages.length;
  const chapterRoman = toRomanNumeral(chapterNumber);
  const chapterSub = cleanText(sourcePayload?.chapter?.description, 170);

  return `
    <section class="draft-book-chapter" lang="fr">
      <div class="draft-book-chapter-shell">
        ${draftPages.map((page, index) => `
          <section class="draft-book-page${index === 0 ? ' draft-book-page-opening' : ''}${index === 5 ? ' draft-book-page-gallery' : ''}">
            ${(() => {
              const pageHeading = sanitizeDraftHeadingStrict(page.title || chapterHeading, chapterHeading);
              const showHeading = (
                index === 0
                || (
                  normalizeComparableText(pageHeading)
                  && normalizeComparableText(pageHeading) !== normalizeComparableText(chapterHeading)
                )
              );
              if (!showHeading) {
                return '';
              }
              if (index === 0) {
                return `
                  <header class="chapter-opening">
                    <p class="chapter-num">Chapitre ${escapeHtml(chapterRoman)}</p>
                    <h3 class="chapter-title">${escapeHtml(pageHeading)}</h3>
                    ${chapterSub ? `<p class="chapter-sub">${escapeHtml(chapterSub)}</p>` : ''}
                    <hr class="chapter-rule" />
                  </header>
                `;
              }
              return `<h3 class="chapter-title">${escapeHtml(pageHeading)}</h3>`;
            })()}
            ${index === 0 && openingLead
              ? `<p class="draft-book-intro">${escapeHtml(openingLead)}</p>`
              : ''}
            <div class="draft-book-body">
              ${formatParagraphs(cleanText(
                sanitizeDraftBodyText(page.body || '', chapterHeading),
                index === 5 ? pageBudget.pageTailChars : pageBudget.pageBodyChars
              ))}
            </div>
            ${index === 0 ? renderAmorcePrompt(sourcePayload?.chapter?.amorceText, sourcePayload?.chapter?.triggers, {
              maxItems: pageBudget.questionItems,
              maxCharsPerItem: pageBudget.questionChars
            }) : ''}
            ${index === 3 && heroPhotoUrl ? renderInlineHeroPhoto(heroPhotoUrl, chapterHeading) : ''}
            ${index === 2 ? renderContributionSpotlight(sourcePayload?.chapter?.organizerContribution, guestHighlights, {
              heading: 'Votre contribution en lumiere',
              organizerMaxChars: pageBudget.organizerChars,
              guestMaxChars: pageBudget.guestChars,
              maxGuestHighlights: Math.max(1, Math.ceil(pageBudget.guestItems / 2)),
              preferOrganizer: true
            }) : ''}
            ${index === 5 ? renderPhotoGallery(galleryPhotos, { columns: imageProfile.galleryColumns }) : ''}
            ${index === 6 ? renderContributionSpotlight(sourcePayload?.chapter?.organizerContribution, guestHighlights, {
              heading: 'Vos proches ont dit...',
              organizerMaxChars: Math.round(pageBudget.organizerChars * 0.45),
              guestMaxChars: pageBudget.guestChars,
              maxGuestHighlights: Math.max(1, pageBudget.guestItems),
              preferGuests: true
            }) : ''}
            ${renderDraftPageFolio({ pageNumber: index + 1, totalPages })}
          </section>
        `).join('')}
      </div>
    </section>
  `;
}

function extractClassHtmlBlocks(html, tagName, className) {
  if (!html || !tagName || !className) {
    return [];
  }

  const safeTag = String(tagName).replace(/[^a-z0-9]/gi, '');
  const safeClass = String(className).replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
  const matcher = new RegExp(
    `<${safeTag}[^>]*class="[^"]*\\b${safeClass}\\b[^"]*"[^>]*>([\\s\\S]*?)<\\/${safeTag}>`,
    'gi'
  );
  const blocks = [];
  let match = matcher.exec(String(html));
  while (match) {
    blocks.push(match[1] || '');
    match = matcher.exec(String(html));
  }
  return blocks;
}

function extractTagHtmlBlocks(html, tagName) {
  if (!html || !tagName) {
    return [];
  }

  const safeTag = String(tagName).replace(/[^a-z0-9]/gi, '');
  const matcher = new RegExp(`<${safeTag}[^>]*>([\\s\\S]*?)<\\/${safeTag}>`, 'gi');
  const blocks = [];
  let match = matcher.exec(String(html));
  while (match) {
    blocks.push(match[1] || '');
    match = matcher.exec(String(html));
  }
  return blocks;
}

function decodeHtmlEntities(value) {
  return String(value || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function stripHtmlToPlainText(html, maxLength = 4800) {
  if (!html) {
    return '';
  }

  const normalized = decodeHtmlEntities(
    String(html)
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<\/div>/gi, '\n\n')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (!normalized) {
    return '';
  }

  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength).trim()}...`
    : normalized;
}

function extractDraftNarrativeFromHtml(html) {
  const safeHtml = normalizeDraftHtml(html);
  if (!safeHtml) {
    return {
      intro: '',
      body: '',
      closing: ''
    };
  }

  const intro = stripHtmlToPlainText(
    extractClassHtmlBlocks(safeHtml, 'p', 'draft-book-intro')[0] || '',
    1200
  );
  const closing = stripHtmlToPlainText(
    extractClassHtmlBlocks(safeHtml, 'p', 'draft-book-closing')[0] || '',
    1200
  );
  const bodyBlocks = extractClassHtmlBlocks(safeHtml, 'div', 'draft-book-body');
  const bodyText = bodyBlocks
    .flatMap((blockHtml) => {
      const paragraphBlocks = extractTagHtmlBlocks(blockHtml, 'p');
      if (paragraphBlocks.length > 0) {
        return paragraphBlocks.map((paragraphHtml) => stripHtmlToPlainText(paragraphHtml, 1800));
      }
      return [stripHtmlToPlainText(blockHtml, 2400)];
    })
    .filter(Boolean)
    .join('\n\n');

  if (!bodyText) {
    return {
      intro,
      body: stripHtmlToPlainText(safeHtml, 7600),
      closing
    };
  }

  return {
    intro,
    body: bodyText,
    closing
  };
}

function buildPreviewSourceChapter(chapter) {
  const chapterContributions = Array.isArray(chapter?.contributions) ? chapter.contributions : [];
  const chapterInvites = Array.isArray(chapter?.chapter_invites) ? chapter.chapter_invites : [];
  const retainedContributions = chapterContributions
    .filter((contribution) => {
      const normalizedEmail = normalizeEmail(contribution?.contributor_email);
      return (
        normalizedEmail &&
        normalizedEmail !== CHAPTER_STATE_EMAIL &&
        normalizedEmail !== CHAPTER_DRAFT_EMAIL &&
        contribution.approved === true &&
        contribution.is_finalized !== false &&
        !contribution.needs_revision
      );
    })
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  const organizerRow = retainedContributions[0] || null;
  const guestRows = retainedContributions.slice(1);

  return {
    title: cleanText(chapter?.title, 180) || 'Chapitre',
    description: cleanText(chapter?.description, 700),
    amorceText: cleanText(chapter?.amorce_text, 320),
    triggers: Array.isArray(chapter?.triggers)
      ? chapter.triggers.map((trigger) => cleanText(trigger, 80)).filter(Boolean)
      : [],
    organizerContribution: organizerRow
      ? {
          message: cleanText(organizerRow.message, 3200),
          photoUrls: normalizePhotoUrls(organizerRow.photo_urls)
        }
      : null,
    guestContributions: guestRows.map((contribution) => ({
      contributorName: cleanText(contribution.contributor_name, 180)
        || cleanText(normalizeEmail(contribution.contributor_email).split('@')[0], 180)
        || 'Contributeur',
      message: cleanText(contribution.message, 2400),
      photoUrls: normalizePhotoUrls(contribution.photo_urls)
    })),
    stats: {
      invitedCount: chapterInvites.length,
      respondedCount: chapterInvites.filter((invite) => invite.accepted || invite.contributed).length
    }
  };
}

function buildChapterNarrativeForPreview({ chapter, draft, sourceChapter }) {
  const extracted = extractDraftNarrativeFromHtml(draft?.html || '');
  const fallbackBody = buildChapterBodyFallback(sourceChapter);
  const resolvedBody = extracted.body || fallbackBody;

  return {
    title: cleanText(draft?.title, 180) || cleanText(chapter?.title, 180) || sourceChapter.title || 'Chapitre',
    intro: extracted.intro || sourceChapter.description || '',
    body: cleanText(resolvedBody, 10000),
    closing: extracted.closing || ''
  };
}

function renderValidatedBookPreviewHtml({
  book,
  chaptersWithDrafts,
  frameTexts = null,
  previewFormat,
  previewLayoutSettings
}) {
  const resolvedPreviewFormat = resolveBookPreviewFormat(book, previewFormat);
  const previewFormatClass = `draft-book-format-${resolvedPreviewFormat}`;
  const layoutClass = buildPreviewLayoutClassName(previewLayoutSettings, resolvedPreviewFormat);
  const layoutStyle = buildPreviewLayoutInlineStyle(previewLayoutSettings, resolvedPreviewFormat);
  const normalizedLayoutSettings = normalizePreviewLayoutSettings(previewLayoutSettings, resolvedPreviewFormat);
  const chapterBlocks = (chaptersWithDrafts || [])
    .map(({ chapter, draft }, index) => {
      const sourceChapter = buildPreviewSourceChapter(chapter);
      const chapterNarrative = buildChapterNarrativeForPreview({
        chapter,
        draft,
        sourceChapter
      });

      return renderDraftChapterPages({
        chapter: chapterNarrative,
        sourceChapter,
        index,
        layoutSettings: normalizedLayoutSettings,
        previewFormat: resolvedPreviewFormat
      });
    })
    .join('');
  const frontCoverBlock = renderAssembledFrontCover(book);
  const backCoverBlock = renderAssembledBackCover(book);
  const chaptersContent = chapterBlocks
    || '<section class="draft-book-section"><p class="draft-book-empty">Aucun chapitre valide.</p></section>';

  return `
    <article class="draft-book draft-book-assembled ${previewFormatClass} ${layoutClass}" data-preview-format="${resolvedPreviewFormat}" style="${escapeHtml(layoutStyle)}">
      ${frontCoverBlock}
      ${renderBookFramePreviewSection({
        title: 'Introduction',
        content: frameTexts?.introduction || ''
      })}
      ${chaptersContent}
      ${renderBookFramePreviewSection({
        title: 'Conclusion',
        content: frameTexts?.conclusion || ''
      })}
      ${backCoverBlock}
    </article>
  `;
}

function renderBookFramePreviewSection({ title = '', content = '' } = {}) {
  const normalizedTitle = cleanText(title, 120);
  const normalizedContent = cleanText(content, 4200);
  if (!normalizedTitle || !normalizedContent) {
    return '';
  }

  return `
    <section class="draft-book-section draft-book-section-frame">
      <h2>${escapeHtml(normalizedTitle)}</h2>
      ${formatParagraphs(normalizedContent)}
    </section>
  `;
}

function renderAssembledFrontCover(book) {
  const {
    styleId,
    styleTag,
    styleDefaults,
    frontBg,
    textColor,
    accentColor,
    titleFont,
    bodyFont,
    coverConfig
  } = resolveCoverPreviewConfig(book);
  const title = cleanText(coverConfig.title, 180) || cleanText(book?.title, 180) || 'Livre souvenir';
  const subtitle = cleanText(coverConfig.subtitle, 220);
  const recipientLine = cleanText(coverConfig.recipientLine, 180) || cleanText(book?.recipient_name, 180);
  const eventLine = cleanText(coverConfig.eventLine, 180)
    || [
      cleanText(book?.event_type, 120),
      book?.recipient_age ? `${book.recipient_age} ans` : ''
    ].filter(Boolean).join(' | ');
  const motif = cleanText(coverConfig.motif, 30) || cleanText(styleDefaults.frontMotif, 30) || 'line';
  const showMonogram = Boolean(
    coverConfig.showMonogram ?? styleDefaults.frontShowMonogram ?? true
  );
  const showPhotoFrame = Boolean(
    coverConfig.showPhotoFrame ?? styleDefaults.frontShowPhotoFrame
  );
  const photoLabel = cleanText(coverConfig.photoLabel, 120)
    || cleanText(styleDefaults.frontPhotoLabel, 120)
    || 'Photo';
  const monogram = buildCoverMonogram(recipientLine || title);
  const oliveMotifHtml = `
    <div class="cover-preview-motif-olive" aria-hidden="true">
      <svg viewBox="0 0 140 120" role="presentation" focusable="false">
        <path d="M24 92 C40 48, 74 20, 122 16 C104 64, 72 96, 30 104 Z"></path>
        <path d="M31 100 C55 80, 76 58, 95 30" class="olive-vein"></path>
        <ellipse cx="60" cy="76" rx="8" ry="4" class="olive-fruit"></ellipse>
        <ellipse cx="74" cy="62" rx="7" ry="3.5" class="olive-fruit"></ellipse>
      </svg>
    </div>
  `;

  return `
    <section class="draft-book-section draft-book-section-cover draft-book-section-cover-front is-full-bleed">
      <div class="cover-preview-spread is-single-face is-book-page">
        <article
          class="cover-preview-card is-front cover-style-${styleId} is-active is-page-fill"
          style="--cover-bg:${escapeHtml(frontBg)};--cover-text:${escapeHtml(textColor)};--cover-accent:${escapeHtml(accentColor)};--cover-title-font:${escapeHtml(titleFont)};--cover-body-font:${escapeHtml(bodyFont)};"
        >
          <div class="cover-preview-safe-zone"></div>
          <div class="cover-preview-tag">${escapeHtml(styleTag)}</div>
          ${showMonogram ? `<div class="cover-preview-monogram">${escapeHtml(monogram)}</div>` : ''}
          ${showPhotoFrame ? `
            <div class="cover-preview-front-photo">
              <div class="cover-preview-front-photo-inner">${escapeHtml(photoLabel)}</div>
            </div>
          ` : ''}
          <div class="cover-preview-front-copy">
            ${eventLine ? `<div class="cover-preview-front-event">${escapeHtml(eventLine)}</div>` : ''}
            <h3>${escapeHtml(title)}</h3>
            ${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ''}
            ${recipientLine ? `<div class="cover-preview-front-recipient">${escapeHtml(recipientLine)}</div>` : ''}
          </div>
          ${motif === 'line' ? '<div class="cover-preview-motif-line" aria-hidden="true"></div>' : ''}
          ${motif === 'corner' ? '<div class="cover-preview-motif-corner" aria-hidden="true"></div>' : ''}
          ${motif === 'olive_leaf' ? oliveMotifHtml : ''}
        </article>
      </div>
    </section>
  `;
}

function renderAssembledBackCover(book) {
  const {
    styleId,
    styleDefaults,
    backBg,
    textColor,
    accentColor,
    titleFont,
    bodyFont,
    backCoverConfig
  } = resolveCoverPreviewConfig(book);
  const blurb = cleanText(backCoverConfig.blurb, 1800);
  const quote = cleanText(backCoverConfig.quote, 420);
  const signature = cleanText(backCoverConfig.signature, 180)
    || (book?.recipient_name ? `Les proches de ${book.recipient_name}` : 'Les proches');
  const showContributors = Boolean(
    backCoverConfig.show_contributors
    ?? backCoverConfig.showContributors
    ?? styleDefaults.backShowContributors
  );
  const showQrHint = Boolean(backCoverConfig.showQrHint ?? styleDefaults.backShowQrHint);
  const contributorsLine = cleanText(backCoverConfig.contributorsLine, 220)
    || cleanText(styleDefaults.backContributorsLine, 220)
    || 'Contributions collectives';
  const dateLocation = cleanText(backCoverConfig.dateLocation, 180)
    || cleanText(styleDefaults.backDateLocation, 180);
  const organizerLine = cleanText(backCoverConfig.organizerLine, 220)
    || cleanText(styleDefaults.backOrganizerLine, 220);
  const isbnCode = cleanText(backCoverConfig.isbnCode, 60)
    || cleanText(styleDefaults.backIsbn, 60);

  return `
    <section class="draft-book-section draft-book-section-cover draft-book-section-cover-back is-full-bleed">
      <div class="cover-preview-spread is-single-face is-book-page">
        <article
          class="cover-preview-card is-back cover-style-${styleId} is-active is-page-fill"
          style="--cover-bg:${escapeHtml(backBg)};--cover-text:${escapeHtml(textColor)};--cover-accent:${escapeHtml(accentColor)};--cover-title-font:${escapeHtml(titleFont)};--cover-body-font:${escapeHtml(bodyFont)};"
        >
          <div class="cover-preview-safe-zone"></div>
          <div class="cover-preview-back-copy">
            ${formatParagraphs(blurb || 'Texte de quatrieme de couverture a definir.')}
          </div>
          ${quote ? `<blockquote class="cover-preview-back-quote">"${escapeHtml(quote)}"</blockquote>` : ''}
          ${organizerLine ? `<div class="cover-preview-back-organizer">${escapeHtml(organizerLine)}</div>` : ''}
          ${(showContributors || showQrHint) ? `
            <div class="cover-preview-back-footer">
              ${showContributors ? `<div class="cover-preview-chip">${escapeHtml(contributorsLine)}</div>` : '<span></span>'}
              ${showQrHint ? '<div class="cover-preview-qr">QR</div>' : ''}
            </div>
          ` : ''}
          ${dateLocation ? `<div class="cover-preview-back-date">${escapeHtml(dateLocation)}</div>` : ''}
          ${styleId === 'artistique_poetique' ? '<div class="cover-preview-note-zone">Mot manuscrit personnel</div>' : ''}
          ${isbnCode ? `<div class="cover-preview-back-isbn">${escapeHtml(isbnCode)}</div>` : ''}
          <div class="cover-preview-back-signature">${escapeHtml(signature)}</div>
        </article>
      </div>
    </section>
  `;
}

function buildCoverMonogram(value) {
  const words = cleanText(value, 80)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  if (words.length === 0) {
    return 'LB';
  }

  return words.map((word) => word.charAt(0).toUpperCase()).join('');
}

function resolveCoverPreviewConfig(book) {
  const coverConfig = book?.cover_config && typeof book.cover_config === 'object'
    ? book.cover_config
    : {};
  const backCoverConfig = book?.back_cover_config && typeof book.back_cover_config === 'object'
    ? book.back_cover_config
    : {};

  const styleAliases = {
    editorial_classic: 'elegance_intemporelle',
    minimal_contemporary: 'modernite_minimaliste',
    heritage_emotion: 'retro_chic'
  };
  const stylePresets = {
    elegance_intemporelle: {
      id: 'elegance_intemporelle',
      tag: 'Elegance intemporelle',
      titleFont: "'Cormorant Garamond', 'Baskerville', serif",
      bodyFont: "'Inter', sans-serif",
      palette: {
        front: '#f7f1e8',
        back: '#eee4d6',
        text: '#1f2228',
        accent: '#b8924a'
      },
      defaults: {
        frontMotif: 'line',
        frontShowMonogram: true,
        frontShowPhotoFrame: false,
        frontPhotoLabel: 'Motif signature',
        backShowContributors: false,
        backShowQrHint: true,
        backContributorsLine: '',
        backDateLocation: '',
        backOrganizerLine: '',
        backIsbn: 'ISBN 978-2-00000-000-0'
      }
    },
    modernite_minimaliste: {
      id: 'modernite_minimaliste',
      tag: 'Collection moderne',
      titleFont: "'Avenir Next', 'Inter', sans-serif",
      bodyFont: "'Inter', sans-serif",
      palette: {
        front: '#14161a',
        back: '#111318',
        text: '#f4f6fa',
        accent: '#c8d0dc'
      },
      defaults: {
        frontMotif: 'none',
        frontShowMonogram: false,
        frontShowPhotoFrame: true,
        frontPhotoLabel: 'Portrait noir et blanc',
        backShowContributors: true,
        backShowQrHint: true,
        backContributorsLine: 'Contributeurs : famille et amis',
        backDateLocation: '',
        backOrganizerLine: '',
        backIsbn: ''
      }
    },
    retro_chic: {
      id: 'retro_chic',
      tag: 'Collection heritage',
      titleFont: "'Garamond', 'Times New Roman', serif",
      bodyFont: "'Inter', sans-serif",
      palette: {
        front: '#f2e6d8',
        back: '#eadac8',
        text: '#3a2e27',
        accent: '#a26d55'
      },
      defaults: {
        frontMotif: 'corner',
        frontShowMonogram: false,
        frontShowPhotoFrame: true,
        frontPhotoLabel: 'Photo archive',
        backShowContributors: false,
        backShowQrHint: false,
        backContributorsLine: 'Souvenirs choisis par ses proches',
        backDateLocation: '',
        backOrganizerLine: '',
        backIsbn: ''
      }
    },
    prestige_contemporain: {
      id: 'prestige_contemporain',
      tag: 'Edition maison prestige',
      titleFont: "'Cinzel', 'Baskerville', serif",
      bodyFont: "'Inter', sans-serif",
      palette: {
        front: '#2f2432',
        back: '#2a1f2d',
        text: '#f2eadf',
        accent: '#c8a25f'
      },
      defaults: {
        frontMotif: 'none',
        frontShowMonogram: true,
        frontShowPhotoFrame: false,
        frontPhotoLabel: '',
        backShowContributors: false,
        backShowQrHint: true,
        backContributorsLine: '',
        backDateLocation: '',
        backOrganizerLine: 'Un livre unique pour une personne unique',
        backIsbn: ''
      }
    },
    artistique_poetique: {
      id: 'artistique_poetique',
      tag: 'Edition atelier',
      titleFont: "'Playfair Display', 'Baskerville', serif",
      bodyFont: "'Inter', sans-serif",
      palette: {
        front: '#edf1f7',
        back: '#e9eef7',
        text: '#243246',
        accent: '#7890b0'
      },
      defaults: {
        frontMotif: 'none',
        frontShowMonogram: false,
        frontShowPhotoFrame: false,
        frontPhotoLabel: '',
        backShowContributors: true,
        backShowQrHint: false,
        backContributorsLine: '',
        backDateLocation: '',
        backOrganizerLine: 'Contributions reunies par l organisateur',
        backIsbn: 'ISBN 978-2-99999-999-9'
      }
    }
  };

  const requestedStyleId = cleanText(coverConfig.template || backCoverConfig.template, 80);
  const canonicalStyleId = styleAliases[requestedStyleId] || requestedStyleId;
  const style = stylePresets[canonicalStyleId] || stylePresets.elegance_intemporelle;
  const palette = style.palette;
  const frontBg = sanitizeCssValue(coverConfig.color, palette.front);
  const backBg = sanitizeCssValue(backCoverConfig.color, palette.back);
  const textColor = sanitizeCssValue(coverConfig.textColor || backCoverConfig.textColor, palette.text);
  const accentColor = sanitizeCssValue(coverConfig.accentColor || backCoverConfig.accentColor, palette.accent);
  const titleFont = sanitizeCssFont(coverConfig.font, style.titleFont);
  const bodyFont = sanitizeCssFont(backCoverConfig.font, style.bodyFont);

  return {
    styleId: style.id,
    styleTag: style.tag,
    styleDefaults: style.defaults || {},
    frontBg,
    backBg,
    textColor,
    accentColor,
    titleFont,
    bodyFont,
    coverConfig,
    backCoverConfig
  };
}

function createPdfExportJobId() {
  return crypto.randomBytes(10).toString('hex');
}

function getOwnedPdfExportJob({ jobId, bookId, ownerId }) {
  const job = pdfExportJobs.get(jobId);
  if (!job) {
    return null;
  }

  if (String(job.bookId) !== String(bookId)) {
    return null;
  }

  if (String(job.ownerId) !== String(ownerId)) {
    return null;
  }

  return job;
}

function findLatestOwnedPdfExportJob({ bookId, ownerId }) {
  let latestJob = null;

  for (const job of pdfExportJobs.values()) {
    if (String(job?.bookId) !== String(bookId)) {
      continue;
    }
    if (String(job?.ownerId) !== String(ownerId)) {
      continue;
    }

    if (!latestJob) {
      latestJob = job;
      continue;
    }

    const latestTs = Date.parse(latestJob.createdAt || '');
    const currentTs = Date.parse(job.createdAt || '');
    const latestValue = Number.isFinite(latestTs) ? latestTs : 0;
    const currentValue = Number.isFinite(currentTs) ? currentTs : 0;

    if (currentValue > latestValue) {
      latestJob = job;
    }
  }

  return latestJob;
}

function buildPdfExportPrerequisiteError(message) {
  const error = new Error(message);
  error.status = 409;
  return error;
}

async function recoverMissingPdfExportJob({
  db = supabase,
  bookId,
  ownerId,
  requestedJobId = ''
}) {
  const normalizedRequestedJobId = cleanText(requestedJobId, 120);
  if (normalizedRequestedJobId) {
    const requestedJob = getOwnedPdfExportJob({
      jobId: normalizedRequestedJobId,
      bookId,
      ownerId
    });
    if (requestedJob) {
      return requestedJob;
    }
  }

  const latestOwnedJob = findLatestOwnedPdfExportJob({ bookId, ownerId });
  if (latestOwnedJob) {
    return latestOwnedJob;
  }

  const { data: ownedBook, error: ownedBookError } = await db
    .from('books')
    .select('id')
    .eq('id', bookId)
    .eq('owner_id', ownerId)
    .maybeSingle();

  if (ownedBookError) {
    throw ownedBookError;
  }
  if (!ownedBook) {
    return null;
  }

  const { data: candidateOrders, error: candidateOrdersError } = await db
    .from('orders')
    .select('*')
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: false })
    .limit(500);

  if (candidateOrdersError) {
    throw candidateOrdersError;
  }

  const linkedPaidOrders = (Array.isArray(candidateOrders) ? candidateOrders : []).filter(
    (order) => isOrderLinkedToBook(order, bookId) && hasOrderPdfAccess(order)
  );

  if (!linkedPaidOrders.length) {
    return null;
  }

  const preferredOrder = normalizedRequestedJobId
    ? linkedPaidOrders.find(
        (order) => normalizeIdentifier(order?.metadata?.pdfJobId) === normalizeIdentifier(normalizedRequestedJobId)
      )
    : null;
  const targetOrder = preferredOrder || linkedPaidOrders[0];
  if (!targetOrder?.id) {
    return null;
  }

  const metadataJobId = cleanText(targetOrder?.metadata?.pdfJobId, 120);
  if (metadataJobId) {
    const metadataLinkedJob = getOwnedPdfExportJob({
      jobId: metadataJobId,
      bookId,
      ownerId
    });
    if (metadataLinkedJob) {
      return metadataLinkedJob;
    }
  }

  const { book, chapters } = await loadOwnedBookChapterContext({
    bookId,
    ownerId
  });
  const chaptersWithDrafts = (chapters || []).map((chapter) => ({
    chapter,
    draft: extractChapterDraftState(chapter)
  }));
  const incompleteCount = chaptersWithDrafts.filter(
    ({ draft }) => draft?.status !== 'validated'
  ).length;

  if (!chaptersWithDrafts.length) {
    throw buildPdfExportPrerequisiteError('Aucun chapitre disponible pour generer le PDF final');
  }

  if (incompleteCount > 0) {
    throw buildPdfExportPrerequisiteError(
      `Tous les chapitres doivent etre valides avant l export PDF (${incompleteCount} restant(s))`
    );
  }

  const coverValidation = getBookCoverValidationState(book);
  if (!coverValidation.isBookCoverValidated) {
    throw buildPdfExportPrerequisiteError(
      'La couverture et la 4e de couverture doivent etre validees avant l export PDF final.'
    );
  }

  const previewFormat = resolveBookPreviewFormat(
    book,
    targetOrder?.metadata?.pdfPreviewFormat || targetOrder?.metadata?.previewFormat
  );
  const previewLayoutSettings = normalizePreviewLayoutSettings(
    targetOrder?.metadata?.pdfPreviewLayoutSettings || book?.cover_config?.previewLayoutSettings,
    previewFormat
  );

  let recoveredJobId = metadataJobId || normalizedRequestedJobId || createPdfExportJobId();
  const conflictingJob = pdfExportJobs.get(recoveredJobId);
  if (
    conflictingJob
    && (String(conflictingJob.bookId) !== String(bookId) || String(conflictingJob.ownerId) !== String(ownerId))
  ) {
    recoveredJobId = createPdfExportJobId();
  } else if (conflictingJob) {
    return conflictingJob;
  }

  const createdAt = new Date().toISOString();
  const recoveredJob = {
    jobId: recoveredJobId,
    bookId,
    ownerId,
    orderId: targetOrder.id,
    status: 'queued',
    createdAt,
    startedAt: null,
    completedAt: null,
    error: null,
    files: null,
    previewFormat,
    previewLayoutSettings
  };
  pdfExportJobs.set(recoveredJobId, recoveredJob);

  const nextOrderMetadata = mergeOrderMetadata(targetOrder.metadata, {
    pdfJobId: recoveredJobId,
    pdfRequestedAt: createdAt,
    pdfPreviewFormat: previewFormat,
    pdfPreviewLayoutSettings: previewLayoutSettings,
    pdfReady: false,
    pdfError: null
  });
  const orderUpdatePayload = {
    metadata: nextOrderMetadata,
    updated_at: createdAt
  };
  const normalizedStatus = String(targetOrder.status || '').toLowerCase();
  if (normalizedStatus === 'paid' || normalizedStatus === 'pdf_ready' || normalizedStatus === 'failed') {
    orderUpdatePayload.status = 'pdf_generating';
  }

  await db
    .from('orders')
    .update(orderUpdatePayload)
    .eq('id', targetOrder.id)
    .eq('owner_id', ownerId);

  processPdfExportJob({
    jobId: recoveredJobId,
    book,
    chaptersWithDrafts,
    previewFormat,
    previewLayoutSettings
  }).catch((error) => {
    console.error('Erreur regeneration job export PDF:', error);
  });

  return recoveredJob;
}

async function processPdfExportJob({
  jobId,
  book,
  chaptersWithDrafts,
  previewFormat,
  previewLayoutSettings
}) {
  const queuedJob = pdfExportJobs.get(jobId);
  if (!queuedJob) {
    return;
  }

  queuedJob.status = 'rendering';
  queuedJob.startedAt = new Date().toISOString();
  queuedJob.error = null;
  pdfExportJobs.set(jobId, queuedJob);

  try {
    const files = await generateFinalBookPdfFiles({
      book,
      chaptersWithDrafts,
      jobId,
      previewFormat,
      previewLayoutSettings
    });
    const readyJob = pdfExportJobs.get(jobId);
    if (!readyJob) {
      return;
    }

    readyJob.status = 'ready';
    readyJob.completedAt = new Date().toISOString();
    readyJob.error = null;
    readyJob.files = files;
    pdfExportJobs.set(jobId, readyJob);
    try {
      await syncOrderWithPdfJobResult({
        job: readyJob,
        outcome: 'ready'
      });
    } catch (syncError) {
      console.error('Erreur sync commande PDF ready:', syncError);
    }
  } catch (error) {
    const failedJob = pdfExportJobs.get(jobId);
    if (!failedJob) {
      return;
    }

    failedJob.status = 'failed';
    failedJob.completedAt = new Date().toISOString();
    failedJob.error = cleanText(error?.message || 'Generation PDF impossible', 260);
    pdfExportJobs.set(jobId, failedJob);
    try {
      await syncOrderWithPdfJobResult({
        job: failedJob,
        outcome: 'failed',
        errorMessage: failedJob.error
      });
    } catch (syncError) {
      console.error('Erreur sync commande PDF failed:', syncError);
    }
  }
}

function cleanupExpiredPdfExportJobs() {
  const now = Date.now();

  for (const [jobId, job] of pdfExportJobs.entries()) {
    const createdAtTimestamp = Date.parse(job.createdAt || '');
    const createdAt = Number.isFinite(createdAtTimestamp) ? createdAtTimestamp : 0;

    if (now - createdAt <= PDF_EXPORT_JOB_TTL_MS) {
      continue;
    }

    deletePdfExportFiles(job);
    pdfExportJobs.delete(jobId);
  }
}

function deletePdfExportFiles(job) {
  const candidateFiles = [
    job?.files?.final?.path,
    job?.files?.interior?.path,
    job?.files?.cover?.path
  ].filter(Boolean);

  candidateFiles.forEach((targetPath) => {
    try {
      if (fs.existsSync(targetPath)) {
        fs.unlinkSync(targetPath);
      }
    } catch (error) {
      console.error('Erreur nettoyage fichier PDF:', error);
    }
  });
}

async function generateFinalBookPdfFiles({
  book,
  chaptersWithDrafts,
  jobId,
  previewFormat,
  previewLayoutSettings
}) {
  await fsp.mkdir(PDF_EXPORT_DIR, { recursive: true });
  const safeBookName = normalizePdfFileName(cleanText(book?.title, 120), 'livre');
  const finalPath = path.join(PDF_EXPORT_DIR, `${safeBookName}-${jobId}-livre-final.pdf`);
  const resolvedPreviewFormat = resolveBookPreviewFormat(book, previewFormat);
  const rendererMode = String(process.env.PDF_RENDERER_MODE || 'browser').toLowerCase();
  const shouldUseBrowserRenderer = rendererMode !== 'legacy' && rendererMode !== 'pdfkit';
  let rendererUsed = shouldUseBrowserRenderer ? 'browser' : 'legacy';

  if (shouldUseBrowserRenderer) {
    try {
      await generateFinalBookPdfFileFromHtml({
        finalPath,
        book,
        chaptersWithDrafts,
        frameTexts,
        jobId,
        previewFormat: resolvedPreviewFormat,
        previewLayoutSettings
      });
    } catch (browserError) {
      const strictBrowserMode = rendererMode === 'browser-strict';
      if (strictBrowserMode) {
        throw browserError;
      }

      console.error('Generation PDF navigateur indisponible, fallback PDFKit:', browserError);
      rendererUsed = 'legacy';
      await generateFinalBookPdfFileLegacy({
        filePath: finalPath,
        book,
        chaptersWithDrafts,
        previewFormat: resolvedPreviewFormat
      });
    }
  } else {
    await generateFinalBookPdfFileLegacy({
      filePath: finalPath,
      book,
      chaptersWithDrafts,
      previewFormat: resolvedPreviewFormat
    });
    rendererUsed = 'legacy';
  }

  return {
    renderer: rendererUsed,
    final: {
      path: finalPath,
      fileName: `${safeBookName}-livre-final.pdf`
    }
  };
}

async function generateFinalBookPdfFileFromHtml({
  finalPath,
  book,
  chaptersWithDrafts,
  frameTexts,
  jobId,
  previewFormat,
  previewLayoutSettings
}) {
  const browserPath = resolvePdfBrowserPath();
  if (!browserPath) {
    throw new Error(
      'Aucun navigateur headless trouve pour un rendu PDF fidele. Definissez PDF_BROWSER_PATH (Chrome/Edge).'
    );
  }

  const finalHtml = renderValidatedBookPreviewHtml({
    book,
    chaptersWithDrafts,
    frameTexts,
    previewFormat,
    previewLayoutSettings
  });

  const finalDocument = buildPrintableBookHtmlDocument({
    title: `${cleanText(book?.title, 180) || 'Livre souvenir'} - PDF final`,
    bodyHtml: finalHtml,
    mode: 'interior',
    previewFormat
  });

  await renderPdfFromHtmlWithBrowser({
    browserPath,
    html: finalDocument,
    outputPath: finalPath,
    htmlPath: path.join(PDF_EXPORT_DIR, `job-${jobId}-livre-final.html`)
  });
}

function resolvePdfBrowserPath() {
  const candidatePaths = [
    process.env.PDF_BROWSER_PATH,
    process.env.CHROME_BIN,
    process.env.GOOGLE_CHROME_BIN
  ].filter(Boolean);

  if (process.platform === 'win32') {
    candidatePaths.push(
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
    );
  } else if (process.platform === 'darwin') {
    candidatePaths.push(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
    );
  } else {
    candidatePaths.push(
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium-browser',
      '/usr/bin/chromium',
      '/usr/bin/microsoft-edge',
      '/usr/bin/microsoft-edge-stable'
    );
  }

  return candidatePaths.find((browserPath) => (
    typeof browserPath === 'string' &&
    browserPath.trim() &&
    fs.existsSync(browserPath)
  )) || null;
}

async function renderPdfFromHtmlWithBrowser({ browserPath, html, outputPath, htmlPath }) {
  await fsp.writeFile(htmlPath, html, 'utf8');
  const htmlUrl = pathToFileURL(htmlPath).href;

  const args = [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--run-all-compositor-stages-before-draw',
    '--virtual-time-budget=15000',
    '--print-to-pdf-no-header',
    `--print-to-pdf=${outputPath}`,
    htmlUrl
  ];

  try {
    await execFilePromise(browserPath, args, { timeout: 90000 });

    if (!fs.existsSync(outputPath)) {
      throw new Error('Le navigateur n a pas produit de fichier PDF');
    }
  } finally {
    try {
      if (fs.existsSync(htmlPath)) {
        await fsp.unlink(htmlPath);
      }
    } catch (cleanupError) {
      console.error('Erreur suppression fichier HTML temporaire:', cleanupError);
    }
  }
}

function execFilePromise(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(command, args, options, (error, stdout, stderr) => {
      if (error) {
        const stderrMessage = cleanText(stderr || '', 400);
        const stdoutMessage = cleanText(stdout || '', 400);
        const extraMessage = stderrMessage || stdoutMessage;
        if (extraMessage) {
          error.message = `${error.message} | ${extraMessage}`;
        }
        reject(error);
        return;
      }

      resolve({ stdout, stderr });
    });
  });
}

function renderValidatedBookInteriorHtml({
  book,
  chaptersWithDrafts,
  frameTexts = null,
  previewFormat,
  previewLayoutSettings
}) {
  const resolvedPreviewFormat = resolveBookPreviewFormat(book, previewFormat);
  const previewFormatClass = `draft-book-format-${resolvedPreviewFormat}`;
  const layoutClass = buildPreviewLayoutClassName(previewLayoutSettings, resolvedPreviewFormat);
  const layoutStyle = buildPreviewLayoutInlineStyle(previewLayoutSettings, resolvedPreviewFormat);
  const normalizedLayoutSettings = normalizePreviewLayoutSettings(previewLayoutSettings, resolvedPreviewFormat);
  const chapterBlocks = (chaptersWithDrafts || [])
    .map(({ chapter, draft }, index) => {
      const sourceChapter = buildPreviewSourceChapter(chapter);
      const chapterNarrative = buildChapterNarrativeForPreview({
        chapter,
        draft,
        sourceChapter
      });

      return renderDraftChapterPages({
        chapter: chapterNarrative,
        sourceChapter,
        index,
        layoutSettings: normalizedLayoutSettings,
        previewFormat: resolvedPreviewFormat
      });
    })
    .join('');
  const chaptersContent = chapterBlocks
    || '<section class="draft-book-section"><p class="draft-book-empty">Aucun chapitre valide.</p></section>';

  return `
    <article class="draft-book ${previewFormatClass} ${layoutClass}" data-preview-format="${resolvedPreviewFormat}" style="${escapeHtml(layoutStyle)}">
      <header class="draft-book-header">
        <div class="draft-book-eyebrow">Version finale</div>
        <h1>${escapeHtml(cleanText(book.title, 180) || 'Livre souvenir')}</h1>
        <div class="draft-book-meta">
          ${escapeHtml([
            book.recipient_name ? `Destinataire : ${book.recipient_name}` : '',
            book.style_narratif ? `Style : ${book.style_narratif}` : '',
            book.event_type ? `Evenement : ${book.event_type}` : ''
          ].filter(Boolean).join(' | '))}
        </div>
      </header>
      ${renderBookFramePreviewSection({
        title: 'Introduction',
        content: frameTexts?.introduction || ''
      })}
      ${chaptersContent}
      ${renderBookFramePreviewSection({
        title: 'Conclusion',
        content: frameTexts?.conclusion || ''
      })}
    </article>
  `;
}

function renderValidatedBookCoverHtml({ book, previewFormat }) {
  const resolvedPreviewFormat = resolveBookPreviewFormat(book, previewFormat);
  const previewFormatClass = `draft-book-format-${resolvedPreviewFormat}`;
  const frontCard = extractCoverCardMarkup(renderAssembledFrontCover(book));
  const backCard = extractCoverCardMarkup(renderAssembledBackCover(book));

  return `
    <article class="draft-book draft-book-cover-print ${previewFormatClass}" data-preview-format="${resolvedPreviewFormat}">
      <section class="cover-print-spread">
        ${backCard}
        ${frontCard}
      </section>
    </article>
  `;
}

function buildBookFrameFallbackText({ book = {}, chaptersWithDrafts = [], outputType = 'introduction' }) {
  const recipientName = cleanText(book?.recipient_name, 180) || 'la personne celebree';
  const chapterTitles = (Array.isArray(chaptersWithDrafts) ? chaptersWithDrafts : [])
    .map(({ chapter }, index) => cleanText(index === 0 ? 'Introduction' : chapter?.title, 160))
    .filter(Boolean);

  if (normalizeText(outputType).toLowerCase() === 'conclusion') {
    return `Ce livre trace deja une ligne claire autour de ${recipientName}, entre ${chapterTitles.slice(0, 3).join(', ') || 'ses moments forts'} et ce que chacun choisit d en retenir pour la suite.`;
  }

  return `Ce livre s ouvre comme une entree en matiere autour de ${recipientName}, en laissant d abord place aux chapitres ${chapterTitles.slice(0, 3).join(', ') || 'deja poses'} avant d en faire emerger le fil sensible.`;
}

async function generateBookFrameTextWithFallback({
  book,
  config,
  chaptersWithDrafts,
  outputType
}) {
  const context = {
    book,
    config,
    chapters: (Array.isArray(chaptersWithDrafts) ? chaptersWithDrafts : []).map(({ chapter }) => chapter)
  };
  const variables = buildFramePromptVariables(context, outputType);

  try {
    const content = await aiService.generateNarrativeContent({
      outputType,
      eventType: variables.event_type,
      eventSubtype: variables.event_subtype,
      style: variables.narrative_style,
      bookTitle: variables.book_title,
      chapterTitle: variables.chapter_title,
      recipientName: variables.recipient_name,
      recipientNickname: variables.recipient_nickname,
      recipientAge: variables.recipient_age,
      recipientGender: variables.recipient_gender,
      narrativePerson: variables.narrative_person,
      characterTrait: variables.character_trait,
      signatureAnecdote: variables.signature_anecdote,
      signaturePhrase: variables.signature_phrase,
      futureWish: variables.future_wish,
      eventDate: variables.event_date,
      eventLocation: variables.event_location,
      chapterTitles: variables.chapter_titles,
      chapterSummary: variables.chapter_summary,
      narrativeContext: variables.narrative_context,
      targetLength: variables.target_length
    });

    return cleanText(content, 5000) || buildBookFrameFallbackText({ book, chaptersWithDrafts, outputType });
  } catch (_error) {
    return buildBookFrameFallbackText({ book, chaptersWithDrafts, outputType });
  }
}

async function generateBookFrameTextsForPreview({
  book,
  config,
  chaptersWithDrafts
}) {
  const [introduction, conclusion] = await Promise.all([
    generateBookFrameTextWithFallback({
      book,
      config,
      chaptersWithDrafts,
      outputType: 'introduction'
    }),
    generateBookFrameTextWithFallback({
      book,
      config,
      chaptersWithDrafts,
      outputType: 'conclusion'
    })
  ]);

  return {
    introduction,
    conclusion
  };
}

function extractCoverCardMarkup(sectionHtml) {
  const match = String(sectionHtml || '').match(/<article[\s\S]*?<\/article>/i);
  return match ? match[0] : '';
}

function buildPrintableBookHtmlDocument({ title, bodyHtml, mode, previewFormat }) {
  const isCoverMode = mode === 'cover';

  return `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;1,300;1,400&family=Playfair+Display:wght@400;500&display=swap" rel="stylesheet" />
    <title>${escapeHtml(title || 'Livre')}</title>
    <style>
      ${getPrintableBookStyles({ isCoverMode, previewFormat })}
    </style>
  </head>
  <body class="${isCoverMode ? 'mode-cover' : 'mode-interior'} format-${resolveBookPreviewFormat(null, previewFormat)}">
    <div class="book-draft-preview">
      ${bodyHtml}
    </div>
  </body>
</html>`;
}

function getPrintableBookStyles({ isCoverMode, previewFormat }) {
  const formatSpec = getPreviewFormatSpec(previewFormat);
  const trimWidthMm = formatSpec.trimWidthMm;
  const trimHeightMm = formatSpec.trimHeightMm;
  const interiorPageMarginMm = 8;
  const coverPageMarginMm = 6;
  const coverWidthMm = trimWidthMm * 2 + 18;
  const coverHeightMm = trimHeightMm + 12;
  const pageSizeRule = isCoverMode
    ? `size: ${coverWidthMm}mm ${coverHeightMm}mm;`
    : `size: ${trimWidthMm}mm ${trimHeightMm}mm;`;
  const pageMarginMm = isCoverMode ? coverPageMarginMm : interiorPageMarginMm;
  const interiorPageMinHeightMm = Math.max(110, trimHeightMm - pageMarginMm * 2 - 6);
  const coverCardMinHeightMm = Math.max(120, trimHeightMm - pageMarginMm * 2 - 2);
  const coverContentHeightMm = Math.max(120, coverHeightMm - pageMarginMm * 2);

  return `
    :root {
      --page-width: ${Math.round(trimWidthMm * 2.83465)}px;
      --page-height: ${Math.round(trimHeightMm * 2.83465)}px;
      --margin-top: 36px;
      --margin-bottom: 28px;
      --margin-outer: 32px;
      --margin-inner: 32px;
      --font-body: "Cormorant Garamond", Georgia, serif;
      --font-display: "Playfair Display", Georgia, serif;
      --size-chapter-num: 10px;
      --size-chapter-title: 22px;
      --size-chapter-sub: 12px;
      --size-body: 11.5px;
      --size-callout: 11.5px;
      --size-caption: 9.5px;
      --size-folio: 9px;
      --size-section-label: 10px;
      --leading-body: 1.85;
      --leading-tight: 1.35;
      --leading-callout: 1.65;
      --color-ink: #1c1b18;
      --color-ink-light: #5a5248;
      --color-ink-muted: #9a8f7e;
      --color-rule: #d4ccc0;
      --color-accent: #b09070;
      --color-page-bg: #faf9f6;
      --color-page-dark-bg: #1a1916;
      --color-callout-bg: rgba(176, 144, 112, 0.06);
      --color-img-ph: #ede9e2;
    }

    @page {
      ${pageSizeRule}
      margin: ${pageMarginMm}mm;
    }

    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }

    html, body {
      margin: 0;
      padding: 0;
      font-family: var(--font-body);
      color: var(--color-ink);
      background: #ffffff;
    }

    .book-draft-preview {
      padding: 0;
      background: #ffffff;
    }

    .draft-book {
      color: #1f2228;
    }

    .draft-book-header {
      padding-bottom: 10mm;
      margin-bottom: 8mm;
      border-bottom: 1px solid rgba(184, 146, 74, 0.2);
      page-break-after: always;
      break-after: page;
    }

    .draft-book-eyebrow {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #8b6a2f;
      margin-bottom: 4mm;
    }

    .draft-book-header h1 {
      margin: 0 0 4mm;
      font-family: var(--font-display);
      font-size: 26px;
      line-height: 1.14;
      letter-spacing: 0.01em;
    }

    .draft-book-meta {
      font-size: 11px;
      color: var(--color-ink-light);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      line-height: 1.5;
    }

    .draft-book-section {
      background: #ffffff;
      border: 1px solid rgba(232, 232, 232, 0.9);
      border-radius: 10px;
      padding: 6mm;
      margin-bottom: 6mm;
      box-shadow: none;
      page-break-after: always;
      break-after: page;
    }

    .draft-book-section-cover {
      min-height: ${interiorPageMinHeightMm}mm;
      display: flex;
      flex-direction: column;
      gap: 1.8mm;
      page-break-inside: avoid;
      break-inside: avoid-page;
    }

    .draft-book-section-cover .draft-book-mini-title {
      margin-bottom: 1.8mm;
    }

    .draft-book-section-cover .cover-preview-spread {
      flex: 1;
      min-height: 0;
      display: block;
    }

    .draft-book-section-cover .cover-preview-card {
      min-height: calc(${interiorPageMinHeightMm}mm - 12mm);
      max-height: calc(${interiorPageMinHeightMm}mm - 12mm);
      page-break-inside: avoid;
      break-inside: avoid-page;
    }

    .draft-book-section-cover.is-full-bleed {
      padding: 2mm;
      gap: 1.2mm;
      border-color: rgba(223, 216, 201, 0.9);
    }

    .draft-book-section-cover.is-full-bleed .cover-preview-spread {
      height: 100%;
    }

    .draft-book-section-cover.is-full-bleed .cover-preview-card {
      width: 100%;
      max-width: none;
      margin: 0;
      min-height: calc(${interiorPageMinHeightMm}mm - 4mm);
      height: calc(${interiorPageMinHeightMm}mm - 4mm);
      max-height: none;
      border-radius: 10px;
      padding: 14px;
    }

    .draft-book-section h2,
    .draft-book-chapter h3 {
      margin: 0 0 4.8mm;
      font-family: var(--font-display);
      color: var(--color-ink);
      letter-spacing: 0.01em;
    }

    .draft-book-section h2 {
      font-size: 21px;
      line-height: 1.18;
    }

    .draft-book-chapter h3 {
      font-size: calc(var(--size-chapter-title) * var(--layout-font-scale, 1));
      line-height: var(--leading-tight);
      letter-spacing: -0.02em;
      font-weight: 400;
    }

    .chapter-opening {
      margin-bottom: 4.6mm;
      break-after: avoid-page;
      page-break-after: avoid;
    }

    .chapter-num {
      margin: 0 0 2.4mm;
      font-family: var(--font-body);
      font-size: var(--size-chapter-num);
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: var(--color-ink-muted);
    }

    .chapter-title {
      margin: 0 0 1.4mm;
      font-family: var(--font-display);
      font-size: var(--size-chapter-title);
      font-weight: 400;
      line-height: var(--leading-tight);
      color: var(--color-ink);
      letter-spacing: -0.02em;
    }

    .chapter-sub {
      margin: 0 0 4.2mm;
      font-family: var(--font-body);
      font-size: calc(var(--size-chapter-sub) * var(--layout-font-scale, 1));
      font-style: italic;
      color: var(--color-ink-muted);
    }

    .chapter-rule {
      border: none;
      border-top: 0.5px solid var(--color-rule);
      margin: 0;
    }

    .draft-book-chapter {
      margin: 0;
    }

    .draft-book-chapter-shell {
      display: block;
    }

    .draft-book-page {
      background: var(--color-page-bg);
      border: 1px solid rgba(223, 216, 201, 0.9);
      border-radius: 3px;
      padding:
        max(4.6mm, calc(var(--margin-top) * 0.66))
        max(3.8mm, calc(var(--margin-outer) * 0.66))
        max(6mm, calc(var(--margin-bottom) + 2.6mm))
        max(3.8mm, calc(var(--margin-inner) * 0.66));
      min-height: ${interiorPageMinHeightMm}mm;
      box-shadow: none;
      display: flex;
      flex-direction: column;
      position: relative;
      text-align: justify;
      hyphens: auto;
      orphans: 3;
      widows: 3;
      page-break-inside: avoid;
      break-inside: avoid-page;
      page-break-after: always;
      break-after: page;
    }

    .draft-book-page-opening {
      border-color: rgba(184, 146, 74, 0.45);
    }

    .draft-book-page-gallery {
      background: linear-gradient(180deg, rgba(255, 255, 255, 0.94) 0%, rgba(249, 245, 236, 0.96) 100%);
    }

    .draft-book-intro {
      margin: 0 0 5mm;
      max-width: 90%;
      font-style: italic;
      color: var(--color-ink-light);
      line-height: 1.66;
      font-size: calc(var(--size-chapter-sub) * var(--layout-font-scale, 1));
    }

    .draft-book-body {
      flex: 1;
    }

    .draft-book-body p,
    .draft-book-section p,
    .draft-book-callout p,
    .draft-book-contributor-item p {
      margin: 0 0 4.1mm;
      line-height: var(--leading-body);
      font-size: calc(var(--size-body) * var(--layout-font-scale, 1));
      text-align: justify;
      text-align-last: left;
      hyphens: auto;
      text-indent: 1.4em;
      page-break-inside: avoid;
      break-inside: avoid-page;
      orphans: 3;
      widows: 3;
      overflow-wrap: break-word;
      word-break: normal;
    }

    .draft-book-text-block {
      margin: 0 0 4.1mm;
      line-height: var(--leading-body);
      font-size: calc(var(--size-body) * var(--layout-font-scale, 1));
      text-indent: 1.4em;
    }

    .draft-book-page-opening .draft-book-body p:first-child,
    .draft-book-page-opening .draft-book-text-block:first-child {
      text-indent: 0;
    }

    .draft-book-page-opening .draft-book-body p:first-child::first-letter,
    .draft-book-page-opening .draft-book-text-block:first-child::first-letter {
      font-family: var(--font-display);
      font-size: 44px;
      font-weight: 400;
      float: left;
      line-height: 0.82;
      margin-right: 5px;
      margin-top: 4px;
      color: var(--color-accent);
    }

    .draft-book-layout-text-airy .draft-book-text-block,
    .draft-book-layout-text-airy .draft-book-body p,
    .draft-book-layout-text-airy .draft-book-section p {
      font-size: calc(11.1px * var(--layout-font-scale, 1));
      line-height: calc(var(--leading-body) * 1.08);
      margin-bottom: 4.2mm;
    }

    .draft-book-layout-text-compact .draft-book-text-block,
    .draft-book-layout-text-compact .draft-book-body p,
    .draft-book-layout-text-compact .draft-book-section p {
      font-size: calc(11.9px * var(--layout-font-scale, 1));
      line-height: calc(var(--leading-body) * 0.82);
      margin-bottom: 2.8mm;
    }

    .draft-book-layout-line-compact .draft-book-text-block,
    .draft-book-layout-line-compact .draft-book-body p,
    .draft-book-layout-line-compact .draft-book-section p {
      line-height: calc(var(--leading-body) * 0.9);
    }

    .draft-book-layout-line-balanced .draft-book-text-block,
    .draft-book-layout-line-balanced .draft-book-body p,
    .draft-book-layout-line-balanced .draft-book-section p {
      line-height: var(--leading-body);
    }

    .draft-book-layout-line-airy .draft-book-text-block,
    .draft-book-layout-line-airy .draft-book-body p,
    .draft-book-layout-line-airy .draft-book-section p {
      line-height: calc(var(--leading-body) * 1.16);
    }

    .draft-book-body p:last-child,
    .draft-book-section p:last-child,
    .draft-book-callout p:last-child,
    .draft-book-contributor-item p:last-child {
      margin-bottom: 0;
    }

    .draft-book-closing {
      margin: 4mm 0 0;
      font-weight: 500;
    }

    .draft-book-folio {
      position: absolute;
      bottom: 3.2mm;
      left: 50%;
      transform: translateX(-50%);
      margin: 0;
      padding: 0;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      color: var(--color-rule);
      font-size: var(--size-folio);
      font-weight: 500;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      font-family: var(--font-body);
    }

    .draft-book-folio-dot {
      width: 3px;
      height: 3px;
      border-radius: 999px;
      background: var(--color-rule);
    }

    .draft-book-source {
      margin: 0 0 4mm;
      padding-bottom: 3.5mm;
      border-bottom: 1px solid rgba(232, 232, 232, 0.9);
      font-size: 10px;
      color: #5f6770;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .draft-book-mini-title {
      margin-bottom: 4.2mm;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #8b6a2f;
    }

    .draft-book-question-block {
      margin-top: auto;
      padding: 4mm;
      border-radius: 8px;
      background: rgba(245, 237, 220, 0.55);
    }

    .draft-book-amorce-text {
      margin: 0 0 3mm;
      font-size: 12.2px;
      font-style: italic;
      line-height: 1.6;
      color: #4f4333;
    }

    .draft-book-question-list {
      margin: 0;
      padding: 0;
      list-style: none;
      display: flex;
      flex-wrap: wrap;
      gap: 2mm;
      font-size: 10.8px;
    }

    .draft-book-question-list li {
      margin: 0;
      padding: 1.8mm 3.2mm;
      border-radius: 999px;
      border: 1px solid rgba(184, 146, 74, 0.24);
      background: rgba(255, 255, 255, 0.72);
      line-height: 1.4;
      page-break-inside: avoid;
      break-inside: avoid-page;
    }

    .draft-book-question-list li::before {
      content: none;
    }

    .draft-book-question-list li > span {
      display: block;
      min-width: 0;
    }

    .draft-book-callout,
    .draft-book-contributor-list {
      padding: 4mm;
      border-radius: 8px;
      background: rgba(247, 241, 231, 0.55);
      border: 1px solid rgba(184, 146, 74, 0.12);
      page-break-inside: avoid;
      break-inside: avoid-page;
    }

    .draft-book-callout {
      border-left: 1.5px solid var(--color-accent);
      border-right: none;
      border-top: none;
      border-bottom: none;
      border-radius: 0;
      padding: 10px 14px;
      margin: 4mm 0;
      background: var(--color-callout-bg);
    }

    .draft-book-callout p {
      font-size: calc(var(--size-callout) * var(--layout-font-scale, 1));
      line-height: var(--leading-callout);
      color: var(--color-ink-light);
      font-style: italic;
      text-indent: 0;
    }

    .draft-book-contributor-list {
      margin-top: 4mm;
    }

    .draft-book-contribution-spotlight {
      display: grid;
      gap: 3mm;
    }

    .draft-book-contributor-item strong {
      display: inline-block;
      margin-bottom: 1.4mm;
      font-size: 10.4px;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: #7c5f2f;
    }

    .draft-book-contributor-item + .draft-book-contributor-item {
      margin-top: 4mm;
      padding-top: 4mm;
      border-top: 1px solid rgba(184, 146, 74, 0.12);
    }

    .draft-book-gallery-wrap {
      margin-top: 6mm;
      display: grid;
      gap: 3mm;
    }

    .draft-book-gallery {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 4mm;
      align-items: stretch;
    }

    .draft-book-gallery.is-cols-3 {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .draft-book-gallery.is-single {
      grid-template-columns: minmax(0, 1fr);
    }

    .draft-book-gallery.is-single .draft-book-photo {
      width: 76%;
      margin: 0 auto;
      min-height: 58mm;
    }

    .draft-book-gallery.is-duo {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .draft-book-photo {
      margin: 0;
      min-height: 46mm;
      height: 46mm;
      border-radius: 8px;
      overflow: hidden;
      background: var(--color-img-ph);
    }

    .draft-book-photo img {
      display: block;
      width: 100%;
      height: 100%;
      min-height: 46mm;
      object-fit: cover;
    }

    .draft-book-media-block {
      margin: 5mm 0 0;
      border-radius: 8px;
      border: 1px solid rgba(184, 146, 74, 0.18);
      overflow: hidden;
      min-height: 48mm;
      height: 48mm;
      background: var(--color-img-ph);
    }

    .draft-book-media-block img {
      display: block;
      width: 100%;
      height: 100%;
      min-height: 48mm;
      object-fit: cover;
    }

    .draft-book-layout-image-discrete .draft-book-gallery {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .draft-book-layout-image-immersive .draft-book-gallery {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .draft-book-question-block,
    .draft-book-gallery-wrap,
    .draft-book-contributor-item,
    .cover-preview-card,
    .cover-preview-back-copy p {
      page-break-inside: avoid;
      break-inside: avoid-page;
    }

    .draft-book-gallery-note {
      margin-top: 3mm;
      font-size: 11px;
      color: #5f6770;
    }

    .draft-book-empty {
      color: #5f6770;
      font-style: italic;
    }

    .cover-print-spread {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
      height: ${coverContentHeightMm}mm;
      page-break-inside: avoid;
      break-inside: avoid-page;
      page-break-after: avoid;
      break-after: avoid;
    }

    .cover-preview-spread {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
    }

    .cover-preview-spread.is-single-face {
      grid-template-columns: minmax(0, 1fr);
    }

    .cover-preview-spread.is-single-face .cover-preview-card {
      width: 100%;
      max-width: 100%;
      margin: 0;
    }

    .cover-preview-spread.is-single-face.is-book-page .cover-preview-card {
      max-width: none;
      margin: 0;
    }

    .cover-preview-card {
      position: relative;
      min-height: ${coverCardMinHeightMm}mm;
      height: ${coverCardMinHeightMm}mm;
      max-height: ${coverCardMinHeightMm}mm;
      border-radius: 14px;
      border: 1px solid rgba(200, 184, 148, 0.62);
      background: var(--cover-bg, #f6f1e7);
      color: var(--cover-text, #1f2228);
      box-shadow: none;
      overflow: hidden;
      padding: 20px;
      display: flex;
      flex-direction: column;
      margin: 0;
    }

    .cover-preview-card.is-active {
      border-color: rgba(184, 146, 74, 0.62);
    }

    .cover-preview-safe-zone {
      position: absolute;
      inset: 16px;
      border: 1px dashed rgba(31, 34, 40, 0.16);
      border-radius: 8px;
      pointer-events: none;
    }

    .cover-preview-tag {
      align-self: flex-start;
      border: 1px solid rgba(184, 146, 74, 0.35);
      background: rgba(255, 255, 255, 0.58);
      color: var(--cover-accent, #b8924a);
      border-radius: 999px;
      padding: 4px 10px;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.07em;
      text-transform: uppercase;
    }

    .cover-preview-monogram {
      margin-top: 16px;
      width: 52px;
      height: 52px;
      border-radius: 12px;
      border: 1px solid rgba(184, 146, 74, 0.35);
      background: rgba(255, 255, 255, 0.45);
      color: var(--cover-accent, #b8924a);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-family: "Baskerville", "Palatino Linotype", serif;
      font-size: 20px;
      font-weight: 700;
      letter-spacing: 0.06em;
    }

    .cover-preview-front-copy {
      margin-top: auto;
      position: relative;
      z-index: 1;
    }

    .cover-preview-front-photo {
      margin: 4mm auto 3mm;
      width: 68%;
      height: 34mm;
      border-radius: 4mm;
      border: 0.35mm solid rgba(31, 34, 40, 0.22);
      background: rgba(255, 255, 255, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 2mm;
      box-sizing: border-box;
    }

    .cover-preview-front-photo-inner {
      width: 100%;
      height: 100%;
      border-radius: 3mm;
      border: 0.35mm dashed rgba(31, 34, 40, 0.24);
      display: flex;
      align-items: center;
      justify-content: center;
      text-align: center;
      font-size: 8px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: rgba(31, 34, 40, 0.65);
      box-sizing: border-box;
    }

    .cover-preview-front-event {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.07em;
      color: rgba(31, 34, 40, 0.62);
      margin-bottom: 8px;
    }

    .cover-preview-front-copy h3 {
      margin: 0 0 8px;
      color: var(--cover-text, #1f2228);
      font-family: "Baskerville", "Palatino Linotype", serif;
      font-size: 30px;
      line-height: 1.1;
      letter-spacing: 0.01em;
    }

    .cover-preview-front-copy p {
      margin: 0 0 12px;
      color: rgba(31, 34, 40, 0.72);
      font-size: 13px;
      line-height: 1.55;
    }

    .cover-preview-front-recipient {
      font-family: "Baskerville", "Palatino Linotype", serif;
      font-size: 15px;
      color: var(--cover-accent, #b8924a);
      letter-spacing: 0.04em;
    }

    .cover-preview-motif-line {
      position: absolute;
      top: 74px;
      right: 24px;
      width: 2px;
      height: 124px;
      background: linear-gradient(180deg, rgba(184, 146, 74, 0.12) 0%, rgba(184, 146, 74, 0.58) 50%, rgba(184, 146, 74, 0.12) 100%);
    }

    .cover-preview-motif-corner {
      position: absolute;
      top: 24px;
      right: 24px;
      width: 48px;
      height: 48px;
      border-top: 2px solid rgba(184, 146, 74, 0.62);
      border-right: 2px solid rgba(184, 146, 74, 0.62);
      border-radius: 0 10px 0 0;
    }

    .cover-preview-motif-olive {
      position: absolute;
      top: 64px;
      right: 18px;
      width: 88px;
      height: 74px;
      color: var(--cover-accent, #b8924a);
      opacity: 0.9;
    }

    .cover-preview-motif-olive svg {
      width: 100%;
      height: 100%;
      display: block;
    }

    .cover-preview-motif-olive path {
      fill: currentColor;
      opacity: 0.24;
    }

    .cover-preview-motif-olive .olive-vein {
      fill: none;
      stroke: rgba(31, 34, 40, 0.28);
      stroke-width: 3;
      stroke-linecap: round;
      opacity: 0.7;
    }

    .cover-preview-motif-olive .olive-fruit {
      fill: rgba(31, 34, 40, 0.18);
      opacity: 0.9;
    }

    .cover-preview-back-copy {
      margin-top: 6px;
      color: var(--cover-text, #1f2228);
      font-size: 13px;
      line-height: 1.68;
      white-space: pre-wrap;
    }

    .cover-preview-back-copy p {
      margin: 0 0 2.6mm;
    }

    .cover-preview-back-copy p:last-child {
      margin-bottom: 0;
    }

    .cover-preview-back-quote {
      margin: auto 0 0;
      border-left: 2px solid rgba(184, 146, 74, 0.62);
      padding-left: 12px;
      color: rgba(31, 34, 40, 0.8);
      font-family: "Baskerville", "Palatino Linotype", serif;
      font-size: 16px;
      line-height: 1.45;
    }

    .cover-preview-back-organizer {
      margin-top: 2.2mm;
      font-size: 10px;
      line-height: 1.5;
      color: rgba(31, 34, 40, 0.75);
    }

    .cover-preview-back-footer {
      margin-top: 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }

    .cover-preview-chip {
      display: inline-flex;
      align-items: center;
      min-height: 24px;
      border-radius: 999px;
      border: 1px solid rgba(184, 146, 74, 0.35);
      padding: 2px 10px;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--cover-accent, #b8924a);
      background: rgba(255, 255, 255, 0.56);
    }

    .cover-preview-qr {
      width: 34px;
      height: 34px;
      border-radius: 8px;
      border: 1px solid rgba(31, 34, 40, 0.2);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 10px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: rgba(31, 34, 40, 0.74);
    }

    .cover-preview-back-signature {
      margin-top: auto;
      color: var(--cover-accent, #b8924a);
      font-family: "Baskerville", "Palatino Linotype", serif;
      font-size: 14px;
      letter-spacing: 0.04em;
    }

    .cover-preview-back-date {
      margin-top: 2mm;
      font-size: 8px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: rgba(31, 34, 40, 0.62);
    }

    .cover-preview-note-zone {
      margin-top: 2.2mm;
      min-height: 13mm;
      border-radius: 2.5mm;
      border: 0.35mm dashed rgba(31, 34, 40, 0.24);
      background: rgba(255, 255, 255, 0.58);
      color: rgba(31, 34, 40, 0.62);
      font-size: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      box-sizing: border-box;
    }

    .cover-preview-back-isbn {
      margin-top: 2mm;
      font-size: 7px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: rgba(31, 34, 40, 0.58);
    }

    .cover-preview-card.cover-style-elegance_intemporelle::before {
      content: '';
      position: absolute;
      inset: 0;
      background:
        repeating-linear-gradient(
          90deg,
          rgba(255, 255, 255, 0.16) 0,
          rgba(255, 255, 255, 0.16) 0.35mm,
          transparent 0.35mm,
          transparent 1.05mm
        ),
        linear-gradient(180deg, rgba(255, 255, 255, 0.24) 0%, rgba(255, 255, 255, 0) 44%);
      opacity: 0.68;
      pointer-events: none;
    }

    .cover-preview-card.cover-style-modernite_minimaliste .cover-preview-front-copy h3,
    .cover-preview-card.cover-style-minimal_contemporary .cover-preview-front-copy h3 {
      text-transform: uppercase;
      letter-spacing: 0.08em;
      font-size: 24px;
    }

    .cover-preview-card.cover-style-modernite_minimaliste .cover-preview-tag,
    .cover-preview-card.cover-style-minimal_contemporary .cover-preview-tag {
      border-style: solid;
      letter-spacing: 0.12em;
    }

    .cover-preview-card.cover-style-modernite_minimaliste .cover-preview-front-photo,
    .cover-preview-card.cover-style-minimal_contemporary .cover-preview-front-photo {
      border-color: rgba(243, 246, 252, 0.45);
      background: rgba(255, 255, 255, 0.05);
    }

    .cover-preview-card.cover-style-modernite_minimaliste .cover-preview-front-photo-inner,
    .cover-preview-card.cover-style-minimal_contemporary .cover-preview-front-photo-inner {
      border-color: rgba(238, 243, 252, 0.36);
      color: rgba(238, 243, 252, 0.82);
    }

    .cover-preview-card.cover-style-modernite_minimaliste .cover-preview-motif-olive path,
    .cover-preview-card.cover-style-minimal_contemporary .cover-preview-motif-olive path {
      fill: rgba(219, 227, 240, 0.55);
    }

    .cover-preview-card.cover-style-modernite_minimaliste .cover-preview-motif-olive .olive-vein,
    .cover-preview-card.cover-style-minimal_contemporary .cover-preview-motif-olive .olive-vein {
      stroke: rgba(238, 243, 252, 0.56);
    }

    .cover-preview-card.cover-style-modernite_minimaliste .cover-preview-motif-olive .olive-fruit,
    .cover-preview-card.cover-style-minimal_contemporary .cover-preview-motif-olive .olive-fruit {
      fill: rgba(238, 243, 252, 0.52);
    }

    .cover-preview-card.cover-style-retro_chic .cover-preview-front-copy h3,
    .cover-preview-card.cover-style-heritage_emotion .cover-preview-front-copy h3 {
      font-style: italic;
      line-height: 1.18;
    }

    .cover-preview-card.cover-style-retro_chic .cover-preview-back-quote,
    .cover-preview-card.cover-style-heritage_emotion .cover-preview-back-quote {
      font-size: 17px;
    }

    .cover-preview-card.cover-style-retro_chic .cover-preview-front-photo {
      width: 62%;
      border-radius: 50% / 45%;
      border-color: rgba(137, 93, 67, 0.35);
      background: rgba(255, 255, 255, 0.4);
    }

    .cover-preview-card.cover-style-retro_chic .cover-preview-front-photo-inner {
      border-radius: 50% / 45%;
      border-color: rgba(137, 93, 67, 0.4);
    }

    .cover-preview-card.cover-style-prestige_contemporain .cover-preview-front-copy h3 {
      display: inline-flex;
      padding: 2.2mm 3.4mm;
      border-radius: 999px;
      border: 0.35mm solid rgba(201, 164, 96, 0.45);
      background: rgba(255, 255, 255, 0.08);
      margin-bottom: 2.4mm;
      font-size: 22px;
    }

    .cover-preview-card.cover-style-prestige_contemporain .cover-preview-monogram {
      position: absolute;
      right: 6mm;
      bottom: 7mm;
      margin-top: 0;
      border-color: rgba(201, 164, 96, 0.5);
      background: rgba(255, 255, 255, 0.08);
    }

    .cover-preview-card.cover-style-prestige_contemporain .cover-preview-motif-olive path {
      fill: rgba(246, 232, 205, 0.32);
    }

    .cover-preview-card.cover-style-prestige_contemporain .cover-preview-motif-olive .olive-vein {
      stroke: rgba(246, 232, 205, 0.48);
    }

    .cover-preview-card.cover-style-prestige_contemporain .cover-preview-motif-olive .olive-fruit {
      fill: rgba(246, 232, 205, 0.46);
    }

    .cover-preview-card.cover-style-artistique_poetique::before {
      content: '';
      position: absolute;
      inset: 0;
      background:
        radial-gradient(circle at 22% 18%, rgba(141, 168, 206, 0.42), transparent 40%),
        radial-gradient(circle at 80% 74%, rgba(181, 152, 204, 0.36), transparent 44%),
        radial-gradient(circle at 44% 86%, rgba(245, 188, 173, 0.3), transparent 40%);
      opacity: 0.84;
      pointer-events: none;
    }

    .cover-preview-card.cover-style-artistique_poetique .cover-preview-note-zone {
      background: rgba(255, 255, 255, 0.72);
      border-color: rgba(123, 146, 183, 0.4);
      color: rgba(69, 90, 130, 0.78);
    }

    body.mode-cover .draft-book {
      page-break-inside: avoid;
      break-inside: avoid-page;
      min-height: ${coverContentHeightMm}mm;
      max-height: ${coverContentHeightMm}mm;
      overflow: hidden;
    }

    body.mode-cover .draft-book-section {
      margin: 0;
      padding: 0;
      border: none;
      border-radius: 0;
      box-shadow: none;
      page-break-after: always;
      break-after: page;
    }

    body.mode-cover .draft-book-section-cover {
      min-height: auto;
      gap: 0;
    }

    body.mode-cover .draft-book-mini-title {
      display: none;
    }

    body.mode-cover .draft-book-section-cover .cover-preview-spread {
      min-height: ${coverContentHeightMm}mm;
      height: ${coverContentHeightMm}mm;
      max-height: ${coverContentHeightMm}mm;
      overflow: hidden;
    }

    body.mode-cover .draft-book-section-cover .cover-preview-card {
      min-height: ${coverContentHeightMm}mm;
      height: ${coverContentHeightMm}mm;
      max-height: ${coverContentHeightMm}mm;
    }

    body.mode-cover .cover-print-spread {
      page-break-after: avoid;
      break-after: avoid;
      page-break-before: avoid;
      break-before: avoid-page;
      overflow: hidden;
    }

    body.mode-cover .cover-preview-front-copy,
    body.mode-cover .cover-preview-back-copy {
      overflow: hidden;
    }
  `;
}

async function generateInteriorPdfFile({ filePath, book, chaptersWithDrafts, previewFormat }) {
  const formatSpec = getPreviewFormatSpec(resolveBookPreviewFormat(book, previewFormat));
  const pageWidth = mmToPt(formatSpec.trimWidthMm);
  const pageHeight = mmToPt(formatSpec.trimHeightMm);
  const margins = {
    top: mmToPt(16),
    right: mmToPt(14),
    bottom: mmToPt(16),
    left: mmToPt(14)
  };

  await writePdfFile({
    filePath,
    title: `${cleanText(book?.title, 180) || 'Livre souvenir'} - Interieur`,
    draw: (doc) => {
      const addPage = () => {
        doc.addPage({
          size: [pageWidth, pageHeight],
          margins
        });
      };

      addPage();
      doc.fillColor('#8b6a2f').font('Helvetica-Bold').fontSize(10).text('Version finale imprimeur');
      doc.moveDown(0.6);
      doc.fillColor('#1f2228').font('Helvetica-Bold').fontSize(22).text(
        cleanText(book?.title, 180) || 'Livre souvenir',
        { align: 'left' }
      );
      doc.moveDown(0.35);
      doc.font('Helvetica').fontSize(11).fillColor('#4b5563').text(
        [
          cleanText(book?.event_type, 80),
          cleanText(book?.recipient_name, 120),
          cleanText(book?.style_narratif, 80)
        ].filter(Boolean).join(' | ') || 'Edition personnalisee'
      );
      doc.moveDown(0.7);
      doc.fontSize(10).fillColor('#6b7280').text(
        `Genere le ${new Date().toLocaleString('fr-FR')} | Format ${formatSpec.label}: ${formatSpec.trimWidthMm} x ${formatSpec.trimHeightMm} mm`,
        { align: 'left' }
      );

      chaptersWithDrafts.forEach(({ chapter, draft }, chapterIndex) => {
        addPage();
        doc.fillColor('#8b6a2f').font('Helvetica-Bold').fontSize(10).text(`Volet ${chapterIndex + 1}`);
        doc.moveDown(0.3);
        doc.fillColor('#1f2228').font('Helvetica-Bold').fontSize(18).text(
          sanitizeDraftHeadingStrict(
            cleanText(draft?.title, 180) || cleanText(chapter?.title, 180) || `Volet ${chapterIndex + 1}`,
            cleanText(chapter?.title, 180) || `Volet ${chapterIndex + 1}`
          )
        );
        doc.moveDown(0.45);
        doc.fillColor('#1f2228').font('Helvetica').fontSize(11);
        doc.text(
          buildInteriorChapterText({ chapter, draft }),
          {
            align: 'left',
            lineGap: 3
          }
        );
      });
    }
  });
}

async function generateFinalBookPdfFileLegacy({ filePath, book, chaptersWithDrafts, previewFormat }) {
  const formatSpec = getPreviewFormatSpec(resolveBookPreviewFormat(book, previewFormat));
  const pageWidth = mmToPt(formatSpec.trimWidthMm);
  const pageHeight = mmToPt(formatSpec.trimHeightMm);
  const margins = {
    top: mmToPt(16),
    right: mmToPt(14),
    bottom: mmToPt(16),
    left: mmToPt(14)
  };

  const {
    coverConfig,
    backCoverConfig,
    textColor,
    accentColor
  } = resolveCoverPreviewConfig(book);

  const frontTitle = cleanText(coverConfig?.title, 180) || cleanText(book?.title, 180) || 'Livre souvenir';
  const frontSubtitle = cleanText(coverConfig?.subtitle, 220);
  const frontRecipient = cleanText(coverConfig?.recipientLine, 180) || cleanText(book?.recipient_name, 180);
  const frontEventLine = cleanText(coverConfig?.eventLine, 180)
    || [cleanText(book?.event_type, 120), book?.recipient_age ? `${book.recipient_age} ans` : '']
      .filter(Boolean)
      .join(' | ');
  const backBlurb = cleanText(backCoverConfig?.blurb, 1800) || 'Texte de quatrieme de couverture a finaliser.';
  const backQuote = cleanText(backCoverConfig?.quote, 360);
  const backSignature = cleanText(backCoverConfig?.signature, 180)
    || (book?.recipient_name ? `Les proches de ${book.recipient_name}` : 'Les proches');
  const backDateLocation = cleanText(backCoverConfig?.dateLocation, 180);

  const resolvedTextColor = normalizePdfColor(textColor, '#1f2228');
  const resolvedAccentColor = normalizePdfColor(accentColor, '#b8924a');

  await writePdfFile({
    filePath,
    title: `${cleanText(book?.title, 180) || 'Livre souvenir'} - PDF final`,
    draw: (doc) => {
      const addPage = () => {
        doc.addPage({
          size: [pageWidth, pageHeight],
          margins
        });
      };

      addPage();
      doc.fillColor(resolvedAccentColor).font('Helvetica-Bold').fontSize(10).text('COUVERTURE');
      doc.moveDown(0.6);
      doc.fillColor(resolvedTextColor).font('Helvetica-Bold').fontSize(26).text(frontTitle, { align: 'left' });
      if (frontSubtitle) {
        doc.moveDown(0.5);
        doc.fillColor(resolvedTextColor).font('Helvetica').fontSize(12).text(frontSubtitle, { align: 'left' });
      }
      if (frontEventLine) {
        doc.moveDown(0.4);
        doc.fillColor('#4b5563').font('Helvetica').fontSize(10).text(frontEventLine, { align: 'left' });
      }
      if (frontRecipient) {
        doc.moveDown(1.1);
        doc.fillColor(resolvedAccentColor).font('Helvetica-Bold').fontSize(12).text(frontRecipient, { align: 'left' });
      }

      chaptersWithDrafts.forEach(({ chapter, draft }, chapterIndex) => {
        addPage();
        doc.fillColor('#8b6a2f').font('Helvetica-Bold').fontSize(10).text(`Volet ${chapterIndex + 1}`);
        doc.moveDown(0.3);
        doc.fillColor('#1f2228').font('Helvetica-Bold').fontSize(18).text(
          sanitizeDraftHeadingStrict(
            cleanText(draft?.title, 180) || cleanText(chapter?.title, 180) || `Volet ${chapterIndex + 1}`,
            cleanText(chapter?.title, 180) || `Volet ${chapterIndex + 1}`
          )
        );
        doc.moveDown(0.45);
        doc.fillColor('#1f2228').font('Helvetica').fontSize(11);
        doc.text(
          buildInteriorChapterText({ chapter, draft }),
          {
            align: 'left',
            lineGap: 3
          }
        );
      });

      addPage();
      doc.fillColor(resolvedAccentColor).font('Helvetica-Bold').fontSize(10).text('4E DE COUVERTURE');
      doc.moveDown(0.5);
      doc.fillColor(resolvedTextColor).font('Helvetica').fontSize(11).text(
        backBlurb,
        { align: 'left', lineGap: 2 }
      );
      if (backQuote) {
        doc.moveDown(0.8);
        doc.fillColor(resolvedTextColor).font('Helvetica-Oblique').fontSize(11).text(`"${backQuote}"`, { align: 'left' });
      }
      if (backDateLocation) {
        doc.moveDown(0.8);
        doc.fillColor('#6b7280').font('Helvetica').fontSize(9).text(backDateLocation, { align: 'left' });
      }
      doc.moveDown(0.8);
      doc.fillColor(resolvedAccentColor).font('Helvetica-Bold').fontSize(11).text(backSignature, { align: 'left' });
    }
  });
}

async function generateCoverPdfFile({ filePath, book, chaptersWithDrafts, previewFormat }) {
  const formatSpec = getPreviewFormatSpec(resolveBookPreviewFormat(book, previewFormat));
  const trimWidthMm = formatSpec.trimWidthMm;
  const trimHeightMm = formatSpec.trimHeightMm;
  const bleedMm = 3;
  const estimatedPages = Math.max(
    32,
    Number(book?.pages || chaptersWithDrafts.length * 8 + 8) || 32
  );
  const spineMm = estimateSpineWidthMm(estimatedPages, cleanText(book?.papier, 80));
  const spreadWidthMm = trimWidthMm * 2 + spineMm + bleedMm * 2;
  const spreadHeightMm = trimHeightMm + bleedMm * 2;

  const spreadWidthPt = mmToPt(spreadWidthMm);
  const spreadHeightPt = mmToPt(spreadHeightMm);
  const bleedPt = mmToPt(bleedMm);
  const trimWidthPt = mmToPt(trimWidthMm);
  const trimHeightPt = mmToPt(trimHeightMm);
  const spinePt = mmToPt(spineMm);
  const safeMarginPt = mmToPt(9);

  const {
    coverConfig,
    backCoverConfig,
    frontBg,
    backBg,
    textColor,
    accentColor
  } = resolveCoverPreviewConfig(book);

  const frontTitle = cleanText(coverConfig?.title, 180) || cleanText(book?.title, 180) || 'Livre souvenir';
  const frontSubtitle = cleanText(coverConfig?.subtitle, 220);
  const frontRecipient = cleanText(coverConfig?.recipientLine, 180) || cleanText(book?.recipient_name, 180);
  const frontEventLine = cleanText(coverConfig?.eventLine, 180)
    || [cleanText(book?.event_type, 120), book?.recipient_age ? `${book.recipient_age} ans` : '']
      .filter(Boolean)
      .join(' | ');
  const backBlurb = cleanText(backCoverConfig?.blurb, 1800) || 'Texte de quatrieme de couverture a finaliser.';
  const backQuote = cleanText(backCoverConfig?.quote, 360);
  const backOrganizerLine = cleanText(backCoverConfig?.organizerLine, 220);
  const backDateLocation = cleanText(backCoverConfig?.dateLocation, 180);
  const backIsbn = cleanText(backCoverConfig?.isbnCode, 60);
  const backSignature = cleanText(backCoverConfig?.signature, 180)
    || (book?.recipient_name ? `Les proches de ${book.recipient_name}` : 'Les proches');

  const resolvedFrontBg = normalizePdfColor(frontBg, '#f6f1e7');
  const resolvedBackBg = normalizePdfColor(backBg, '#efe7da');
  const resolvedTextColor = normalizePdfColor(textColor, '#1f2228');
  const resolvedAccentColor = normalizePdfColor(accentColor, '#b8924a');
  const backX = bleedPt;
  const spineX = backX + trimWidthPt;
  const frontX = spineX + spinePt;
  const trimY = bleedPt;

  await writePdfFile({
    filePath,
    title: `${cleanText(book?.title, 180) || 'Livre souvenir'} - Couverture`,
    draw: (doc) => {
      doc.addPage({
        size: [spreadWidthPt, spreadHeightPt],
        margins: { top: 0, right: 0, bottom: 0, left: 0 }
      });

      doc.rect(0, 0, spreadWidthPt, spreadHeightPt).fill('#ffffff');
      doc.rect(backX, trimY, trimWidthPt, trimHeightPt).fill(resolvedBackBg);
      doc.rect(spineX, trimY, spinePt, trimHeightPt).fill('#f3ecdd');
      doc.rect(frontX, trimY, trimWidthPt, trimHeightPt).fill(resolvedFrontBg);

      doc.save();
      doc.dash(3, { space: 3 });
      doc.lineWidth(0.45).strokeColor('#adb5bd');
      doc.rect(backX + safeMarginPt, trimY + safeMarginPt, trimWidthPt - safeMarginPt * 2, trimHeightPt - safeMarginPt * 2).stroke();
      doc.rect(frontX + safeMarginPt, trimY + safeMarginPt, trimWidthPt - safeMarginPt * 2, trimHeightPt - safeMarginPt * 2).stroke();
      doc.undash();
      doc.restore();

      doc.lineWidth(0.8).strokeColor('#9aa0a6');
      doc.rect(backX, trimY, trimWidthPt, trimHeightPt).stroke();
      doc.rect(spineX, trimY, spinePt, trimHeightPt).stroke();
      doc.rect(frontX, trimY, trimWidthPt, trimHeightPt).stroke();

      doc.fillColor(resolvedAccentColor).font('Helvetica-Bold').fontSize(9).text(
        'COUVERTURE',
        frontX + safeMarginPt,
        trimY + mmToPt(12),
        { width: trimWidthPt - safeMarginPt * 2, align: 'left' }
      );
      if (frontEventLine) {
        doc.fillColor(resolvedTextColor).font('Helvetica').fontSize(9).text(
          frontEventLine,
          frontX + safeMarginPt,
          trimY + mmToPt(22),
          { width: trimWidthPt - safeMarginPt * 2, align: 'left' }
        );
      }
      doc.fillColor(resolvedTextColor).font('Helvetica-Bold').fontSize(24).text(
        frontTitle,
        frontX + safeMarginPt,
        trimY + mmToPt(56),
        { width: trimWidthPt - safeMarginPt * 2, align: 'left' }
      );
      if (frontSubtitle) {
        doc.fillColor(resolvedTextColor).font('Helvetica').fontSize(11).text(
          frontSubtitle,
          frontX + safeMarginPt,
          trimY + mmToPt(95),
          { width: trimWidthPt - safeMarginPt * 2, align: 'left' }
        );
      }
      if (frontRecipient) {
        doc.fillColor(resolvedAccentColor).font('Helvetica-Bold').fontSize(12).text(
          frontRecipient,
          frontX + safeMarginPt,
          trimY + trimHeightPt - mmToPt(22),
          { width: trimWidthPt - safeMarginPt * 2, align: 'left' }
        );
      }

      doc.fillColor(resolvedAccentColor).font('Helvetica-Bold').fontSize(9).text(
        '4E DE COUVERTURE',
        backX + safeMarginPt,
        trimY + mmToPt(12),
        { width: trimWidthPt - safeMarginPt * 2, align: 'left' }
      );
      doc.fillColor(resolvedTextColor).font('Helvetica').fontSize(10).text(
        backBlurb,
        backX + safeMarginPt,
        trimY + mmToPt(26),
        { width: trimWidthPt - safeMarginPt * 2, align: 'left', lineGap: 2 }
      );
      if (backQuote) {
        doc.fillColor(resolvedTextColor).font('Helvetica-Oblique').fontSize(10).text(
          `"${backQuote}"`,
          backX + safeMarginPt,
          trimY + trimHeightPt - mmToPt(48),
          { width: trimWidthPt - safeMarginPt * 2, align: 'left' }
        );
      }
      if (backOrganizerLine) {
        doc.fillColor(resolvedTextColor).font('Helvetica').fontSize(9).text(
          backOrganizerLine,
          backX + safeMarginPt,
          trimY + trimHeightPt - mmToPt(34),
          { width: trimWidthPt - safeMarginPt * 2, align: 'left' }
        );
      }
      if (backDateLocation) {
        doc.fillColor(resolvedTextColor).font('Helvetica').fontSize(8).text(
          backDateLocation,
          backX + safeMarginPt,
          trimY + trimHeightPt - mmToPt(26),
          { width: trimWidthPt - safeMarginPt * 2, align: 'left' }
        );
      }
      if (backIsbn) {
        doc.fillColor(resolvedTextColor).font('Helvetica').fontSize(7).text(
          backIsbn,
          backX + safeMarginPt,
          trimY + trimHeightPt - mmToPt(22),
          { width: trimWidthPt - safeMarginPt * 2, align: 'left' }
        );
      }
      doc.fillColor(resolvedAccentColor).font('Helvetica-Bold').fontSize(10).text(
        backSignature,
        backX + safeMarginPt,
        trimY + trimHeightPt - mmToPt(18),
        { width: trimWidthPt - safeMarginPt * 2, align: 'left' }
      );

      if (spinePt > mmToPt(4)) {
        doc.save();
        doc.fillColor(resolvedTextColor).font('Helvetica-Bold').fontSize(10);
        doc.rotate(-90, {
          origin: [spineX + spinePt / 2, trimY + trimHeightPt / 2]
        });
        doc.text(
          frontTitle,
          spineX + mmToPt(1),
          trimY + trimHeightPt / 2 - mmToPt(45),
          { width: trimHeightPt - mmToPt(2), align: 'center' }
        );
        doc.restore();
      }

      doc.fillColor('#6b7280').font('Helvetica').fontSize(8).text(
        `Fond perdu: ${bleedMm} mm | Dos estime: ${spineMm.toFixed(1)} mm | Pages estimees: ${estimatedPages}`,
        mmToPt(6),
        spreadHeightPt - mmToPt(8),
        { width: spreadWidthPt - mmToPt(12), align: 'left' }
      );
    }
  });
}

async function writePdfFile({ filePath, title, draw }) {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      autoFirstPage: false,
      info: {
        Title: title || 'Livre PDF',
        Producer: 'BookFete'
      }
    });
    const output = fs.createWriteStream(filePath);
    let settled = false;

    const resolveOnce = () => {
      if (settled) {
        return;
      }
      settled = true;
      resolve();
    };

    const rejectOnce = (error) => {
      if (settled) {
        return;
      }
      settled = true;
      reject(error);
    };

    output.on('finish', resolveOnce);
    output.on('error', rejectOnce);
    doc.on('error', rejectOnce);

    doc.pipe(output);

    try {
      draw(doc);
      doc.end();
    } catch (error) {
      rejectOnce(error);
      try {
        doc.end();
      } catch (endError) {
        // No-op
      }
    }
  });
}

function buildInteriorChapterText({ chapter, draft }) {
  const sections = [];
  const summary = cleanText(draft?.summary, 1200);
  const chapterTitle = sanitizeDraftHeadingStrict(
    cleanText(draft?.title, 180) || cleanText(chapter?.title, 180) || '',
    cleanText(chapter?.title, 180) || ''
  );
  const chapterText = sanitizeDraftBodyText(
    htmlToPlainText(draft?.html || '', 42000),
    chapterTitle
  );

  if (chapterText) {
    sections.push(chapterText);
  } else if (summary) {
    sections.push(summary);
  }

  if (!chapterText && !summary) {
    sections.push(
      cleanText(chapter?.description, 1800) || 'Ce chapitre est valide mais ne contient pas de texte exploitable pour l impression.'
    );
  }

  return sections.join('\n\n');
}

function htmlToPlainText(value, maxLength = 30000) {
  if (typeof value !== 'string') {
    return '';
  }

  const withoutScripts = value
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ');
  const withLineBreaks = withoutScripts
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|section|article|h1|h2|h3|h4|h5|h6)>/gi, '\n\n')
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<\/li>/gi, '\n');
  const withoutTags = withLineBreaks.replace(/<[^>]+>/g, ' ');
  const decoded = decodeHtmlEntities(withoutTags);
  const normalized = decoded
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();

  if (!normalized) {
    return '';
  }

  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength).trim()}...`
    : normalized;
}

function decodeHtmlEntities(value) {
  if (!value) {
    return '';
  }

  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, '\'')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function estimateSpineWidthMm(totalPages, paperType) {
  const pages = Math.max(32, Number(totalPages) || 32);
  const normalizedPaper = cleanText(paperType, 80).toLowerCase();
  let sheetCaliperMm = 0.1;

  if (normalizedPaper.includes('premium') || normalizedPaper.includes('luxe')) {
    sheetCaliperMm = 0.12;
  } else if (normalizedPaper.includes('satine')) {
    sheetCaliperMm = 0.11;
  }

  const sheetCount = Math.ceil(pages / 2);
  const spineMm = Math.max(4, sheetCount * sheetCaliperMm);

  return Number(spineMm.toFixed(2));
}

function mmToPt(valueMm) {
  return Number(valueMm || 0) * MM_TO_PT;
}

function normalizePdfFileName(value, fallback = 'livre') {
  const normalized = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || fallback;
}

function normalizePdfColor(value, fallback) {
  if (typeof value !== 'string') {
    return fallback;
  }

  const normalized = value.trim();
  if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(normalized)) {
    return normalized;
  }

  return fallback;
}

function sanitizeCssValue(value, fallback) {
  if (typeof value !== 'string') {
    return fallback;
  }

  const normalized = value.trim();
  return /^[#(),.%\-\s\w]+$/.test(normalized) ? normalized : fallback;
}

function sanitizeCssFont(value, fallback) {
  if (typeof value !== 'string') {
    return fallback;
  }

  const normalized = value.trim();
  return /^[\w\s,'"-]+$/.test(normalized) ? normalized : fallback;
}

function summarizeHtmlForChapter(html) {
  return summarizePlainText(
    String(html || '').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' '),
    420
  );
}

function summarizePlainText(value, maxLength = 420) {
  const normalized = cleanText(value, maxLength * 2);
  if (!normalized) {
    return '';
  }

  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength).trim()}...`
    : normalized;
}

function normalizeDraftHtml(value, maxLength = 40000) {
  if (typeof value !== 'string') {
    return '';
  }

  const withoutScripts = value.replace(/<script[\s\S]*?<\/script>/gi, '');
  const trimmed = withoutScripts.trim();

  return trimmed.length > maxLength
    ? trimmed.slice(0, maxLength).trim()
    : trimmed;
}

function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function buildBookDraftSourcePayload({ book, chapters, organizerEmail, contributorNamesByEmail }) {
  const organizerEmailKey = organizerEmail ? organizerEmail.trim().toLowerCase() : '';

  return {
    book: {
      id: book.id,
      title: cleanText(book.title) || 'Livre souvenir',
      eventType: cleanText(book.event_type) || 'evenement',
      recipientName: cleanText(book.recipient_name) || 'la personne celebree',
      recipientAge: book.recipient_age || null,
      recipientGender: cleanText(book.recipient_gender) || '',
      finition: cleanText(book.finition) || '',
      papier: cleanText(book.papier) || '',
      styleNarratif: cleanText(book.style_narratif) || 'intime',
      aiProjectBrief: cleanText(book?.cover_config?.aiProjectBrief, 900),
      pages: book.pages || null,
      minPagesPerChapter: 4
    },
    chapters: (chapters || []).map((chapter) => {
      const chapterContributions = Array.isArray(chapter.contributions) ? chapter.contributions : [];
      const chapterInvites = Array.isArray(chapter.chapter_invites) ? chapter.chapter_invites : [];
      const organizerContributions = chapterContributions
        .filter((contribution) => {
          const email = (contribution.contributor_email || '').trim().toLowerCase();
          return organizerEmailKey && email === organizerEmailKey;
        })
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      const organizerContribution = organizerContributions[0] || null;
      const guestContributions = chapterContributions
        .filter((contribution) => {
          const email = (contribution.contributor_email || '').trim().toLowerCase();
          return (
            email !== organizerEmailKey &&
            email !== CHAPTER_STATE_EMAIL &&
            contribution.is_finalized !== false &&
            !contribution.needs_revision
          );
        })
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
        .map((contribution) => {
          const normalizedEmail = (contribution.contributor_email || '').trim().toLowerCase();
          const resolvedName =
            cleanText(contribution.contributor_name) ||
            contributorNamesByEmail[normalizedEmail] ||
            cleanText(normalizedEmail.split('@')[0]) ||
            'Contributeur';

          return {
            contributorName: resolvedName,
            contributorEmail: normalizedEmail,
            approved: Boolean(contribution.approved),
            message: cleanText(contribution.message, 2400),
            photoCount: Array.isArray(contribution.photo_urls) ? contribution.photo_urls.length : 0,
            photoUrls: normalizePhotoUrls(contribution.photo_urls)
          };
        });

      return {
        id: chapter.id,
        title: cleanText(chapter.title) || 'Chapitre',
        description: cleanText(chapter.description, 600),
        amorceText: cleanText(chapter.amorce_text, 320),
        triggers: Array.isArray(chapter.triggers)
          ? chapter.triggers.map((trigger) => cleanText(trigger, 80)).filter(Boolean)
          : [],
        organizerContribution: organizerContribution
          ? {
              message: cleanText(organizerContribution.message, 3000),
              photoCount: Array.isArray(organizerContribution.photo_urls) ? organizerContribution.photo_urls.length : 0,
              photoUrls: normalizePhotoUrls(organizerContribution.photo_urls)
            }
          : null,
        guestContributions,
        stats: {
          invitedCount: chapterInvites.length,
          respondedCount: chapterInvites.filter((invite) => invite.accepted || invite.contributed).length
        }
      };
    })
  };
}

async function generateBookDraftFromAI(sourcePayload) {
  // DB-first prompt policy: no hardcoded prompt flows here.
  // Full-book narrative generation can be added later via dedicated DB template type.
  return buildFallbackDraft(sourcePayload);
}

function buildAIPromptPayload(sourcePayload) {
  return {
    book: sourcePayload.book,
    chapters: (sourcePayload.chapters || []).map((chapter) => ({
      id: chapter.id,
      title: chapter.title,
      description: chapter.description,
      amorceText: chapter.amorceText,
      triggers: chapter.triggers,
      organizerContribution: chapter.organizerContribution
        ? {
            message: chapter.organizerContribution.message,
            photoCount: chapter.organizerContribution.photoCount
          }
        : null,
      guestContributions: (chapter.guestContributions || []).map((contribution) => ({
        contributorName: contribution.contributorName,
        message: contribution.message,
        photoCount: contribution.photoCount
      })),
      stats: chapter.stats
    }))
  };
}

function parseDraftJson(content) {
  if (!content) {
    return null;
  }

  const cleaned = content.replace(/```json|```/gi, '').trim();

  try {
    return JSON.parse(cleaned);
  } catch (firstError) {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) {
      return null;
    }

    try {
      return JSON.parse(match[0]);
    } catch (secondError) {
      return null;
    }
  }
}

function buildFallbackDraft(sourcePayload) {
  const { book, chapters } = sourcePayload;

  return {
    title: book.title,
    subtitle: [book.eventType, book.styleNarratif].filter(Boolean).join(' | '),
    introduction: `Ce brouillon rassemble les souvenirs, messages et attentions prepares pour ${book.recipientName}. Il constitue une premiere base narrative, inspiree par le style ${book.styleNarratif || 'choisi'} et organisee autour des chapitres deja renseignes.`,
    chapters: chapters.map((chapter) => ({
      title: chapter.title,
      intro: chapter.description || `Ce chapitre met en lumiere ${chapter.title.toLowerCase()}.`,
      body: buildChapterBodyFallback(chapter),
      closing: chapter.guestContributions.length > 0
        ? `Ce chapitre montre combien ${book.recipientName} est entoure(e) et inspire des souvenirs sinceres.`
        : ''
    })),
    conclusion: `Ce premier brouillon peut encore etre enrichi, mais il pose deja une base solide pour raconter l'histoire de ${book.recipientName} avec justesse, chaleur et coherence.`
  };
}

function buildChapterBodyFallback(chapter) {
  const sections = [];
  const guestContributions = Array.isArray(chapter?.guestContributions) ? chapter.guestContributions : [];
  const amorceText = cleanText(chapter?.amorceText, 320);
  const triggers = Array.isArray(chapter?.triggers) ? chapter.triggers : [];

  if (chapter?.description) {
    sections.push(`Cadre du chapitre : ${chapter.description}`);
  }

  if (chapter?.organizerContribution?.message) {
    sections.push(`Contribution de l'organisateur : ${chapter.organizerContribution.message}`);
  }

  if (guestContributions.length > 0) {
    sections.push(
      guestContributions
        .slice(0, 4)
        .map((contribution) => `${contribution.contributorName} partage : ${contribution.message}`)
        .join('\n\n')
    );
  }

  if (amorceText) {
    sections.push(`Amorce du chapitre : ${amorceText}`);
  }

  if (triggers.length > 0) {
    sections.push(`Mots declencheurs : ${triggers.join(' | ')}`);
  }

  if (sections.length === 0) {
    sections.push('Ce chapitre est encore en cours de construction et pourra etre enrichi avec de nouveaux souvenirs.');
  }

  return sections.join('\n\n');
}

function renderBookDraftHtml({ book, draft, sourcePayload }) {
  const subtitle = draft.subtitle || [book.event_type, book.style_narratif].filter(Boolean).join(' | ');
  const resolvedPreviewFormat = resolveBookPreviewFormat(book);
  const normalizedLayoutSettings = normalizePreviewLayoutSettings(
    book?.cover_config?.previewLayoutSettings,
    resolvedPreviewFormat
  );
  const chapterBlocks = draft.chapters.map((chapter, index) => {
    const sourceChapter = sourcePayload.chapters[index];
    return renderDraftChapterPages({
      chapter,
      sourceChapter,
      index,
      layoutSettings: normalizedLayoutSettings,
      previewFormat: resolvedPreviewFormat
    });
  }).join('');

  return `
    <article class="draft-book" lang="fr">
      <header class="draft-book-header">
        <div class="draft-book-eyebrow">Brouillon genere</div>
        <h1>${escapeHtml(draft.title || book.title || 'Livre souvenir')}</h1>
        ${subtitle ? `<p class="draft-book-subtitle">${escapeHtml(subtitle)}</p>` : ''}
        <div class="draft-book-meta">
          ${escapeHtml([
            book.recipient_name ? `Destinataire : ${book.recipient_name}` : '',
            book.style_narratif ? `Style : ${book.style_narratif}` : '',
            book.event_type ? `Evenement : ${book.event_type}` : '',
            'Couverture et quatrieme de couverture non traitees dans ce brouillon'
          ].filter(Boolean).join(' | '))}
        </div>
      </header>
      <section class="draft-book-section">
        <h2>Introduction</h2>
        ${formatParagraphs(draft.introduction || '')}
      </section>
      ${chapterBlocks}
      <section class="draft-book-section draft-book-section-final">
        <h2>Conclusion</h2>
        ${formatParagraphs(draft.conclusion || '')}
      </section>
    </article>
  `;
}

function renderDraftChapterPages({
  chapter,
  sourceChapter,
  index,
  layoutSettings = null,
  previewFormat = ''
}) {
  const chapterNumber = Number(index || 0) + 1;
  const chapterRoman = toRomanNumeral(chapterNumber);
  const chapterTitle = sanitizeDraftHeadingStrict(
    chapter.title || sourceChapter?.title || `Volet ${index + 1}`,
    sourceChapter?.title || `Volet ${index + 1}`
  );
  const chapterSub = cleanText(sourceChapter?.description, 170);
  const openingLead = sanitizeOpeningLead(sourceChapter?.description, chapterTitle);
  const normalizedPreviewFormat = resolveBookPreviewFormat(null, previewFormat);
  const normalizedLayoutSettings = normalizePreviewLayoutSettings(
    layoutSettings,
    normalizedPreviewFormat
  );
  const imageProfile = PREVIEW_IMAGE_DENSITY_PROFILES[normalizedLayoutSettings.imageDensity];
  const pageBudget = getPreviewPageTextBudget(
    normalizedLayoutSettings.textDensity,
    normalizedPreviewFormat
  );
  const narrativeParts = splitDraftBody(
    sanitizeDraftBodyText(
      [
        cleanText(chapter?.intro, 1600),
        chapter.body || buildChapterBodyFallback(sourceChapter || {}),
        cleanText(chapter?.closing, 1200)
      ].filter(Boolean).join('\n\n'),
      chapterTitle
    ),
    {
      textDensity: normalizedLayoutSettings.textDensity,
      previewFormat: normalizedPreviewFormat,
      chapterTitle,
      segmentCount: 7
    }
  );
  const guestHighlights = Array.isArray(sourceChapter?.guestContributions)
    ? sourceChapter.guestContributions.slice(0, Math.max(2, pageBudget.guestItems + 1))
    : [];
  const hasFewGuestContributions = guestHighlights.length < 2;
  const allPhotos = collectChapterPhotos(sourceChapter);
  const visiblePhotos = allPhotos.slice(0, imageProfile.maxPhotos);
  const heroPhotoUrl = imageProfile.showHero ? (visiblePhotos[0] || '') : '';
  const galleryPhotos = heroPhotoUrl ? visiblePhotos.slice(1) : visiblePhotos;
  const totalPages = CHAPTER_DRAFT_PAGE_COUNT;
  const endingParagraph = cleanText(chapter?.closing, pageBudget.pageTailChars);
  const endingBody = [
    narrativeParts[6] || '',
    endingParagraph || ''
  ].filter(Boolean).join('\n\n');

  return `
    <section class="draft-book-chapter" lang="fr">
      <div class="draft-book-chapter-shell">
        <section class="draft-book-page draft-book-page-opening">
          <header class="chapter-opening">
            <p class="chapter-num">Chapitre ${escapeHtml(chapterRoman)}</p>
            <h3 class="chapter-title">${escapeHtml(chapterTitle)}</h3>
            ${chapterSub ? `<p class="chapter-sub">${escapeHtml(chapterSub)}</p>` : ''}
            <hr class="chapter-rule" />
          </header>
          ${openingLead ? `<p class="draft-book-intro">${escapeHtml(openingLead)}</p>` : ''}
          <div class="draft-book-body draft-book-body-blocks">
            ${formatParagraphs(
              cleanText(narrativeParts[0] || chapter.intro || '', Math.round(pageBudget.pageBodyChars * 0.72)),
              { paragraphClass: 'draft-book-text-block' }
            )}
          </div>
          ${renderAmorcePrompt(sourceChapter?.amorceText, sourceChapter?.triggers, {
            maxItems: pageBudget.questionItems,
            maxCharsPerItem: pageBudget.questionChars
          })}
          ${renderDraftPageFolio({ pageNumber: 1, totalPages })}
        </section>

        <section class="draft-book-page">
          <div class="draft-book-body draft-book-body-blocks">
            ${formatParagraphs(
              cleanText(narrativeParts[1] || '', pageBudget.pageBodyChars),
              { paragraphClass: 'draft-book-text-block' }
            )}
          </div>
          ${renderDraftPageFolio({ pageNumber: 2, totalPages })}
        </section>

        <section class="draft-book-page">
          <div class="draft-book-body draft-book-body-blocks">
            ${formatParagraphs(
              cleanText(narrativeParts[2] || '', pageBudget.pageBodyChars),
              { paragraphClass: 'draft-book-text-block' }
            )}
          </div>
          ${renderContributionSpotlight(sourceChapter?.organizerContribution, guestHighlights, {
            heading: hasFewGuestContributions ? 'Votre contribution en lumiere' : 'Le regard de l organisateur',
            organizerMaxChars: pageBudget.organizerChars,
            guestMaxChars: pageBudget.guestChars,
            maxGuestHighlights: Math.max(1, Math.ceil(pageBudget.guestItems / 2)),
            preferOrganizer: true
          })}
          ${renderDraftPageFolio({ pageNumber: 3, totalPages })}
        </section>

        <section class="draft-book-page">
          <div class="draft-book-body draft-book-body-blocks">
            ${formatParagraphs(
              cleanText(narrativeParts[3] || '', pageBudget.pageBodyChars),
              { paragraphClass: 'draft-book-text-block' }
            )}
          </div>
          ${heroPhotoUrl ? renderInlineHeroPhoto(heroPhotoUrl, chapterTitle) : ''}
          ${renderDraftPageFolio({ pageNumber: 4, totalPages })}
        </section>

        <section class="draft-book-page">
          <div class="draft-book-body draft-book-body-blocks">
            ${formatParagraphs(
              cleanText(narrativeParts[4] || '', pageBudget.pageBodyChars),
              { paragraphClass: 'draft-book-text-block' }
            )}
          </div>
          ${renderDraftPageFolio({ pageNumber: 5, totalPages })}
        </section>

        <section class="draft-book-page draft-book-page-gallery">
          <div class="draft-book-body draft-book-body-blocks">
            ${formatParagraphs(
              cleanText(narrativeParts[5] || '', pageBudget.pageTailChars),
              { paragraphClass: 'draft-book-text-block' }
            )}
          </div>
          ${renderPhotoGallery(galleryPhotos, { columns: imageProfile.galleryColumns })}
          ${renderDraftPageFolio({ pageNumber: 6, totalPages })}
        </section>

        <section class="draft-book-page">
          ${renderContributionSpotlight(sourceChapter?.organizerContribution, guestHighlights, {
            heading: 'Vos proches ont dit...',
            organizerMaxChars: Math.round(pageBudget.organizerChars * 0.45),
            guestMaxChars: pageBudget.guestChars,
            maxGuestHighlights: Math.max(1, pageBudget.guestItems),
            preferGuests: true
          })}
          ${renderDraftPageFolio({ pageNumber: 7, totalPages })}
        </section>

        <section class="draft-book-page">
          <div class="draft-book-body draft-book-body-blocks">
            ${formatParagraphs(
              cleanText(endingBody || narrativeParts[5] || '', pageBudget.pageTailChars),
              { paragraphClass: 'draft-book-text-block' }
            )}
          </div>
          ${renderDraftPageFolio({ pageNumber: 8, totalPages })}
        </section>
      </div>
    </section>
  `;
}

function getPreviewPageTextBudget(textDensity, previewFormat = '') {
  const normalizedDensity = normalizePreviewTextDensity(textDensity);
  const normalizedPreviewFormat = resolveBookPreviewFormat(null, previewFormat);
  const formatFactor = PREVIEW_FORMAT_TEXT_BUDGET_FACTORS[normalizedPreviewFormat] || 1;
  let baseBudget;

  if (normalizedDensity === 'airy') {
    baseBudget = {
      questionItems: 2,
      questionChars: 120,
      organizerChars: 420,
      guestChars: 140,
      guestItems: 1,
      pageBodyChars: 710,
      pageTailChars: 640
    };
  }
  else if (normalizedDensity === 'compact') {
    baseBudget = {
      questionItems: 3,
      questionChars: 160,
      organizerChars: 700,
      guestChars: 210,
      guestItems: 2,
      pageBodyChars: 980,
      pageTailChars: 860
    };
  } else {
    baseBudget = {
      questionItems: 2,
      questionChars: 140,
      organizerChars: 560,
      guestChars: 170,
      guestItems: 1,
      pageBodyChars: 860,
      pageTailChars: 760
    };
  }

  const isLuxeFormat = normalizedPreviewFormat === 'luxe';

  return {
    questionItems: Math.max(2, Math.min(4, baseBudget.questionItems + (isLuxeFormat ? 1 : 0))),
    questionChars: Math.round(baseBudget.questionChars * formatFactor),
    organizerChars: Math.round(baseBudget.organizerChars * formatFactor),
    guestChars: Math.round(baseBudget.guestChars * formatFactor),
    guestItems: Math.max(1, Math.min(3, baseBudget.guestItems + (isLuxeFormat ? 1 : 0))),
    pageBodyChars: Math.round(baseBudget.pageBodyChars * formatFactor),
    pageTailChars: Math.round(baseBudget.pageTailChars * formatFactor)
  };
}

function renderInlineHeroPhoto(photoUrl, chapterTitle) {
  if (!photoUrl) {
    return '';
  }

  return `
    <figure class="draft-book-media-block">
      <img src="${escapeHtml(photoUrl)}" alt="Illustration ${escapeHtml(chapterTitle || 'chapitre')}" loading="lazy" />
    </figure>
  `;
}

function renderAmorcePrompt(amorceText, triggers, options = {}) {
  const maxItems = Number.isFinite(Number(options.maxItems))
    ? Math.max(1, Math.min(4, Number(options.maxItems)))
    : 3;
  const maxCharsPerItem = Number.isFinite(Number(options.maxCharsPerItem))
    ? Math.max(90, Math.min(220, Number(options.maxCharsPerItem)))
    : 170;
  const safeAmorceText = cleanText(amorceText, 280);
  const items = Array.isArray(triggers)
    ? triggers.map((trigger) => cleanText(trigger, maxCharsPerItem)).filter(Boolean)
    : [];

  if (!safeAmorceText && items.length === 0) {
    return '';
  }

  return `
    <div class="draft-book-question-block">
      ${safeAmorceText ? `<p class="draft-book-amorce-text">« ${escapeHtml(safeAmorceText)} »</p>` : ''}
      ${items.length > 0 ? `
        <ul class="draft-book-question-list">
          ${items.slice(0, maxItems).map((trigger) => `<li><span>${escapeHtml(trigger)}</span></li>`).join('')}
        </ul>
      ` : ''}
    </div>
  `;
}

function renderContributionSpotlight(organizerContribution, guestHighlights, options = {}) {
  const organizerMaxChars = Number.isFinite(Number(options.organizerMaxChars))
    ? Math.max(180, Math.min(1200, Number(options.organizerMaxChars)))
    : 560;
  const guestMaxChars = Number.isFinite(Number(options.guestMaxChars))
    ? Math.max(90, Math.min(420, Number(options.guestMaxChars)))
    : 170;
  const maxGuestHighlights = Number.isFinite(Number(options.maxGuestHighlights))
    ? Math.max(1, Math.min(3, Number(options.maxGuestHighlights)))
    : 1;
  const heading = cleanText(options.heading, 120);
  const preferOrganizer = Boolean(options.preferOrganizer);
  const preferGuests = Boolean(options.preferGuests);
  const blocks = [];

  const organizerMessage = cleanText(organizerContribution?.message || '', organizerMaxChars);
  const safeGuestHighlights = Array.isArray(guestHighlights) ? guestHighlights : [];
  const shouldRenderOrganizer = Boolean(
    organizerMessage
    && (
      preferOrganizer
      || safeGuestHighlights.length === 0
      || !preferGuests
    )
  );

  if (shouldRenderOrganizer) {
    blocks.push(`
      <div class="draft-book-callout">
        <p class="draft-book-callout-text">« ${escapeHtml(organizerMessage)} »</p>
      </div>
    `);
  }

  if (safeGuestHighlights.length > 0) {
    blocks.push(`
      <div class="draft-book-contributor-list">
        ${safeGuestHighlights.slice(0, maxGuestHighlights).map((contribution) => `
          <div class="draft-book-contributor-item">
            <strong>${escapeHtml(contribution.contributorName || 'Contributeur')}</strong>
            <p>${escapeHtml(cleanText(contribution.message, guestMaxChars) || 'Souvenir a integrer dans la version finale.')}</p>
          </div>
        `).join('')}
      </div>
    `);
  }

  if (blocks.length === 0) {
    return '';
  }

  return `
    <div class="draft-book-contribution-spotlight">
      ${heading ? `<div class="draft-book-mini-title">${escapeHtml(heading)}</div>` : ''}
      ${blocks.join('')}
    </div>
  `;
}

function renderPhotoGallery(photos, options = {}) {
  const galleryColumns = Number.isFinite(Number(options.columns))
    ? Math.max(2, Math.min(3, Number(options.columns)))
    : 2;
  const safePhotos = Array.isArray(photos)
    ? photos.filter(Boolean).slice(0, 8)
    : [];

  if (safePhotos.length === 0) {
    return '';
  }

  const galleryClasses = ['draft-book-gallery'];
  if (galleryColumns === 3 && safePhotos.length >= 3) {
    galleryClasses.push('is-cols-3');
  }
  if (safePhotos.length === 1) {
    galleryClasses.push('is-single');
  } else if (safePhotos.length === 2) {
    galleryClasses.push('is-duo');
  } else if (safePhotos.length >= 5) {
    galleryClasses.push('is-mosaic');
  }
  const galleryWrapClass = safePhotos.length === 1
    ? 'draft-book-gallery-wrap is-single'
    : 'draft-book-gallery-wrap';

  return `
    <div class="${galleryWrapClass}">
      <div class="draft-book-mini-title">Instants en images</div>
      <div class="${galleryClasses.join(' ')}">
        ${safePhotos.map((photoUrl, photoIndex) => `
          <figure class="draft-book-photo">
            <img src="${escapeHtml(photoUrl)}" alt="Photo du chapitre ${photoIndex + 1}" loading="lazy" />
          </figure>
        `).join('')}
      </div>
    </div>
  `;
}

function splitDraftBody(text, options = {}) {
  const textDensity = normalizePreviewTextDensity(options?.textDensity);
  const profile = PREVIEW_TEXT_DENSITY_PROFILES[textDensity];
  const normalizedPreviewFormat = resolveBookPreviewFormat(null, options?.previewFormat);
  const formatFactor = PREVIEW_FORMAT_TEXT_BUDGET_FACTORS[normalizedPreviewFormat] || 1;
  const requestedSegmentCount = Number.isFinite(Number(options?.segmentCount))
    ? Number(options.segmentCount)
    : 2;
  const segmentCount = Math.max(2, Math.min(CHAPTER_DRAFT_PAGE_COUNT, requestedSegmentCount));
  const rawParagraphs = splitTextToParagraphs(
    text,
    Math.round(profile.maxChars * (segmentCount > 2 ? 1.75 : 1) * formatFactor),
    { preserveParagraphs: true }
  );
  const paragraphs = rawParagraphs
    .flatMap((paragraph) => splitLongParagraphIntoChunks(paragraph, profile.chunkSize || 360))
    .filter(Boolean);

  if (paragraphs.length === 0) {
    return Array.from({ length: segmentCount }, () => '');
  }

  if (segmentCount === 2) {
    const pageOneParagraphs = [];
    const pageTwoParagraphs = [];
    let pageOneChars = 0;

    paragraphs.forEach((paragraph) => {
      const candidateLength = pageOneChars + paragraph.length;
      const shouldStayOnPageOne = (
        candidateLength <= profile.firstPageChars
        || (pageOneParagraphs.length <= 1 && candidateLength <= profile.firstPageChars + profile.firstPageFlexChars)
      );

      if (shouldStayOnPageOne) {
        pageOneParagraphs.push(paragraph);
        pageOneChars = candidateLength;
        return;
      }

      pageTwoParagraphs.push(paragraph);
    });

    if (pageTwoParagraphs.length === 0 && pageOneParagraphs.length > 1) {
      const middle = Math.max(1, Math.floor(pageOneParagraphs.length / 2));
      return [
        pageOneParagraphs.slice(0, middle).join('\n\n'),
        pageOneParagraphs.slice(middle).join('\n\n')
      ];
    }

    const fallbackPageOne = pageOneParagraphs.join('\n\n');
    const fallbackPageTwo = pageTwoParagraphs.join('\n\n');

    if (!fallbackPageTwo) {
      return [fallbackPageOne, ''];
    }

    return [
      fallbackPageOne,
      fallbackPageTwo
    ];
  }

  const totalChars = paragraphs.reduce((sum, paragraph) => sum + paragraph.length, 0);
  const targetCharsPerSegment = Math.max(260, Math.floor(totalChars / segmentCount));
  const segments = Array.from({ length: segmentCount }, () => []);
  let segmentIndex = 0;
  let segmentChars = 0;

  paragraphs.forEach((paragraph, paragraphIndex) => {
    const remainingParagraphs = paragraphs.length - paragraphIndex;
    const remainingSegments = segmentCount - segmentIndex;
    const mustAdvance = remainingParagraphs <= remainingSegments - 1;
    const wouldOverflow = segmentChars + paragraph.length > targetCharsPerSegment;

    if (
      segmentIndex < segmentCount - 1
      && segmentChars > 0
      && (wouldOverflow || mustAdvance)
    ) {
      segmentIndex += 1;
      segmentChars = 0;
    }

    segments[segmentIndex].push(paragraph);
    segmentChars += paragraph.length;
  });

  return segments.map((segmentParagraphs) => segmentParagraphs.join('\n\n'));
}

function splitTextToParagraphs(value, maxLength = 6000, chunkSize = 420) {
  if (typeof value !== 'string') {
    return [];
  }

  const normalized = value
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (!normalized) {
    return [];
  }

  const trimmed = normalized.length > maxLength
    ? `${normalized.slice(0, maxLength).trim()}...`
    : normalized;

  const options = (chunkSize && typeof chunkSize === 'object') ? chunkSize : {};
  const shouldPreserveParagraphs = options.preserveParagraphs !== false;
  const resolvedChunkSize = Number.isFinite(Number(options.chunkSize))
    ? Math.max(180, Number(options.chunkSize))
    : Math.max(180, Number(chunkSize) || 420);
  const paragraphs = trimmed
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.replace(/[ \t]+/g, ' ').replace(/\n/g, ' ').trim())
    .filter(Boolean);

  if (shouldPreserveParagraphs) {
    return paragraphs;
  }

  return paragraphs
    .flatMap((paragraph) => splitLongParagraphIntoChunks(paragraph, resolvedChunkSize))
    .filter(Boolean);
}

function splitLongParagraphIntoChunks(paragraph, chunkSize = 420) {
  if (!paragraph) {
    return [];
  }

  if (paragraph.length <= chunkSize) {
    return [paragraph];
  }

  const sentenceParts = paragraph
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (sentenceParts.length <= 1) {
    const wordParts = paragraph.split(/\s+/).filter(Boolean);
    const chunks = [];
    let current = '';

    wordParts.forEach((word) => {
      const next = current ? `${current} ${word}` : word;
      if (next.length > chunkSize && current) {
        chunks.push(current);
        current = word;
      } else {
        current = next;
      }
    });

    if (current) {
      chunks.push(current);
    }

    return chunks;
  }

  const chunks = [];
  let current = '';

  sentenceParts.forEach((sentence) => {
    const next = current ? `${current} ${sentence}` : sentence;
    if (next.length > chunkSize && current) {
      chunks.push(current);
      current = sentence;
    } else {
      current = next;
    }
  });

  if (current) {
    chunks.push(current);
  }

  return chunks;
}

function formatParagraphs(text, options = {}) {
  const paragraphClass = cleanText(options?.paragraphClass, 120);
  const paragraphs = splitTextToParagraphs(text, 6000);

  if (paragraphs.length === 0) {
    return '<p class="draft-book-empty">Contenu en cours de generation.</p>';
  }

  return paragraphs
    .map((paragraph) => (
      paragraphClass
        ? `<p class="${escapeHtml(paragraphClass)}">${escapeHtml(paragraph)}</p>`
        : `<p>${escapeHtml(paragraph)}</p>`
    ))
    .join('');
}

function collectChapterPhotos(sourceChapter) {
  const organizerPhotos = Array.isArray(sourceChapter?.organizerContribution?.photoUrls)
    ? sourceChapter.organizerContribution.photoUrls
    : [];
  const guestPhotos = Array.isArray(sourceChapter?.guestContributions)
    ? sourceChapter.guestContributions.flatMap((contribution) => (
        Array.isArray(contribution.photoUrls) ? contribution.photoUrls : []
      ))
    : [];

  return [...new Set([...organizerPhotos, ...guestPhotos].filter(Boolean))];
}

function normalizePhotoUrls(photoUrls, maxItems = 8) {
  if (!Array.isArray(photoUrls)) {
    return [];
  }

  return photoUrls
    .map((photoUrl) => (typeof photoUrl === 'string' ? photoUrl.trim() : ''))
    .filter(Boolean)
    .slice(0, maxItems);
}

function cleanText(value, maxLength = 1200) {
  if (typeof value !== 'string') {
    return '';
  }

  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength).trim()}...`
    : normalized;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

module.exports = router;
