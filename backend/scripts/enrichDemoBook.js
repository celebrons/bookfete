require('dotenv').config();

const { createClient } = require('@supabase/supabase-js');

const CHAPTER_STATE_EMAIL = '__chapter_state__@system.local';
const CHAPTER_DRAFT_EMAIL = '__chapter_draft__@system.local';
const DEFAULT_BOOK_TITLE = '[DEMO] Livre finalise 2026-03-15';
const MIN_CONTRIBUTIONS_PER_CHAPTER = 3;

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const args = parseArgs(process.argv.slice(2));
const targetBookId = cleanArg(args['book-id']);
const targetTitle = cleanArg(args.title) || DEFAULT_BOOK_TITLE;
const ownerEmail = cleanArg(args['owner-email']);

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Enrichment failed:', error.message);
    process.exit(1);
  });

async function run() {
  const targetBook = await resolveTargetBook({
    bookId: targetBookId,
    title: targetTitle,
    ownerEmail
  });

  if (!targetBook?.id) {
    throw new Error(`Book not found for title "${targetTitle}"`);
  }

  console.log(`Target book: ${targetBook.id} (${targetBook.title})`);

  const ownerProfile = await fetchOwnerProfile(targetBook.owner_id);
  const ownerName = ownerProfile?.full_name || deriveNameFromEmail(ownerProfile?.email || ownerEmail || 'organisateur');
  const ownerMail = ownerProfile?.email || ownerEmail || `owner-${targetBook.owner_id}@demo.local`;

  const contributors = await fetchBookContributors(targetBook.id);
  const chapters = await fetchChapters(targetBook.id);

  if (chapters.length === 0) {
    throw new Error('No chapters found on target book');
  }

  let updatedContributions = 0;
  let insertedContributions = 0;
  let updatedDrafts = 0;
  let insertedDrafts = 0;

  for (const chapter of chapters) {
    const chapterImages = buildChapterImages(chapter.id, chapter.order_index);
    const chapterContributions = await fetchChapterContributions(chapter.id);
    const regularRows = chapterContributions.filter((row) => isRegularContribution(row.contributor_email));
    const draftRow = chapterContributions.find((row) => String(row.contributor_email || '').toLowerCase() === CHAPTER_DRAFT_EMAIL);

    const personas = buildPersonas({
      ownerName,
      ownerEmail: ownerMail,
      contributors,
      chapterOrder: Number(chapter.order_index || 0)
    });

    const usedEmails = new Set();
    const refreshedEntries = [];

    for (let index = 0; index < regularRows.length; index += 1) {
      const row = regularRows[index];
      const speaker = {
        name: row.contributor_name || personas[index % personas.length].name,
        email: row.contributor_email || personas[index % personas.length].email
      };
      usedEmails.add(String(speaker.email || '').toLowerCase());

      const message = buildContributionText({
        chapterTitle: chapter.title,
        chapterOrder: Number(chapter.order_index || 0),
        speakerName: speaker.name,
        contributionIndex: index
      });

      const photoUrls = [
        chapterImages[index % chapterImages.length],
        chapterImages[(index + 1) % chapterImages.length]
      ];

      const payload = {
        contributor_name: speaker.name,
        contributor_email: speaker.email,
        message,
        photo_urls: photoUrls,
        approved: true,
        is_finalized: true,
        needs_revision: false,
        moderation_feedback: null
      };

      const { error: updateError } = await supabase
        .from('contributions')
        .update(payload)
        .eq('id', row.id);

      if (updateError) {
        throw new Error(`Unable to update contribution ${row.id}: ${updateError.message}`);
      }

      updatedContributions += 1;
      refreshedEntries.push({
        name: payload.contributor_name,
        email: payload.contributor_email,
        message: payload.message,
        photo_urls: payload.photo_urls
      });
    }

    const needed = Math.max(0, MIN_CONTRIBUTIONS_PER_CHAPTER - refreshedEntries.length);
    if (needed > 0) {
      const insertRows = [];
      for (let index = 0; index < personas.length && insertRows.length < needed; index += 1) {
        const persona = personas[index];
        const normalizedEmail = String(persona.email || '').toLowerCase();
        if (usedEmails.has(normalizedEmail)) {
          continue;
        }
        usedEmails.add(normalizedEmail);

        const message = buildContributionText({
          chapterTitle: chapter.title,
          chapterOrder: Number(chapter.order_index || 0),
          speakerName: persona.name,
          contributionIndex: refreshedEntries.length + insertRows.length
        });
        const photoUrls = [
          chapterImages[(refreshedEntries.length + insertRows.length) % chapterImages.length]
        ];

        insertRows.push({
          chapter_id: chapter.id,
          contributor_name: persona.name,
          contributor_email: persona.email,
          message,
          photo_urls: photoUrls,
          approved: true,
          is_finalized: true,
          needs_revision: false,
          moderation_feedback: null
        });
      }

      if (insertRows.length > 0) {
        const { data: inserted, error: insertError } = await supabase
          .from('contributions')
          .insert(insertRows)
          .select('id, contributor_name, contributor_email, message, photo_urls');

        if (insertError) {
          throw new Error(`Unable to insert chapter contributions for ${chapter.title}: ${insertError.message}`);
        }

        insertedContributions += insertRows.length;
        (inserted || []).forEach((row) => {
          refreshedEntries.push({
            name: row.contributor_name,
            email: row.contributor_email,
            message: row.message,
            photo_urls: Array.isArray(row.photo_urls) ? row.photo_urls : []
          });
        });
      }
    }

    const draftPayload = buildDraftPayload({
      chapter,
      chapterImages,
      contributions: refreshedEntries,
      existingDraftRaw: draftRow?.message
    });

    if (draftRow?.id) {
      const { error: draftUpdateError } = await supabase
        .from('contributions')
        .update({
          message: JSON.stringify(draftPayload),
          approved: true,
          is_finalized: true,
          needs_revision: false,
          moderation_feedback: null
        })
        .eq('id', draftRow.id);

      if (draftUpdateError) {
        throw new Error(`Unable to update chapter draft for ${chapter.title}: ${draftUpdateError.message}`);
      }

      updatedDrafts += 1;
    } else {
      const { error: draftInsertError } = await supabase
        .from('contributions')
        .insert([{
          chapter_id: chapter.id,
          contributor_name: '__chapter_draft__',
          contributor_email: CHAPTER_DRAFT_EMAIL,
          message: JSON.stringify(draftPayload),
          photo_urls: [],
          approved: true,
          is_finalized: true,
          needs_revision: false,
          moderation_feedback: null
        }]);

      if (draftInsertError) {
        throw new Error(`Unable to insert chapter draft for ${chapter.title}: ${draftInsertError.message}`);
      }

      insertedDrafts += 1;
    }
  }

  console.log('Done.');
  console.log(`Contributions updated: ${updatedContributions}`);
  console.log(`Contributions inserted: ${insertedContributions}`);
  console.log(`Drafts updated: ${updatedDrafts}`);
  console.log(`Drafts inserted: ${insertedDrafts}`);
  console.log(`Book ready for preview/pdf tests: ${targetBook.id}`);
}

