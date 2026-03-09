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
const authenticate = require('../middleware/auth');

const CHAPTER_STATE_EMAIL = '__chapter_state__@system.local';
const CHAPTER_DRAFT_EMAIL = '__chapter_draft__@system.local';
const MAX_CHAPTER_AI_GENERATIONS = 3;
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
const DEFAULT_PREVIEW_FORMAT = 'prestige';
const PREVIEW_FORMATS = {
  prestige: {
    id: 'prestige',
    label: 'Prestige',
    trimWidthMm: 148,
    trimHeightMm: 210
  },
  livret: {
    id: 'livret',
    label: 'Livret',
    trimWidthMm: 130,
    trimHeightMm: 190
  },
  carre: {
    id: 'carre',
    label: 'Carre',
    trimWidthMm: 210,
    trimHeightMm: 210
  }
};
const pdfExportJobs = new Map();

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

router.post('/:id/chapters/:chapterId/generate-draft', authenticate, async (req, res) => {
  try {
    const { book, chapters, currentChapter, contributors } = await loadOwnedBookChapterContext({
      bookId: req.params.id,
      chapterId: req.params.chapterId,
      ownerId: req.user.id
    });
    const existingDraftState = extractChapterDraftState(currentChapter);
    const generationCount = Number(existingDraftState?.generationCount || 0);

    if (existingDraftState?.status === 'validated') {
      return res.status(400).json({ error: 'Ce chapitre est deja valide definitivement' });
    }

    if (generationCount >= MAX_CHAPTER_AI_GENERATIONS) {
      return res.status(400).json({ error: 'La limite de 3 generations IA a ete atteinte pour ce chapitre' });
    }

    const contributorNamesByEmail = buildContributorNamesByEmail(contributors);
    const sourcePayload = buildChapterDraftSourcePayload({
      book,
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
    const nextState = {
      version: 1,
      status: 'draft',
      generationCount: generationCount + 1,
      maxGenerations: MAX_CHAPTER_AI_GENERATIONS,
      title: cleanText(generatedDraft.title, 180) || cleanText(currentChapter.title, 180) || 'Chapitre',
      summary: cleanText(generatedDraft.summary, 600) || summarizeHtmlForChapter(html),
      html,
      lastGeneratedAt: new Date().toISOString(),
      lastEditedAt: existingDraftState?.lastEditedAt || null,
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
      generatedAt: nextState.lastGeneratedAt,
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
  return PREVIEW_FORMATS[normalized] ? normalized : '';
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
    const { book, chapters } = await loadOwnedBookChapterContext({
      bookId,
      ownerId: req.user.id
    });
    const previewFormat = resolveBookPreviewFormat(book, req.body?.previewFormat);
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

    const html = renderValidatedBookPreviewHtml({
      book,
      chaptersWithDrafts,
      previewFormat
    });

    res.json({
      generatedAt: new Date().toISOString(),
      html,
      previewFormat
    });
  } catch (error) {
    console.error('Erreur apercu livre:', error);
    res.status(error.status || 500).json({ error: error.message || 'Erreur lors de la generation du brouillon' });
  }
});

router.post('/:id/export-final-pdf', authenticate, async (req, res) => {
  try {
    const db = createUserScopedClient(req) || supabase;
    const bookId = req.params.id;
    const { book, chapters } = await loadOwnedBookChapterContext({
      bookId,
      ownerId: req.user.id
    });
    const previewFormat = resolveBookPreviewFormat(book, req.body?.previewFormat);

    const chaptersWithDrafts = (chapters || []).map((chapter) => ({
      chapter,
      draft: extractChapterDraftState(chapter)
    }));
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
      previewFormat
    });

    if (targetOrder) {
      const nextOrderMetadata = mergeOrderMetadata(targetOrder.metadata, {
        pdfJobId: jobId,
        pdfRequestedAt: createdAt,
        pdfPreviewFormat: previewFormat,
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
      previewFormat
    }).catch((error) => {
      console.error('Erreur pipeline export PDF:', error);
    });

    return res.status(202).json({
      jobId,
      status: 'queued',
      createdAt,
      previewFormat
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
    const db = createUserScopedClient(req) || supabase;
    const bookId = req.params.id;
    const jobId = req.params.jobId;
    const job = getOwnedPdfExportJob({
      jobId,
      bookId,
      ownerId: req.user.id
    });

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
            interior: {
              kind: 'interior',
              fileName: job.files?.interior?.fileName || 'interieur.pdf'
            },
            cover: {
              kind: 'cover',
              fileName: job.files?.cover?.fileName || 'couverture.pdf'
            }
          }
        : null
    });
  } catch (error) {
    console.error('Erreur statut export PDF:', error);
    return res.status(500).json({
      error: error.message || 'Erreur lors de la recuperation du statut export'
    });
  }
});

router.get('/:id/export-final-pdf/:jobId/download/:kind', authenticate, async (req, res) => {
  try {
    const db = createUserScopedClient(req) || supabase;
    const bookId = req.params.id;
    const jobId = req.params.jobId;
    const kind = req.params.kind;
    const job = getOwnedPdfExportJob({
      jobId,
      bookId,
      ownerId: req.user.id
    });

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
        error: 'Le PDF final nest pas encore disponible'
      });
    }

    if (kind !== 'interior' && kind !== 'cover') {
      return res.status(400).json({ error: 'Type de fichier invalide' });
    }

    const targetFile = job.files?.[kind];
    if (!targetFile?.path || !fs.existsSync(targetFile.path)) {
      return res.status(404).json({ error: 'Fichier PDF introuvable' });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${targetFile.fileName || `${kind}.pdf`}"`
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
    return res.status(500).json({
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

  const [{ data: chapters, error: chaptersError }, { data: contributors, error: contributorsError }] = await Promise.all([
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
      .eq('book_id', bookId)
  ]);

  if (chaptersError) {
    throw chaptersError;
  }

  if (contributorsError) {
    throw contributorsError;
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
        message: cleanText(contribution.message, 2400),
        photoUrls: normalizePhotoUrls(contribution.photo_urls)
      };
    });

  return {
    book: {
      id: book.id,
      title: cleanText(book.title, 180) || 'Livre souvenir',
      recipientName: cleanText(book.recipient_name, 180) || 'la personne celebree',
      eventType: cleanText(book.event_type, 120) || 'evenement',
      styleNarratif: cleanText(book.style_narratif, 120) || 'intime',
      aiProjectBrief: cleanText(book?.cover_config?.aiProjectBrief, 900),
      minPagesPerChapter: 4
    },
    chapter: {
      id: currentChapter.id,
      orderIndex: Number(currentChapter.order_index || 0),
      title: cleanText(currentChapter.title, 180) || 'Chapitre',
      description: cleanText(currentChapter.description, 700),
      questions: Array.isArray(currentChapter.questions_ia)
        ? currentChapter.questions_ia.map((question) => cleanText(question, 260)).filter(Boolean)
        : [],
      organizerContribution: organizerContribution
        ? {
            message: cleanText(organizerContribution.message, 3200),
            photoUrls: normalizePhotoUrls(organizerContribution.photo_urls)
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

async function generateChapterDraftFromAI(sourcePayload) {
  const fallbackDraft = buildFallbackChapterDraft(sourcePayload);

  if (!aiService?.mistral) {
    return fallbackDraft;
  }

  const prompt = [
    'Tu rediges le brouillon d un seul chapitre d un livre souvenir.',
    'Tu dois produire exactement 4 pages de contenu coherentes entre elles.',
    'Le ton doit respecter le style narratif demande et rester fluide en francais.',
    'Prends en compte les resumes des chapitres precedents pour garder une vraie continuite narrative.',
    'Si un brief libre est fourni, utilise-le comme intention editoriale prioritaire.',
    'Ignore totalement les contributions non validees : seules les donnees fournies ci-dessous sont utilisables.',
    'Retourne UNIQUEMENT un objet JSON valide avec cette structure exacte :',
    '{',
    '  "title": "string",',
    '  "pages": [',
    '    { "title": "string", "body": "string" },',
    '    { "title": "string", "body": "string" },',
    '    { "title": "string", "body": "string" },',
    '    { "title": "string", "body": "string" }',
    '  ],',
    '  "summary": "string"',
    '}',
    'Ne mets aucun markdown, aucun commentaire, aucun texte hors du JSON.',
    '',
    'DONNEES SOURCE :',
    JSON.stringify({
      book: sourcePayload.book,
      chapter: {
        ...sourcePayload.chapter,
        organizerContribution: sourcePayload.chapter.organizerContribution
          ? {
              message: sourcePayload.chapter.organizerContribution.message,
              photoCount: sourcePayload.chapter.organizerContribution.photoUrls.length
            }
          : null,
        guestContributions: sourcePayload.chapter.guestContributions.map((contribution) => ({
          contributorName: contribution.contributorName,
          message: contribution.message,
          photoCount: Array.isArray(contribution.photoUrls) ? contribution.photoUrls.length : 0
        })),
        photoUrls: undefined
      },
      previousChapterSummaries: sourcePayload.previousChapterSummaries
    })
  ].join('\n');

  try {
    const response = await aiService.mistral.chat.complete({
      model: 'mistral-small-latest',
      messages: [
        {
          role: 'system',
          content: 'Tu es un redacteur editorial de livres souvenirs. Tu produis uniquement du JSON valide.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.55,
      maxTokens: 2200
    });

    const content = response?.choices?.[0]?.message?.content || '';
    const parsed = parseDraftJson(content);

    if (!parsed || !Array.isArray(parsed.pages)) {
      return fallbackDraft;
    }

    return {
      title: cleanText(parsed.title, 180) || fallbackDraft.title,
      pages: ensureFourDraftPages(parsed.pages, fallbackDraft.pages),
      summary: cleanText(parsed.summary, 600) || fallbackDraft.summary
    };
  } catch (error) {
    console.error('Erreur IA brouillon chapitre:', error);
    return fallbackDraft;
  }
}

function buildFallbackChapterDraft(sourcePayload) {
  const chapter = sourcePayload.chapter || {};
  const recipientName = sourcePayload.book?.recipientName || 'la personne celebree';
  const questions = Array.isArray(chapter.questions) ? chapter.questions : [];
  const guestContributions = Array.isArray(chapter.guestContributions) ? chapter.guestContributions : [];
  const organizerText = chapter.organizerContribution?.message || '';
  const previousBridge = sourcePayload.previousChapterSummaries.length > 0
    ? `Ce chapitre prolonge ${sourcePayload.previousChapterSummaries.slice(-1)[0].summary}`
    : `Ce chapitre ouvre une nouvelle sequence du livre dedie a ${recipientName}.`;
  const projectIntent = sourcePayload.book?.aiProjectBrief
    ? `Intention editoriale : ${sourcePayload.book.aiProjectBrief}`
    : '';

  return {
    title: chapter.title || 'Chapitre',
    pages: [
      {
        title: chapter.title || 'Ouverture',
        body: [
          chapter.description || `${chapter.title || 'Ce chapitre'} pose le decor du souvenir a transmettre.`,
          previousBridge,
          projectIntent,
          questions.length > 0 ? `Pistes editoriales : ${questions.slice(0, 4).join(' ')}` : ''
        ].filter(Boolean).join('\n\n')
      },
      {
        title: 'Recit principal',
        body: organizerText || `L organisateur peut encore enrichir ce chapitre pour raconter avec plus de nuances ce moment cle autour de ${recipientName}.`
      },
      {
        title: 'Voix des proches',
        body: guestContributions.length > 0
          ? guestContributions
              .slice(0, 4)
              .map((contribution) => `${contribution.contributorName} partage : ${contribution.message}`)
              .join('\n\n')
          : 'Aucune contribution validee supplementaire n est encore integree a ce chapitre.'
      },
      {
        title: 'Clore la sequence',
        body: [
          `Ce chapitre se referme sur une tonalite ${sourcePayload.book?.styleNarratif || 'sensible'} et prepare la transition vers la suite du livre.`,
          chapter.stats?.respondedCount
            ? `${chapter.stats.respondedCount} contribution(s) validee(s) ont nourri ce brouillon.`
            : 'Le chapitre peut encore etre enrichi avant la validation finale.'
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

function ensureFourDraftPages(pages, fallbackPages) {
  const safePages = Array.isArray(pages) ? pages : [];
  const fallback = Array.isArray(fallbackPages) ? fallbackPages : [];
  const normalizedPages = [];

  for (let index = 0; index < 4; index += 1) {
    const currentPage = safePages[index] || fallback[index] || {};
    normalizedPages.push({
      title: cleanText(currentPage.title, 180) || `Page ${index + 1}`,
      body: cleanText(currentPage.body, 3200) || cleanText(fallback[index]?.body, 3200) || 'Contenu a enrichir.'
    });
  }

  return normalizedPages;
}

function renderChapterDraftPreviewHtml({ book, chapter, draft, sourcePayload }) {
  const chapterNumber = Number(chapter?.order_index || 0) + 1;
  const visiblePhotos = Array.isArray(sourcePayload?.chapter?.photoUrls)
    ? sourcePayload.chapter.photoUrls.slice(0, 6)
    : [];
  const remainingPhotoCount = Math.max(
    0,
    (Array.isArray(sourcePayload?.chapter?.photoUrls) ? sourcePayload.chapter.photoUrls.length : 0) - visiblePhotos.length
  );
  const guestHighlights = Array.isArray(sourcePayload?.chapter?.guestContributions)
    ? sourcePayload.chapter.guestContributions.slice(0, 3)
    : [];

  return `
    <section class="draft-book-chapter">
      <div class="draft-book-chapter-shell">
        ${draft.pages.map((page, index) => `
          <section class="draft-book-page${index === 0 ? ' draft-book-page-opening' : ''}${index === 3 ? ' draft-book-page-gallery' : ''}">
            <div class="draft-book-page-label">Page ${index + 1}</div>
            ${index === 0 ? `<div class="draft-book-chapter-index">Chapitre ${chapterNumber}</div>` : ''}
            <h3>${escapeHtml(page.title || draft.title || chapter?.title || `Chapitre ${chapterNumber}`)}</h3>
            ${index === 0 && sourcePayload?.chapter?.description
              ? `<p class="draft-book-intro">${escapeHtml(sourcePayload.chapter.description)}</p>`
              : ''}
            <div class="draft-book-body">
              ${formatParagraphs(page.body || '')}
            </div>
            ${index === 0 ? renderQuestionList(sourcePayload?.chapter?.questions) : ''}
            ${index === 2 ? renderContributionSpotlight(sourcePayload?.chapter?.organizerContribution, guestHighlights) : ''}
            ${index === 3 ? renderPhotoGallery(visiblePhotos, remainingPhotoCount) : ''}
          </section>
        `).join('')}
      </div>
      <div class="draft-book-section" style="margin-top:16px;">
        <div class="draft-book-mini-title">Resume de chapitre</div>
        ${formatParagraphs(draft.summary || summarizeHtmlForChapter(draft.html || ''))}
      </div>
    </section>
  `;
}

function renderValidatedBookPreviewHtml({ book, chaptersWithDrafts, previewFormat }) {
  const resolvedPreviewFormat = resolveBookPreviewFormat(book, previewFormat);
  const previewFormatClass = `draft-book-format-${resolvedPreviewFormat}`;
  const chapterBlocks = chaptersWithDrafts
    .map(({ draft }) => draft?.html || '')
    .filter(Boolean)
    .join('');
  const frontCoverBlock = renderAssembledFrontCover(book);
  const backCoverBlock = renderAssembledBackCover(book);
  const chaptersContent = chapterBlocks
    || '<section class="draft-book-section"><p class="draft-book-empty">Aucun chapitre valide.</p></section>';

  return `
    <article class="draft-book ${previewFormatClass}" data-preview-format="${resolvedPreviewFormat}">
      <header class="draft-book-header">
        <div class="draft-book-eyebrow">Apercu assemble</div>
        <h1>${escapeHtml(cleanText(book.title, 180) || 'Livre souvenir')}</h1>
        <div class="draft-book-meta">
          ${escapeHtml([
            book.recipient_name ? `Destinataire : ${book.recipient_name}` : '',
            book.style_narratif ? `Style : ${book.style_narratif}` : '',
            book.event_type ? `Evenement : ${book.event_type}` : ''
          ].filter(Boolean).join(' | '))}
        </div>
      </header>
      ${frontCoverBlock}
      ${chaptersContent}
      ${backCoverBlock}
    </article>
  `;
}

function renderAssembledFrontCover(book) {
  const {
    styleId,
    styleTag,
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
  const motif = cleanText(coverConfig.motif, 30) || 'line';
  const showMonogram = coverConfig.showMonogram !== false;
  const monogram = buildCoverMonogram(recipientLine || title);

  return `
    <section class="draft-book-section">
      <div class="draft-book-mini-title">Couverture</div>
      <div class="cover-preview-spread" style="grid-template-columns: minmax(0, 1fr);">
        <article
          class="cover-preview-card is-front cover-style-${styleId} is-active"
          style="--cover-bg:${escapeHtml(frontBg)};--cover-text:${escapeHtml(textColor)};--cover-accent:${escapeHtml(accentColor)};--cover-title-font:${escapeHtml(titleFont)};--cover-body-font:${escapeHtml(bodyFont)};"
        >
          <div class="cover-preview-safe-zone"></div>
          <div class="cover-preview-tag">${escapeHtml(styleTag)}</div>
          ${showMonogram ? `<div class="cover-preview-monogram">${escapeHtml(monogram)}</div>` : ''}
          <div class="cover-preview-front-copy">
            ${eventLine ? `<div class="cover-preview-front-event">${escapeHtml(eventLine)}</div>` : ''}
            <h3>${escapeHtml(title)}</h3>
            ${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ''}
            ${recipientLine ? `<div class="cover-preview-front-recipient">${escapeHtml(recipientLine)}</div>` : ''}
          </div>
          ${motif === 'line' ? '<div class="cover-preview-motif-line" aria-hidden="true"></div>' : ''}
          ${motif === 'corner' ? '<div class="cover-preview-motif-corner" aria-hidden="true"></div>' : ''}
        </article>
      </div>
    </section>
  `;
}

function renderAssembledBackCover(book) {
  const {
    styleId,
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
    backCoverConfig.show_contributors ?? backCoverConfig.showContributors ?? true
  );
  const showQrHint = Boolean(backCoverConfig.showQrHint);
  const chips = [];

  if (showContributors) {
    chips.push('Contributions collectives');
  }
  if (showQrHint) {
    chips.push('Emplacement QR');
  }

  return `
    <section class="draft-book-section">
      <div class="draft-book-mini-title">4e de couverture</div>
      <div class="cover-preview-spread" style="grid-template-columns: minmax(0, 1fr);">
        <article
          class="cover-preview-card is-back cover-style-${styleId} is-active"
          style="--cover-bg:${escapeHtml(backBg)};--cover-text:${escapeHtml(textColor)};--cover-accent:${escapeHtml(accentColor)};--cover-title-font:${escapeHtml(titleFont)};--cover-body-font:${escapeHtml(bodyFont)};"
        >
          <div class="cover-preview-safe-zone"></div>
          <div class="cover-preview-back-copy">
            ${formatParagraphs(blurb || 'Texte de quatrieme de couverture a definir.')}
          </div>
          ${quote ? `<blockquote class="cover-preview-back-quote">"${escapeHtml(quote)}"</blockquote>` : ''}
          <div class="cover-preview-back-footer">
            ${chips.length > 0 ? `<div class="cover-preview-chip">${escapeHtml(chips.join(' | '))}</div>` : '<span></span>'}
            ${showQrHint ? '<div class="cover-preview-qr">QR</div>' : ''}
          </div>
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

  const stylePresets = {
    editorial_classic: {
      id: 'editorial_classic',
      tag: 'Edition prestige',
      titleFont: "'Baskerville', 'Palatino Linotype', serif",
      bodyFont: "'Inter', sans-serif"
    },
    minimal_contemporary: {
      id: 'minimal_contemporary',
      tag: 'Collection moderne',
      titleFont: "'Avenir Next', 'Inter', sans-serif",
      bodyFont: "'Inter', sans-serif"
    },
    heritage_emotion: {
      id: 'heritage_emotion',
      tag: 'Memoire intime',
      titleFont: "'Garamond', 'Times New Roman', serif",
      bodyFont: "'Inter', sans-serif"
    }
  };
  const palettePresets = {
    ivoire_dore: {
      front: '#f6f1e7',
      back: '#efe7da',
      text: '#1f2228',
      accent: '#b8924a'
    },
    sauge_precieuse: {
      front: '#eaf0ea',
      back: '#e2ebe2',
      text: '#1f2a28',
      accent: '#8f9f8f'
    },
    bleu_poudre: {
      front: '#e9edf4',
      back: '#e1e7f0',
      text: '#1f2530',
      accent: '#7f90a8'
    }
  };

  const requestedStyleId = cleanText(coverConfig.template || backCoverConfig.template, 80);
  const style = stylePresets[requestedStyleId] || stylePresets.editorial_classic;
  const requestedPaletteId = cleanText(coverConfig.palette || backCoverConfig.palette, 80);
  const palette = palettePresets[requestedPaletteId] || palettePresets.ivoire_dore;
  const frontBg = sanitizeCssValue(coverConfig.color, palette.front);
  const backBg = sanitizeCssValue(backCoverConfig.color, palette.back);
  const textColor = sanitizeCssValue(coverConfig.textColor || backCoverConfig.textColor, palette.text);
  const accentColor = sanitizeCssValue(coverConfig.accentColor || backCoverConfig.accentColor, palette.accent);
  const titleFont = sanitizeCssFont(coverConfig.font, style.titleFont);
  const bodyFont = sanitizeCssFont(backCoverConfig.font, style.bodyFont);

  return {
    styleId: style.id,
    styleTag: style.tag,
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

async function processPdfExportJob({ jobId, book, chaptersWithDrafts, previewFormat }) {
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
      previewFormat
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

async function generateFinalBookPdfFiles({ book, chaptersWithDrafts, jobId, previewFormat }) {
  await fsp.mkdir(PDF_EXPORT_DIR, { recursive: true });
  const safeBookName = normalizePdfFileName(cleanText(book?.title, 120), 'livre');
  const interiorPath = path.join(PDF_EXPORT_DIR, `${safeBookName}-${jobId}-interieur.pdf`);
  const coverPath = path.join(PDF_EXPORT_DIR, `${safeBookName}-${jobId}-couverture.pdf`);
  const resolvedPreviewFormat = resolveBookPreviewFormat(book, previewFormat);
  const rendererMode = String(process.env.PDF_RENDERER_MODE || 'browser').toLowerCase();
  const shouldUseBrowserRenderer = rendererMode !== 'legacy' && rendererMode !== 'pdfkit';
  let rendererUsed = shouldUseBrowserRenderer ? 'browser' : 'legacy';

  if (shouldUseBrowserRenderer) {
    try {
      await generateBookPdfFilesFromHtml({
        interiorPath,
        coverPath,
        book,
        chaptersWithDrafts,
        jobId,
        previewFormat: resolvedPreviewFormat
      });
    } catch (browserError) {
      const strictBrowserMode = rendererMode === 'browser-strict';
      if (strictBrowserMode) {
        throw browserError;
      }

      console.error('Generation PDF navigateur indisponible, fallback PDFKit:', browserError);
      rendererUsed = 'legacy';
      await generateInteriorPdfFile({
        filePath: interiorPath,
        book,
        chaptersWithDrafts,
        previewFormat: resolvedPreviewFormat
      });

      await generateCoverPdfFile({
        filePath: coverPath,
        book,
        chaptersWithDrafts,
        previewFormat: resolvedPreviewFormat
      });
    }
  } else {
    await generateInteriorPdfFile({
      filePath: interiorPath,
      book,
      chaptersWithDrafts,
      previewFormat: resolvedPreviewFormat
    });

    await generateCoverPdfFile({
      filePath: coverPath,
      book,
      chaptersWithDrafts,
      previewFormat: resolvedPreviewFormat
    });
    rendererUsed = 'legacy';
  }

  return {
    renderer: rendererUsed,
    interior: {
      path: interiorPath,
      fileName: `${safeBookName}-interieur.pdf`
    },
    cover: {
      path: coverPath,
      fileName: `${safeBookName}-couverture.pdf`
    }
  };
}

async function generateBookPdfFilesFromHtml({
  interiorPath,
  coverPath,
  book,
  chaptersWithDrafts,
  jobId,
  previewFormat
}) {
  const browserPath = resolvePdfBrowserPath();
  if (!browserPath) {
    throw new Error(
      'Aucun navigateur headless trouve pour un rendu PDF fidele. Definissez PDF_BROWSER_PATH (Chrome/Edge).'
    );
  }

  const interiorHtml = renderValidatedBookInteriorHtml({
    book,
    chaptersWithDrafts,
    previewFormat
  });
  const coverHtml = renderValidatedBookCoverHtml({
    book,
    previewFormat
  });

  const interiorDocument = buildPrintableBookHtmlDocument({
    title: `${cleanText(book?.title, 180) || 'Livre souvenir'} - Interieur`,
    bodyHtml: interiorHtml,
    mode: 'interior',
    previewFormat
  });
  const coverDocument = buildPrintableBookHtmlDocument({
    title: `${cleanText(book?.title, 180) || 'Livre souvenir'} - Couverture`,
    bodyHtml: coverHtml,
    mode: 'cover',
    previewFormat
  });

  await renderPdfFromHtmlWithBrowser({
    browserPath,
    html: interiorDocument,
    outputPath: interiorPath,
    htmlPath: path.join(PDF_EXPORT_DIR, `job-${jobId}-interieur.html`)
  });
  await renderPdfFromHtmlWithBrowser({
    browserPath,
    html: coverDocument,
    outputPath: coverPath,
    htmlPath: path.join(PDF_EXPORT_DIR, `job-${jobId}-couverture.html`)
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

function renderValidatedBookInteriorHtml({ book, chaptersWithDrafts, previewFormat }) {
  const resolvedPreviewFormat = resolveBookPreviewFormat(book, previewFormat);
  const previewFormatClass = `draft-book-format-${resolvedPreviewFormat}`;
  const chapterBlocks = chaptersWithDrafts
    .map(({ draft }) => draft?.html || '')
    .filter(Boolean)
    .join('');
  const chaptersContent = chapterBlocks
    || '<section class="draft-book-section"><p class="draft-book-empty">Aucun chapitre valide.</p></section>';

  return `
    <article class="draft-book ${previewFormatClass}" data-preview-format="${resolvedPreviewFormat}">
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
      ${chaptersContent}
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
      <header class="draft-book-header">
        <div class="draft-book-eyebrow">Couverture finale</div>
        <h1>${escapeHtml(cleanText(book.title, 180) || 'Livre souvenir')}</h1>
        <div class="draft-book-meta">Couverture et 4e de couverture</div>
      </header>
      <section class="cover-print-spread">
        ${backCard}
        ${frontCard}
      </section>
    </article>
  `;
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

  return `
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
      font-family: "Inter", "Segoe UI", Arial, sans-serif;
      color: #1f2228;
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
      font-size: 28px;
      line-height: 1.2;
    }

    .draft-book-meta {
      font-size: 11px;
      color: #5f6770;
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

    .draft-book-section h2,
    .draft-book-chapter h3 {
      margin: 0 0 4mm;
    }

    .draft-book-chapter {
      margin: 0;
    }

    .draft-book-chapter-shell {
      display: block;
    }

    .draft-book-page {
      background: #ffffff;
      border: 1px solid rgba(223, 216, 201, 0.9);
      border-radius: 10px;
      padding: 6mm;
      min-height: ${interiorPageMinHeightMm}mm;
      box-shadow: none;
      display: flex;
      flex-direction: column;
      page-break-after: always;
      break-after: page;
    }

    .draft-book-page-opening {
      border-color: rgba(184, 146, 74, 0.45);
    }

    .draft-book-page-gallery {
      background: linear-gradient(180deg, rgba(255, 255, 255, 0.94) 0%, rgba(249, 245, 236, 0.96) 100%);
    }

    .draft-book-page-label {
      display: inline-flex;
      align-self: flex-start;
      margin-bottom: 4mm;
      padding: 3px 10px;
      border-radius: 999px;
      background: rgba(184, 146, 74, 0.16);
      color: #8b6a2f;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .draft-book-chapter-index {
      font-size: 10px;
      font-weight: 700;
      color: #8b6a2f;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      margin-bottom: 3mm;
    }

    .draft-book-intro {
      margin: 0 0 4mm;
      font-style: italic;
      color: #5f6770;
      line-height: 1.7;
    }

    .draft-book-body {
      flex: 1;
    }

    .draft-book-body p,
    .draft-book-section p,
    .draft-book-callout p,
    .draft-book-contributor-item p {
      margin: 0 0 3.5mm;
      line-height: 1.72;
      font-size: 12px;
      page-break-inside: avoid;
      break-inside: avoid-page;
      orphans: 3;
      widows: 3;
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
      margin-bottom: 3.5mm;
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

    .draft-book-question-list {
      margin: 0;
      padding-left: 18px;
      font-size: 12px;
    }

    .draft-book-question-list li {
      margin-bottom: 7px;
      line-height: 1.55;
    }

    .draft-book-question-list li:last-child {
      margin-bottom: 0;
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

    .draft-book-contributor-list {
      margin-top: 4mm;
    }

    .draft-book-contributor-item + .draft-book-contributor-item {
      margin-top: 4mm;
      padding-top: 4mm;
      border-top: 1px solid rgba(184, 146, 74, 0.12);
    }

    .draft-book-gallery-wrap {
      margin-top: 5mm;
    }

    .draft-book-gallery {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 3.5mm;
    }

    .draft-book-photo {
      margin: 0;
      min-height: 42mm;
      border-radius: 8px;
      overflow: hidden;
      background: rgba(232, 232, 232, 0.45);
    }

    .draft-book-photo img {
      display: block;
      width: 100%;
      height: 100%;
      min-height: 42mm;
      object-fit: cover;
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
      page-break-after: always;
      break-after: page;
    }

    .cover-preview-card {
      position: relative;
      min-height: ${coverCardMinHeightMm}mm;
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

    .cover-preview-card.cover-style-minimal_contemporary .cover-preview-front-copy h3 {
      text-transform: uppercase;
      letter-spacing: 0.08em;
      font-size: 24px;
    }

    .cover-preview-card.cover-style-minimal_contemporary .cover-preview-tag {
      border-style: solid;
      letter-spacing: 0.12em;
    }

    .cover-preview-card.cover-style-heritage_emotion .cover-preview-front-copy h3 {
      font-style: italic;
      line-height: 1.18;
    }

    .cover-preview-card.cover-style-heritage_emotion .cover-preview-back-quote {
      font-size: 17px;
    }

    body.mode-cover .draft-book-header {
      page-break-after: avoid;
      break-after: avoid;
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
        doc.fillColor('#8b6a2f').font('Helvetica-Bold').fontSize(10).text(`Chapitre ${chapterIndex + 1}`);
        doc.moveDown(0.3);
        doc.fillColor('#1f2228').font('Helvetica-Bold').fontSize(18).text(
          cleanText(draft?.title, 180) || cleanText(chapter?.title, 180) || `Chapitre ${chapterIndex + 1}`
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
  const chapterText = htmlToPlainText(draft?.html || '', 42000);

  if (summary) {
    sections.push(`Resume du chapitre:\n${summary}`);
  }

  if (chapterText) {
    sections.push(chapterText);
  } else {
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
        questions: Array.isArray(chapter.questions_ia)
          ? chapter.questions_ia.map((question) => cleanText(question, 300)).filter(Boolean)
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
  const fallbackDraft = buildFallbackDraft(sourcePayload);
  const promptSourcePayload = buildAIPromptPayload(sourcePayload);

  if (!aiService?.mistral) {
    return fallbackDraft;
  }

  const prompt = [
    'Tu rediges un brouillon complet de livre souvenir collaboratif.',
    'Tu dois produire un resultat coherent, chaleureux, fluide et elegant en francais.',
    'Le livre sera ensuite mis en page avec au moins 4 pages par chapitre.',
    'Utilise strictement le contenu fourni ci-dessous pour construire un premier jet narratif substantiel.',
    'Retourne UNIQUEMENT un objet JSON valide avec cette structure exacte :',
    '{',
    '  "title": "string",',
    '  "subtitle": "string",',
    '  "introduction": "string",',
    '  "chapters": [',
    '    {',
    '      "title": "string",',
    '      "intro": "string",',
    '      "body": "string",',
    '      "closing": "string"',
    '    }',
    '  ],',
    '  "conclusion": "string"',
    '}',
    'Ne mets aucun markdown, aucun commentaire, aucun texte avant ou apres le JSON.',
    'Si un chapitre a peu de contenu, reste sobre mais genere tout de meme un texte utile.',
    '',
    'DONNEES SOURCE DU LIVRE :',
    JSON.stringify(promptSourcePayload)
  ].join('\n');

  try {
    const response = await aiService.mistral.chat.complete({
      model: 'mistral-small-latest',
      messages: [
        {
          role: 'system',
          content: 'Tu es un redacteur editoriel expert des livres souvenirs personnalises. Tu renvoies uniquement du JSON valide.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.5,
      maxTokens: 2600
    });

    const content = response?.choices?.[0]?.message?.content || '';
    const parsed = parseDraftJson(content);

    if (!parsed || !Array.isArray(parsed.chapters)) {
      return fallbackDraft;
    }

    return {
      title: cleanText(parsed.title, 180) || fallbackDraft.title,
      subtitle: cleanText(parsed.subtitle, 220) || fallbackDraft.subtitle,
      introduction: cleanText(parsed.introduction, 2600) || fallbackDraft.introduction,
      chapters: sourcePayload.chapters.map((chapter, index) => {
        const generatedChapter = parsed.chapters[index] || {};
        return {
          title: cleanText(generatedChapter.title, 180) || chapter.title,
          intro: cleanText(generatedChapter.intro, 1200),
          body: cleanText(generatedChapter.body, 3600) || buildChapterBodyFallback(chapter),
          closing: cleanText(generatedChapter.closing, 1200)
        };
      }),
      conclusion: cleanText(parsed.conclusion, 2200) || fallbackDraft.conclusion
    };
  } catch (error) {
    console.error('Erreur IA brouillon livre:', error);
    return fallbackDraft;
  }
}

function buildAIPromptPayload(sourcePayload) {
  return {
    book: sourcePayload.book,
    chapters: (sourcePayload.chapters || []).map((chapter) => ({
      id: chapter.id,
      title: chapter.title,
      description: chapter.description,
      questions: chapter.questions,
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
  const questions = Array.isArray(chapter?.questions) ? chapter.questions : [];

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

  if (questions.length > 0) {
    sections.push(`Pistes editoriales : ${questions.join(' ')}`);
  }

  if (sections.length === 0) {
    sections.push('Ce chapitre est encore en cours de construction et pourra etre enrichi avec de nouveaux souvenirs.');
  }

  return sections.join('\n\n');
}

function renderBookDraftHtml({ book, draft, sourcePayload }) {
  const subtitle = draft.subtitle || [book.event_type, book.style_narratif].filter(Boolean).join(' | ');
  const chapterBlocks = draft.chapters.map((chapter, index) => {
    const sourceChapter = sourcePayload.chapters[index];
    return renderDraftChapterPages({
      chapter,
      sourceChapter,
      index
    });
  }).join('');

  return `
    <article class="draft-book">
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

function renderDraftChapterPages({ chapter, sourceChapter, index }) {
  const chapterTitle = chapter.title || sourceChapter?.title || `Chapitre ${index + 1}`;
  const sourceMeta = [];
  const bodyParts = splitDraftBody(chapter.body || buildChapterBodyFallback(sourceChapter || {}));
  const guestHighlights = Array.isArray(sourceChapter?.guestContributions)
    ? sourceChapter.guestContributions.slice(0, 3)
    : [];
  const allPhotos = collectChapterPhotos(sourceChapter);
  const visiblePhotos = allPhotos.slice(0, 6);
  const remainingPhotoCount = Math.max(0, allPhotos.length - visiblePhotos.length);

  if (sourceChapter?.stats?.invitedCount) {
    sourceMeta.push(`${sourceChapter.stats.invitedCount} invitation(s)`);
  }
  if (sourceChapter?.stats?.respondedCount) {
    sourceMeta.push(`${sourceChapter.stats.respondedCount} reponse(s)`);
  }
  if (sourceChapter?.guestContributions?.length) {
    sourceMeta.push(`${sourceChapter.guestContributions.length} contribution(s) retenue(s)`);
  }

  return `
    <section class="draft-book-chapter">
      <div class="draft-book-chapter-shell">
        <section class="draft-book-page draft-book-page-opening">
          <div class="draft-book-page-label">Page 1</div>
          <div class="draft-book-chapter-index">Chapitre ${index + 1}</div>
          <h3>${escapeHtml(chapterTitle)}</h3>
          ${sourceChapter?.description ? `<p class="draft-book-intro">${escapeHtml(sourceChapter.description)}</p>` : ''}
          ${sourceMeta.length > 0 ? `<div class="draft-book-source">${escapeHtml(sourceMeta.join(' | '))}</div>` : ''}
          ${renderQuestionList(sourceChapter?.questions)}
        </section>

        <section class="draft-book-page">
          <div class="draft-book-page-label">Page 2</div>
          ${chapter.intro ? `<p class="draft-book-intro">${escapeHtml(chapter.intro)}</p>` : ''}
          <div class="draft-book-body">
            ${formatParagraphs(bodyParts[0] || '')}
          </div>
        </section>

        <section class="draft-book-page">
          <div class="draft-book-page-label">Page 3</div>
          ${renderContributionSpotlight(sourceChapter?.organizerContribution, guestHighlights)}
        </section>

        <section class="draft-book-page draft-book-page-gallery">
          <div class="draft-book-page-label">Page 4</div>
          <div class="draft-book-body">
            ${formatParagraphs(bodyParts[1] || bodyParts[0] || '')}
          </div>
          ${chapter.closing ? `<p class="draft-book-closing">${escapeHtml(chapter.closing)}</p>` : ''}
          ${renderPhotoGallery(visiblePhotos, remainingPhotoCount)}
        </section>
      </div>
    </section>
  `;
}

function renderQuestionList(questions) {
  const items = Array.isArray(questions)
    ? questions.map((question) => cleanText(question, 220)).filter(Boolean)
    : [];

  if (items.length === 0) {
    return '<p class="draft-book-empty">Questions editoriales a enrichir si besoin avant la version finale.</p>';
  }

  return `
    <div class="draft-book-question-block">
      <div class="draft-book-mini-title">Fils directeurs</div>
      <ul class="draft-book-question-list">
        ${items.slice(0, 5).map((question) => `<li>${escapeHtml(question)}</li>`).join('')}
      </ul>
    </div>
  `;
}

function renderContributionSpotlight(organizerContribution, guestHighlights) {
  const blocks = [];

  if (organizerContribution?.message) {
    blocks.push(`
      <div class="draft-book-callout">
        <div class="draft-book-mini-title">Voix de l'organisateur</div>
        ${formatParagraphs(organizerContribution.message)}
      </div>
    `);
  }

  if (Array.isArray(guestHighlights) && guestHighlights.length > 0) {
    blocks.push(`
      <div class="draft-book-contributor-list">
        <div class="draft-book-mini-title">Extraits des proches</div>
        ${guestHighlights.map((contribution) => `
          <div class="draft-book-contributor-item">
            <strong>${escapeHtml(contribution.contributorName || 'Contributeur')}</strong>
            <p>${escapeHtml(cleanText(contribution.message, 320) || 'Souvenir a integrer dans la version finale.')}</p>
          </div>
        `).join('')}
      </div>
    `);
  }

  if (blocks.length === 0) {
    return '<p class="draft-book-empty">Les contributions de ce chapitre pourront encore etre enrichies avant la mise en page finale.</p>';
  }

  return blocks.join('');
}

function renderPhotoGallery(photos, remainingPhotoCount) {
  if (!Array.isArray(photos) || photos.length === 0) {
    return '<p class="draft-book-empty">Aucune photo retenue pour ce chapitre pour le moment.</p>';
  }

  return `
    <div class="draft-book-gallery-wrap">
      <div class="draft-book-mini-title">Photos du chapitre</div>
      <div class="draft-book-gallery">
        ${photos.map((photoUrl, photoIndex) => `
          <figure class="draft-book-photo">
            <img src="${escapeHtml(photoUrl)}" alt="Photo du chapitre ${photoIndex + 1}" loading="lazy" />
          </figure>
        `).join('')}
      </div>
      ${remainingPhotoCount > 0 ? `<div class="draft-book-gallery-note">+ ${remainingPhotoCount} photo(s) supplementaire(s) disponibles pour la maquette finale.</div>` : ''}
    </div>
  `;
}

function splitDraftBody(text) {
  const paragraphs = splitTextToParagraphs(text, 8000);

  if (paragraphs.length === 0) {
    return ['', ''];
  }

  if (paragraphs.length === 1) {
    const sentenceParts = paragraphs[0]
      .split(/(?<=[.!?])\s+/)
      .map((part) => part.trim())
      .filter(Boolean);
    const middle = Math.max(1, Math.ceil(sentenceParts.length / 2));

    return [
      sentenceParts.slice(0, middle).join(' '),
      sentenceParts.slice(middle).join(' ')
    ];
  }

  const middle = Math.ceil(paragraphs.length / 2);
  return [
    paragraphs.slice(0, middle).join('\n\n'),
    paragraphs.slice(middle).join('\n\n')
  ];
}

function splitTextToParagraphs(value, maxLength = 6000) {
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

  return trimmed
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.replace(/[ \t]+/g, ' ').replace(/\n/g, ' ').trim())
    .flatMap((paragraph) => splitLongParagraphIntoChunks(paragraph, 420))
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

function formatParagraphs(text) {
  const paragraphs = splitTextToParagraphs(text, 6000);

  if (paragraphs.length === 0) {
    return '<p class="draft-book-empty">Contenu en cours de generation.</p>';
  }

  return paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('');
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
