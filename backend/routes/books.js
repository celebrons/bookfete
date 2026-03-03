const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const aiService = require('../services/aiService');
const authenticate = require('../middleware/auth');

const CHAPTER_STATE_EMAIL = '__chapter_state__@system.local';

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

router.post('/:id/generate-draft', authenticate, async (req, res) => {
  try {
    const bookId = req.params.id;
    const { data: book, error: bookError } = await supabase
      .from('books')
      .select('*')
      .eq('id', bookId)
      .eq('owner_id', req.user.id)
      .single();

    if (bookError || !book) {
      return res.status(404).json({ error: 'Livre introuvable' });
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

    const contributorNamesByEmail = (contributors || []).reduce((acc, contributor) => {
      if (contributor.email) {
        acc[contributor.email.trim().toLowerCase()] = contributor.name || null;
      }
      return acc;
    }, {});

    const sourcePayload = buildBookDraftSourcePayload({
      book,
      chapters: chapters || [],
      organizerEmail: req.user.email || '',
      contributorNamesByEmail
    });

    const draft = await generateBookDraftFromAI(sourcePayload);
    const html = renderBookDraftHtml({
      book,
      draft,
      sourcePayload
    });

    res.json({
      generatedAt: new Date().toISOString(),
      source: sourcePayload,
      draft,
      html
    });
  } catch (error) {
    console.error('Erreur generation brouillon livre:', error);
    res.status(500).json({ error: error.message || 'Erreur lors de la generation du brouillon' });
  }
});

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
