// backend/routes/chapters.js
const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const authenticate = require('../middleware/auth');
const {
  getChapterAmorceContext,
  runChapterAmorceGeneration,
  persistChapterAmorce
} = require('../services/chapterAmorceService');
const {
  getChapterPromptAdminContext,
  testInlineChapterBodyPrompt,
  publishInlineChapterBodyPrompt
} = require('../services/chapterBodyPromptAdminService');
const {
  getChapterAmorcePromptAdminContext,
  testInlineChapterAmorcePrompt,
  publishInlineChapterAmorcePrompt
} = require('../services/chapterAmorcePromptAdminService');

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

// GET /api/chapters/book/:bookId - Récupérer les chapitres d'un livre
router.get('/book/:bookId', authenticate, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('chapters')
      .select(`
        *,
        contributions:contributions(count)
      `)
      .eq('book_id', req.params.bookId)
      .order('order_index', { ascending: true });

    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/chapters - Créer un chapitre
router.post('/', authenticate, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('chapters')
      .insert([req.body])
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/chapters/:id/generate-amorce - Générer l'amorce et les mots-déclencheurs
router.post('/:id/generate-amorce', authenticate, async (req, res) => {
  try {
    const context = await getChapterAmorceContext(req.params.id, req.user?.id);
    const generated = await runChapterAmorceGeneration({
      ...context,
      model: process.env.MISTRAL_MODEL || 'mistral-small-latest',
      force: Boolean(req.body?.force)
    });

    const chapter = await persistChapterAmorce(req.params.id, generated);
    return res.json({
      ok: true,
      chapter,
      amorce: generated.amorceText,
      triggers: generated.triggers,
      promptVersion: generated.promptVersion
    });
  } catch (error) {
    const status = Number(error?.status) || 500;
    return res.status(status).json({ error: error.message || 'Erreur generation amorce.' });
  }
});

// PUT /api/chapters/:id - Mettre à jour un chapitre
router.get('/:id/prompt-admin/chapter-body', authenticate, ensurePromptAdmin, async (req, res) => {
  try {
    const context = await getChapterPromptAdminContext(
      req.params.id,
      req.user?.id,
      req.user?.email
    );

    return res.json({
      ok: true,
      activeTemplate: context.activeTemplate
        ? {
            id: context.activeTemplate.id,
            label: context.activeTemplate.label,
            version: context.activeTemplate.version,
            status: context.activeTemplate.status
          }
        : null,
      directives: context.directives || '',
      contextSummary: context.contextSummary,
      variables: context.variables,
      templateVariables: context.templateVariables || [],
      availableVariables: Object.keys(context.variables || {}),
      availableVariableMeta: context.availableVariableMeta || []
    });
  } catch (error) {
    const status = Number(error?.status) || 500;
    return res.status(status).json({
      error: error.message || 'Erreur chargement administration prompt chapitre.',
      missingVariables: Array.isArray(error?.details?.missingVariables)
        ? error.details.missingVariables
        : []
    });
  }
});

router.post('/:id/prompt-admin/chapter-body/test', authenticate, ensurePromptAdmin, async (req, res) => {
  try {
    const tested = await testInlineChapterBodyPrompt({
      chapterId: req.params.id,
      ownerId: req.user?.id,
      ownerEmail: req.user?.email,
      directives: req.body?.directives || '',
      model: req.body?.model || process.env.MISTRAL_MODEL || 'mistral-small-latest'
    });

    return res.json({
      ok: true,
      activeTemplate: tested.template
        ? {
            id: tested.template.id,
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
      availableVariableMeta: tested.availableVariableMeta || [],
      result: tested.result
    });
  } catch (error) {
    const status = Number(error?.status) || 500;
    return res.status(status).json({
      error: error.message || 'Erreur test prompt chapitre.',
      missingVariables: Array.isArray(error?.details?.missingVariables)
        ? error.details.missingVariables
        : []
    });
  }
});

router.post('/:id/prompt-admin/chapter-body/publish', authenticate, ensurePromptAdmin, async (req, res) => {
  try {
    const published = await publishInlineChapterBodyPrompt({
      chapterId: req.params.id,
      ownerId: req.user?.id,
      ownerEmail: req.user?.email,
      directives: req.body?.directives || '',
      createdBy: req.user?.email || req.user?.id || 'inline-admin'
    });

    return res.json({
      ok: true,
      activeTemplate: published.template
        ? {
            id: published.template.id,
            label: published.template.label,
            version: published.template.version,
            status: published.template.status
          }
        : null,
      directives: published.directives || '',
      contextSummary: published.contextSummary,
      variables: published.variables,
      templateVariables: published.templateVariables || [],
      availableVariables: Object.keys(published.variables || {}),
      availableVariableMeta: published.availableVariableMeta || []
    });
  } catch (error) {
    const status = Number(error?.status) || 500;
    return res.status(status).json({
      error: error.message || 'Erreur validation prompt chapitre.',
      missingVariables: Array.isArray(error?.details?.missingVariables)
        ? error.details.missingVariables
        : []
    });
  }
});

router.get('/:id/prompt-admin/chapter-amorce', authenticate, ensurePromptAdmin, async (req, res) => {
  try {
    const context = await getChapterAmorcePromptAdminContext(
      req.params.id,
      req.user?.id
    );

    return res.json({
      ok: true,
      activeTemplate: context.activeTemplate
        ? {
            id: context.activeTemplate.id,
            label: context.activeTemplate.label,
            version: context.activeTemplate.version,
            status: context.activeTemplate.status
          }
        : null,
      directives: context.directives || '',
      contextSummary: context.contextSummary,
      variables: context.variables,
      templateVariables: context.templateVariables || [],
      availableVariables: Object.keys(context.variables || {}),
      availableVariableMeta: context.availableVariableMeta || []
    });
  } catch (error) {
    const status = Number(error?.status) || 500;
    return res.status(status).json({
      error: error.message || 'Erreur chargement administration prompt amorce.',
      missingVariables: Array.isArray(error?.details?.missingVariables)
        ? error.details.missingVariables
        : []
    });
  }
});

router.post('/:id/prompt-admin/chapter-amorce/test', authenticate, ensurePromptAdmin, async (req, res) => {
  try {
    const tested = await testInlineChapterAmorcePrompt({
      chapterId: req.params.id,
      ownerId: req.user?.id,
      directives: req.body?.directives || '',
      model: req.body?.model || process.env.MISTRAL_MODEL || 'mistral-small-latest'
    });

    return res.json({
      ok: true,
      activeTemplate: tested.activeTemplate
        ? {
            id: tested.activeTemplate.id,
            label: tested.activeTemplate.label,
            version: tested.activeTemplate.version,
            status: tested.activeTemplate.status
          }
        : null,
      directives: req.body?.directives || '',
      contextSummary: tested.contextSummary,
      variables: tested.variables,
      templateVariables: tested.templateVariables || [],
      availableVariables: Object.keys(tested.variables || {}),
      availableVariableMeta: tested.availableVariableMeta || [],
      result: tested.result
    });
  } catch (error) {
    const status = Number(error?.status) || 500;
    return res.status(status).json({
      error: error.message || 'Erreur test prompt amorce.',
      missingVariables: Array.isArray(error?.details?.missingVariables)
        ? error.details.missingVariables
        : []
    });
  }
});

router.post('/:id/prompt-admin/chapter-amorce/publish', authenticate, ensurePromptAdmin, async (req, res) => {
  try {
    const published = await publishInlineChapterAmorcePrompt({
      chapterId: req.params.id,
      ownerId: req.user?.id,
      directives: req.body?.directives || '',
      createdBy: req.user?.email || req.user?.id || 'inline-admin'
    });

    return res.json({
      ok: true,
      activeTemplate: published.template
        ? {
            id: published.template.id,
            label: published.template.label,
            version: published.template.version,
            status: published.template.status
          }
        : null,
      directives: published.directives || '',
      contextSummary: published.contextSummary,
      variables: published.variables,
      templateVariables: published.templateVariables || [],
      availableVariables: Object.keys(published.variables || {}),
      availableVariableMeta: published.availableVariableMeta || []
    });
  } catch (error) {
    const status = Number(error?.status) || 500;
    return res.status(status).json({
      error: error.message || 'Erreur validation prompt amorce.',
      missingVariables: Array.isArray(error?.details?.missingVariables)
        ? error.details.missingVariables
        : []
    });
  }
});

router.put('/:id', authenticate, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('chapters')
      .update(req.body)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/chapters/:id - Supprimer un chapitre
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const { error } = await supabase
      .from('chapters')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