async function resolveTargetBook({ bookId, title, ownerEmail: ownerMail }) {
  if (bookId) {
    const { data, error } = await supabase
      .from('books')
      .select('id, title, owner_id')
      .eq('id', bookId)
      .maybeSingle();
    if (error) {
      throw new Error(`Unable to fetch book by id: ${error.message}`);
    }
    return data || null;
  }

  let ownerId = '';
  if (ownerMail) {
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', ownerMail.toLowerCase())
      .maybeSingle();
    if (profileError) {
      throw new Error(`Unable to resolve owner by email: ${profileError.message}`);
    }
    ownerId = profile?.id || '';
  }

  let query = supabase
    .from('books')
    .select('id, title, owner_id')
    .eq('title', title);

  if (ownerId) {
    query = query.eq('owner_id', ownerId);
  }

  const { data, error } = await query.limit(1);
  if (error) {
    throw new Error(`Unable to fetch target book: ${error.message}`);
  }

  if (!Array.isArray(data) || data.length === 0) {
    return null;
  }

  return data[0];
}

async function fetchOwnerProfile(ownerId) {
  if (!ownerId) {
    return null;
  }
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .eq('id', ownerId)
    .maybeSingle();
  if (error) {
    return null;
  }
  return data || null;
}

async function fetchBookContributors(bookId) {
  const { data, error } = await supabase
    .from('book_contributors')
    .select('id, name, email')
    .eq('book_id', bookId)
    .order('created_at', { ascending: true });
  if (error) {
    throw new Error(`Unable to fetch book contributors: ${error.message}`);
  }
  return Array.isArray(data) ? data : [];
}

async function fetchChapters(bookId) {
  const { data, error } = await supabase
    .from('chapters')
    .select('id, title, order_index')
    .eq('book_id', bookId)
    .order('order_index', { ascending: true });
  if (error) {
    throw new Error(`Unable to fetch chapters: ${error.message}`);
  }
  return Array.isArray(data) ? data : [];
}

async function fetchChapterContributions(chapterId) {
  const { data, error } = await supabase
    .from('contributions')
    .select('id, contributor_name, contributor_email, message, photo_urls')
    .eq('chapter_id', chapterId)
    .order('created_at', { ascending: true });
  if (error) {
    throw new Error(`Unable to fetch contributions for chapter ${chapterId}: ${error.message}`);
  }
  return Array.isArray(data) ? data : [];
}

