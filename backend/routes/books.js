const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const aiService = require('../services/aiService');
const authenticate = require('../middleware/auth');

const CHAPTER_STATE_EMAIL = '__chapter_state__@system.local';
const CHAPTER_DRAFT_EMAIL = '__chapter_draft__@system.local';
const MAX_CHAPTER_AI_GENERATIONS = 3;

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

router.post('/:id/generate-draft', authenticate, async (req, res) => {
  try {
    const bookId = req.params.id;
    const { book, chapters } = await loadOwnedBookChapterContext({
      bookId,
      ownerId: req.user.id
    });
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

    const html = renderValidatedBookPreviewHtml({
      book,
      chaptersWithDrafts
    });

    res.json({
      generatedAt: new Date().toISOString(),
      html
    });
  } catch (error) {
    console.error('Erreur apercu livre:', error);
    res.status(error.status || 500).json({ error: error.message || 'Erreur lors de la generation du brouillon' });
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

function renderValidatedBookPreviewHtml({ book, chaptersWithDrafts }) {
  const chapterBlocks = chaptersWithDrafts
    .map(({ draft }) => draft?.html || '')
    .filter(Boolean)
    .join('');
  const frontCoverBlock = renderAssembledFrontCover(book);
  const backCoverBlock = renderAssembledBackCover(book);
  const chaptersContent = chapterBlocks
    || '<section class="draft-book-section"><p class="draft-book-empty">Aucun chapitre valide.</p></section>';

  return `
    <article class="draft-book">
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
          <div class="cover-preview-back-copy">${escapeHtml(blurb || 'Texte de quatrieme de couverture a definir.')}</div>
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
    .filter(Boolean);
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