function buildPersonas({ ownerName, ownerEmail: organizerEmail, contributors, chapterOrder }) {
  const base = [{
    name: ownerName || 'Organisateur',
    email: organizerEmail || `organisateur-${chapterOrder}@demo.local`
  }];

  contributors.forEach((row) => {
    if (!row?.email) {
      return;
    }
    base.push({
      name: row.name || deriveNameFromEmail(row.email),
      email: row.email
    });
  });

  if (base.length >= 4) {
    return base;
  }

  const fallback = [
    { name: 'Camille', email: `camille.${chapterOrder}@demo.local` },
    { name: 'Hugo', email: `hugo.${chapterOrder}@demo.local` },
    { name: 'Lea', email: `lea.${chapterOrder}@demo.local` },
    { name: 'Nora', email: `nora.${chapterOrder}@demo.local` }
  ];

  fallback.forEach((person) => {
    if (base.some((entry) => String(entry.email || '').toLowerCase() === String(person.email || '').toLowerCase())) {
      return;
    }
    base.push(person);
  });

  return base;
}

function buildChapterImages(chapterId, chapterOrder) {
  const base = String(chapterId || `chapter-${chapterOrder}`).slice(0, 8);
  return [
    `https://picsum.photos/seed/${base}-a/1600/1000`,
    `https://picsum.photos/seed/${base}-b/1600/1000`,
    `https://picsum.photos/seed/${base}-c/1600/1000`,
    `https://picsum.photos/seed/${base}-d/1600/1000`
  ];
}

function buildContributionText({
  chapterTitle,
  chapterOrder,
  speakerName,
  contributionIndex
}) {
  const ambiance = chapterOrder % 2 === 0
    ? 'la maison etait animee, les voix se croisaient et tout le monde avait une mission'
    : 'on avancait avec une energie calme, mais chaque geste comptait';
  const detail = contributionIndex % 2 === 0
    ? 'je revois encore les valises ouvertes, les listes griffonnees et les sourires qui rassurent'
    : 'je me souviens des regards, des petites blagues et des silences qui disent plus que les mots';

  return [
    `Sur "${chapterTitle}", ${speakerName} raconte un souvenir tres concret: ${ambiance}.`,
    `Le moment le plus fort est arrive quand ${detail}. C est ce type de scene qui donne de l epaisseur au chapitre et qui permet de ressentir le rythme reel de la journee.`,
    'Au dela des faits, ce souvenir porte une emotion nette: la confiance, la complicite et l envie de garder une trace fidele pour plus tard.',
    'Ce temoignage complete les autres contributions et aide a construire un recit coherent, vivant et vraiment personnel.'
  ].join(' ');
}

function buildDraftPayload({ chapter, chapterImages, contributions, existingDraftRaw }) {
  const nowIso = new Date().toISOString();
  const previous = parseDraftPayload(existingDraftRaw);
  const validated = previous?.status === 'validated';

  return {
    version: 1,
    status: validated ? 'validated' : 'draft',
    generationCount: Math.max(2, Number(previous?.generationCount || 0)),
    maxGenerations: Math.max(3, Number(previous?.maxGenerations || 3)),
    title: chapter.title,
    summary: `Version enrichie pour ${chapter.title}, avec contributions longues et visuels.`,
    html: buildRichDraftHtml({
      chapterTitle: chapter.title,
      chapterIndex: Number(chapter.order_index || 0),
      chapterImages,
      contributions
    }),
    aiQuality: {
      score: validated ? 90 : 82,
      issues: []
    },
    aiPlan: {
      structure: '8_pages',
      tone: 'intime',
      enrichment: 'contributions+images'
    },
    generationMode: 'seed_enrichment',
    lastGeneratedAt: nowIso,
    lastEditedAt: nowIso,
    finalizedAt: validated ? (previous?.finalizedAt || nowIso) : null
  };
}

function parseDraftPayload(rawValue) {
  if (!rawValue) {
    return null;
  }
  try {
    const parsed = JSON.parse(rawValue);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (_error) {
    return null;
  }
}

function buildRichDraftHtml({ chapterTitle, chapterIndex, chapterImages, contributions }) {
  const snippets = (Array.isArray(contributions) ? contributions : [])
    .map((entry) => ({
      name: entry?.name || 'Proche',
      excerpt: firstSentence(entry?.message || '')
    }))
    .filter((entry) => entry.excerpt);

  const pages = Array.from({ length: 8 }, (_, index) => {
    const heading = resolvePageHeading(chapterTitle, index);
    const narrative = buildPageNarrative({
      chapterTitle,
      chapterIndex,
      pageNumber: index + 1,
      snippets
    });
    const heroImage = index === 3 ? chapterImages[0] : '';
    const galleryImages = index === 5 ? chapterImages.slice(1, 4) : [];
    const spotlight = index === 6 ? snippets.slice(0, 2) : [];

    return `
      <section class="draft-book-page${index === 0 ? ' draft-book-page-opening' : ''}${index === 5 ? ' draft-book-page-gallery' : ''}">
        ${heading ? `<h3>${escapeHtml(heading)}</h3>` : ''}
        <div class="draft-book-body">
          ${paragraphsToHtml(narrative)}
        </div>
        ${heroImage ? `
          <figure class="draft-book-media-block">
            <img src="${escapeHtml(heroImage)}" alt="Illustration ${escapeHtml(chapterTitle)}" loading="lazy" />
          </figure>
        ` : ''}
        ${galleryImages.length > 0 ? renderGalleryHtml(galleryImages) : ''}
        ${spotlight.length > 0 ? `
          <div class="draft-book-contribution-spotlight">
            <div class="draft-book-mini-title">Vos proches ont dit...</div>
            <div class="draft-book-contributor-list">
              ${spotlight.map((item) => `
                <div class="draft-book-contributor-item">
                  <strong>${escapeHtml(item.name)}</strong>
                  <p>${escapeHtml(item.excerpt)}</p>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}
        <div class="draft-book-folio" aria-hidden="true">
          <span class="draft-book-folio-value">${String(index + 1).padStart(2, '0')}</span>
          <span class="draft-book-folio-dot"></span>
          <span class="draft-book-folio-value">08</span>
        </div>
      </section>
    `;
  }).join('');

  return `
    <section class="draft-book-chapter" lang="fr">
      <div class="draft-book-chapter-shell">
        ${pages}
      </div>
    </section>
  `.trim();
}

function resolvePageHeading(chapterTitle, index) {
  if (index === 0) return chapterTitle;
  if (index === 1) return 'Le decor et les voix';
  if (index === 2) return 'Une scene precise';
  if (index === 3) return 'Instant fort';
  if (index === 4) return 'Ce que cela dit de nous';
  if (index === 5) return 'Instants en images';
  if (index === 6) return 'Vos proches ont dit...';
  return 'Ce que nous retenons';
}

function buildPageNarrative({ chapterTitle, chapterIndex, pageNumber, snippets }) {
  const snippetA = snippets[0]?.excerpt || 'Un souvenir precise donne de la texture au recit.';
  const snippetB = snippets[1]?.excerpt || 'Chaque detail concret renforce la credibilite narrative.';
  const pacing = chapterIndex % 2 === 0
    ? 'Le rythme alterne entre scenes vives et respirations plus calmes.'
    : 'Le chapitre avance comme une conversation intime, avec des details qui reviennent en echo.';

  return [
    `Dans "${chapterTitle}", cette page ${pageNumber} pose une image claire du moment vecu, sans surcharger le regard.`,
    `${pacing} On garde les faits importants, puis on laisse la place aux sensations: sons, gestes, regards, et petites phrases marquantes.`,
    `Temoignage: ${snippetA}`,
    `Complement: ${snippetB}`
  ].join('\n\n');
}

function renderGalleryHtml(images) {
  const classes = ['draft-book-gallery'];
  if (images.length === 1) classes.push('is-single');
  if (images.length === 2) classes.push('is-duo');
  if (images.length >= 3) classes.push('is-cols-3');

  return `
    <div class="draft-book-gallery-wrap${images.length === 1 ? ' is-single' : ''}">
      <div class="draft-book-mini-title">Instants en images</div>
      <div class="${classes.join(' ')}">
        ${images.map((url, index) => `
          <figure class="draft-book-photo">
            <img src="${escapeHtml(url)}" alt="Photo ${index + 1}" loading="lazy" />
          </figure>
        `).join('')}
      </div>
    </div>
  `;
}

function firstSentence(text) {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return '';
  }
  const match = normalized.match(/^(.{40,220}?[.!?])(\s|$)/);
  if (match?.[1]) {
    return match[1].trim();
  }
  return normalized.slice(0, 200).trim();
}

function isRegularContribution(email) {
  const normalized = String(email || '').toLowerCase();
  return normalized
    && normalized !== CHAPTER_STATE_EMAIL
    && normalized !== CHAPTER_DRAFT_EMAIL;
}

function parseArgs(argv) {
  return argv.reduce((acc, token) => {
    const normalized = String(token || '').trim();
    if (!normalized.startsWith('--')) {
      return acc;
    }
    const [key, ...valueParts] = normalized.slice(2).split('=');
    acc[key] = valueParts.length > 0 ? valueParts.join('=') : true;
    return acc;
  }, {});
}

function cleanArg(value) {
  if (value === null || value === undefined || value === true) return '';
  return String(value).trim();
}

function deriveNameFromEmail(email) {
  const localPart = String(email || '').split('@')[0] || 'organisateur';
  return localPart.replace(/[._-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function paragraphsToHtml(text) {
  return String(text || '')
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
    .join('');
}
