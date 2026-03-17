require('dotenv').config();

const { createClient } = require('@supabase/supabase-js');
const { v4: uuidv4 } = require('uuid');

const CHAPTER_STATE_EMAIL = '__chapter_state__@system.local';
const CHAPTER_DRAFT_EMAIL = '__chapter_draft__@system.local';
const MAX_CHAPTER_AI_GENERATIONS = 3;
const CHAPTER_PAGE_COUNT = 8;

const DEFAULT_CHAPTER_TITLES = [
  'Ouverture',
  'Les premiers pas',
  'Moments fondateurs',
  'Rires partages',
  'Defis releves',
  'Les voix des proches',
  'Ce qui nous unit',
  'Epilogue'
];

const SAMPLE_CONTRIBUTORS = [
  { name: 'Camille', email: 'camille.demo@example.com' },
  { name: 'Hugo', email: 'hugo.demo@example.com' },
  { name: 'Lea', email: 'lea.demo@example.com' },
  { name: 'Nora', email: 'nora.demo@example.com' },
  { name: 'Yanis', email: 'yanis.demo@example.com' },
  { name: 'Sofia', email: 'sofia.demo@example.com' },
  { name: 'Mehdi', email: 'mehdi.demo@example.com' },
  { name: 'Lina', email: 'lina.demo@example.com' },
  { name: 'Sarah', email: 'sarah.demo@example.com' },
  { name: 'Rayan', email: 'rayan.demo@example.com' },
  { name: 'Nina', email: 'nina.demo@example.com' },
  { name: 'Karim', email: 'karim.demo@example.com' }
];

const PHOTO_POOL = [
  'https://picsum.photos/seed/bookfete-01/1280/820',
  'https://picsum.photos/seed/bookfete-02/1280/820',
  'https://picsum.photos/seed/bookfete-03/1280/820',
  'https://picsum.photos/seed/bookfete-04/1280/820',
  'https://picsum.photos/seed/bookfete-05/1280/820',
  'https://picsum.photos/seed/bookfete-06/1280/820',
  'https://picsum.photos/seed/bookfete-07/1280/820',
  'https://picsum.photos/seed/bookfete-08/1280/820',
  'https://picsum.photos/seed/bookfete-09/1280/820',
  'https://picsum.photos/seed/bookfete-10/1280/820'
];

const args = parseArgs(process.argv.slice(2));
const variant = normalizeVariant(args.variant);
const cleanup = parseBooleanArg(args.cleanup, false);
const ownerId = cleanArg(args['owner-id']);
const ownerEmailArg = cleanArg(args['owner-email']);
const chapterCount = clampInt(args.chapters, 8, 4, 12);
const contributorCount = clampInt(args.contributors, 8, 2, SAMPLE_CONTRIBUTORS.length);
const minContributionsPerChapter = clampInt(args['min-contributions'], 2, 2, contributorCount);
const maxContributionsPerChapter = clampInt(
  args['max-contributions'],
  Math.max(minContributionsPerChapter + 2, 4),
  minContributionsPerChapter,
  contributorCount
);
const eventType = cleanArg(args['event-type']) || 'anniversaire';
const recipientName = cleanArg(args['recipient-name']) || 'Omar';
const recipientAge = clampInt(args['recipient-age'], 40, 1, 120);
const recipientGender = cleanArg(args['recipient-gender']) || 'homme';
const styleNarratif = cleanArg(args.style) || 'intime';
const finition = cleanArg(args.finition) || 'classique';
const papier = cleanArg(args.papier) || 'mat';
const coverStyle = cleanArg(args['cover-style']) || 'prestige_contemporain';
const previewFormat = cleanArg(args['preview-format']) || 'luxe';
const explicitTitle = cleanArg(args.title);

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

if (!ownerId && !ownerEmailArg) {
  console.error('Usage: node scripts/seedRealisticProject.js --owner-id=<uuid> [--variant=editing|finalized] [--cleanup=true]');
  console.error('or    : node scripts/seedRealisticProject.js --owner-email=<email> [--variant=editing|finalized] [--cleanup=true]');
  console.error('Options: --chapters=6 --contributors=8 --min-contributions=2 --max-contributions=5 --event-type=anniversaire --recipient-name=Omar --recipient-age=40 --recipient-gender=homme --style=intime --finition=classique --papier=mat --cover-style=prestige_contemporain --preview-format=luxe --title=\"[DEMO] Anniversaire de Omar\"');
  process.exit(1);
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Seed failed:', error.message);
    process.exit(1);
  });

async function run() {
  const owner = await resolveOwner({ ownerId, ownerEmailArg });
  if (!owner?.id) {
    throw new Error('Owner not found. Provide a valid --owner-id or --owner-email from profiles.');
  }
  if (!owner.email) {
    throw new Error('Owner email is required for organizer attribution. Provide --owner-email or ensure profiles.email is populated.');
  }

  if (cleanup) {
    await cleanupSeedBooks(owner.id);
  }

  const nowIso = new Date().toISOString();
  const bookTitle = explicitTitle || buildBookTitle({
    seedVariant: variant,
    recipient: recipientName,
    eventType
  });
  const coverConfig = buildCoverConfig({
    bookTitle,
    variant,
    nowIso,
    recipientName,
    recipientAge,
    eventType,
    coverStyle,
    previewFormat
  });
  const backCoverConfig = buildBackCoverConfig({
    recipientName,
    eventType
  });

  const bookPayload = {
    owner_id: owner.id,
    title: bookTitle,
    event_type: eventType,
    recipient_name: recipientName,
    recipient_age: recipientAge,
    recipient_gender: recipientGender,
    style_narratif: styleNarratif,
    finition,
    papier,
    pages: Math.max(32, chapterCount * 8),
    statut: variant === 'finalized' ? 'termine' : 'en_cours',
    lifecycle_status: variant === 'finalized' ? 'finalized' : 'editing',
    cover_config: coverConfig,
    back_cover_config: backCoverConfig
  };

  const { data: createdBook, error: bookError } = await insertBookWithSchemaFallback(bookPayload);

  if (bookError || !createdBook) {
    throw new Error(bookError?.message || 'Unable to create demo book');
  }

  console.log(`Book created: ${createdBook.id} (${createdBook.title})`);

  const selectedContributors = SAMPLE_CONTRIBUTORS.slice(0, contributorCount);
  const { error: contributorsError } = await supabase
    .from('book_contributors')
    .insert(selectedContributors.map((person) => ({
      book_id: createdBook.id,
      name: person.name,
      email: person.email,
      invited: true
    })));

  if (contributorsError) {
    throw new Error(`Unable to create book contributors: ${contributorsError.message}`);
  }

  const chaptersPayload = DEFAULT_CHAPTER_TITLES.slice(0, chapterCount).map((title, index) => ({
    book_id: createdBook.id,
    title,
    description: `Chapitre ${index + 1} - Souvenirs et emotions`,
    order_index: index,
    questions_validated: true,
    questions_ia: buildQuestionsForChapter(title)
  }));

  const { data: createdChapters, error: chaptersError } = await supabase
    .from('chapters')
    .insert(chaptersPayload)
    .select('*')
    .order('order_index', { ascending: true });

  if (chaptersError || !Array.isArray(createdChapters)) {
    throw new Error(chaptersError?.message || 'Unable to create chapters');
  }

  for (const chapter of createdChapters) {
    const chapterOrder = Number(chapter.order_index || 0);
    const contributorSlice = pickRandomContributors({
      contributors: selectedContributors,
      chapterOrder,
      minCount: minContributionsPerChapter,
      maxCount: maxContributionsPerChapter
    });
    const chapterImages = pickChapterImages(chapterOrder);
    const chapterState = resolveChapterStateForVariant(variant, chapterOrder, chapterCount);

    await seedChapterInvites(chapter.id, contributorSlice);
    await seedChapterContributions({
      chapter,
      owner,
      contributors: contributorSlice,
      chapterImages
    });
    await seedChapterState(chapter.id, chapterState);

    const shouldHaveDraft =
      variant === 'finalized'
      ? true
      : chapterOrder <= Math.min(5, chapterCount - 1);

    if (shouldHaveDraft) {
      const isValidated = variant === 'finalized' || chapterOrder <= 3;
      const draftHtml = buildDraftHtml({
        chapterTitle: chapter.title,
        chapterIndex: chapterOrder,
        chapterImages,
        organizerName: owner.displayName
      });
      await seedChapterDraft({
        chapterId: chapter.id,
        chapterTitle: chapter.title,
        draftHtml,
        validated: isValidated
      });
    }
  }

  console.log('Seed complete.');
  console.log(`Book id: ${createdBook.id}`);
  console.log(`Variant: ${variant}`);
  console.log('You can now open this book in the UI and test full chapter workflow.');
}

async function resolveOwner({ ownerId: inputOwnerId, ownerEmailArg: inputOwnerEmail }) {
  if (inputOwnerId) {
    const profile = await fetchProfileById(inputOwnerId);
    return {
      id: inputOwnerId,
      email: profile?.email || inputOwnerEmail || '',
      displayName: profile?.full_name || deriveNameFromEmail(profile?.email || inputOwnerEmail || 'Organisateur')
    };
  }

  if (!inputOwnerEmail) {
    return null;
  }

  const normalizedEmail = inputOwnerEmail.toLowerCase();
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .eq('email', normalizedEmail)
    .maybeSingle();

  if (profileError) {
    throw new Error(`Unable to fetch owner profile: ${profileError.message}`);
  }

  if (!profile?.id) {
    return null;
  }

  return {
    id: profile.id,
    email: profile.email || normalizedEmail,
    displayName: profile.full_name || deriveNameFromEmail(profile.email || normalizedEmail)
  };
}

async function fetchProfileById(id) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    return null;
  }

  return data || null;
}

async function cleanupSeedBooks(owner) {
  const { data: books, error: booksError } = await supabase
    .from('books')
    .select('id, title')
    .eq('owner_id', owner)
    .ilike('title', '[DEMO] %');

  if (booksError) {
    throw new Error(`Unable to load previous demo books: ${booksError.message}`);
  }

  const ids = (books || []).map((book) => book.id).filter(Boolean);
  if (ids.length === 0) {
    return;
  }

  for (const bookId of ids) {
    await deleteBookGraph(bookId);
    console.log(`Deleted previous demo book: ${bookId}`);
  }
}

async function deleteBookGraph(bookId) {
  const { data: chapterRows, error: chapterRowsError } = await supabase
    .from('chapters')
    .select('id')
    .eq('book_id', bookId);
  if (chapterRowsError) {
    throw new Error(`Unable to load chapters to delete: ${chapterRowsError.message}`);
  }
  const chapterIds = (chapterRows || []).map((row) => row.id).filter(Boolean);

  if (chapterIds.length > 0) {
    const { error: deleteInvitesError } = await supabase
      .from('chapter_invites')
      .delete()
      .in('chapter_id', chapterIds);
    if (deleteInvitesError) {
      throw new Error(`Unable to delete invites: ${deleteInvitesError.message}`);
    }

    const { error: deleteContribError } = await supabase
      .from('contributions')
      .delete()
      .in('chapter_id', chapterIds);
    if (deleteContribError) {
      throw new Error(`Unable to delete contributions: ${deleteContribError.message}`);
    }

    const { error: deleteChaptersError } = await supabase
      .from('chapters')
      .delete()
      .eq('book_id', bookId);
    if (deleteChaptersError) {
      throw new Error(`Unable to delete chapters: ${deleteChaptersError.message}`);
    }
  }

  const { error: deleteBookContributorsError } = await supabase
    .from('book_contributors')
    .delete()
    .eq('book_id', bookId);
  if (deleteBookContributorsError) {
    throw new Error(`Unable to delete book contributors: ${deleteBookContributorsError.message}`);
  }

  const { error: deleteOrdersError } = await supabase
    .from('orders')
    .delete()
    .eq('book_id', bookId);
  if (deleteOrdersError && !String(deleteOrdersError.message || '').toLowerCase().includes('relation "orders" does not exist')) {
    throw new Error(`Unable to delete orders: ${deleteOrdersError.message}`);
  }

  const { error: deleteBookError } = await supabase
    .from('books')
    .delete()
    .eq('id', bookId);
  if (deleteBookError) {
    throw new Error(`Unable to delete book: ${deleteBookError.message}`);
  }
}

async function seedChapterInvites(chapterId, contributors) {
  const invites = contributors.map((contributor) => ({
    chapter_id: chapterId,
    email: contributor.email,
    token: uuidv4(),
    contributed: true
  }));

  const { error } = await supabase
    .from('chapter_invites')
    .insert(invites);
  if (error) {
    throw new Error(`Unable to insert chapter invites: ${error.message}`);
  }
}

async function seedChapterContributions({ chapter, owner, contributors, chapterImages }) {
  const chapterOrder = Number(chapter.order_index || 0);
  const organizerText = buildOrganizerContributionText(chapter.title, chapterOrder);

  const organizerContribution = {
    chapter_id: chapter.id,
    contributor_name: owner.displayName || 'Organisateur',
    contributor_email: owner.email || `organisateur-${owner.id.slice(0, 8)}@demo.local`,
    message: organizerText,
    photo_urls: chapterImages.slice(0, 1),
    approved: true,
    is_finalized: true,
    needs_revision: false,
    moderation_feedback: null
  };

  const guests = contributors.map((person, index) => ({
    chapter_id: chapter.id,
    contributor_name: person.name,
    contributor_email: person.email,
    message: buildGuestContributionText(chapter.title, chapterOrder, index),
    photo_urls: [chapterImages[(index + 1) % chapterImages.length]],
    approved: true,
    is_finalized: true,
    needs_revision: false,
    moderation_feedback: null
  }));

  const { error } = await supabase
    .from('contributions')
    .insert([organizerContribution, ...guests]);
  if (error) {
    throw new Error(`Unable to insert contributions: ${error.message}`);
  }
}

async function seedChapterState(chapterId, state) {
  const payload = {
    chapter_id: chapterId,
    contributor_name: '__chapter_state__',
    contributor_email: CHAPTER_STATE_EMAIL,
    message: state,
    photo_urls: [],
    approved: true,
    is_finalized: true,
    needs_revision: false,
    moderation_feedback: null
  };

  const { error } = await supabase
    .from('contributions')
    .insert([payload]);
  if (error) {
    throw new Error(`Unable to insert chapter workflow state: ${error.message}`);
  }
}

async function seedChapterDraft({ chapterId, chapterTitle, draftHtml, validated }) {
  const nowIso = new Date().toISOString();
  const payload = {
    version: 1,
    status: validated ? 'validated' : 'draft',
    generationCount: validated ? 2 : 1,
    maxGenerations: MAX_CHAPTER_AI_GENERATIONS,
    title: chapterTitle,
    summary: `Synthese premium pour ${chapterTitle}.`,
    html: draftHtml,
    aiQuality: {
      score: validated ? 86 : 74,
      issues: validated ? [] : ['Densite narrative a consolider sur certaines pages.']
    },
    aiPlan: {
      structure: '8_pages',
      tone: 'intime'
    },
    generationMode: 'single_pass',
    lastGeneratedAt: nowIso,
    lastEditedAt: nowIso,
    finalizedAt: validated ? nowIso : null
  };

  const contributionPayload = {
    chapter_id: chapterId,
    contributor_name: '__chapter_draft__',
    contributor_email: CHAPTER_DRAFT_EMAIL,
    message: JSON.stringify(payload),
    photo_urls: [],
    approved: true,
    is_finalized: true,
    needs_revision: false,
    moderation_feedback: null
  };

  const { error } = await supabase
    .from('contributions')
    .insert([contributionPayload]);
  if (error) {
    throw new Error(`Unable to insert chapter draft: ${error.message}`);
  }
}

function buildDraftHtml({ chapterTitle, chapterIndex, chapterImages, organizerName }) {
  const intro = `Ce chapitre ouvre une sequence narrative elegante autour de "${chapterTitle}".`;
  const pageBodies = Array.from({ length: CHAPTER_PAGE_COUNT }, (_, index) => {
    return buildPageBodyText(chapterTitle, chapterIndex, index + 1);
  });
  const heroPhoto = chapterImages[0] || '';
  const gallery = chapterImages.slice(1, 4);

  return `
    <section class="draft-book-chapter" lang="fr">
      <div class="draft-book-chapter-shell">
        ${Array.from({ length: CHAPTER_PAGE_COUNT }, (_, pageIndex) => {
          const isOpening = pageIndex === 0;
          const isGallery = pageIndex === 5;
          const showHero = pageIndex === 3 && heroPhoto;
          const showGuest = pageIndex === 6;
          const heading = isOpening
            ? chapterTitle
            : pageIndex === 2
              ? 'Votre contribution en lumiere'
              : pageIndex === 6
                ? 'Vos proches ont dit...'
                : '';

          return `
            <section class="draft-book-page${isOpening ? ' draft-book-page-opening' : ''}${isGallery ? ' draft-book-page-gallery' : ''}">
              ${heading ? `<h3>${escapeHtml(heading)}</h3>` : ''}
              ${isOpening ? `<p class="draft-book-intro">${escapeHtml(intro)}</p>` : ''}
              <div class="draft-book-body">
                ${paragraphsToHtml(pageBodies[pageIndex])}
              </div>
              ${showHero ? `
                <figure class="draft-book-media-block">
                  <img src="${escapeHtml(heroPhoto)}" alt="Illustration ${escapeHtml(chapterTitle)}" loading="lazy" />
                </figure>
              ` : ''}
              ${isGallery ? renderGalleryHtml(gallery) : ''}
              ${showGuest ? `
                <div class="draft-book-contribution-spotlight">
                  <div class="draft-book-mini-title">Vos proches ont dit...</div>
                  <div class="draft-book-contributor-list">
                    <div class="draft-book-contributor-item">
                      <strong>${escapeHtml(organizerName || 'Organisateur')}</strong>
                      <p>Un moment de verite, precis et vivant, qui donne de la profondeur au recit.</p>
                    </div>
                  </div>
                </div>
              ` : ''}
              <div class="draft-book-folio" aria-hidden="true">
                <span class="draft-book-folio-value">${String(pageIndex + 1).padStart(2, '0')}</span>
                <span class="draft-book-folio-dot"></span>
                <span class="draft-book-folio-value">${String(CHAPTER_PAGE_COUNT).padStart(2, '0')}</span>
              </div>
            </section>
          `;
        }).join('')}
      </div>
    </section>
  `.trim();
}

function renderGalleryHtml(photos) {
  const items = Array.isArray(photos) ? photos.filter(Boolean) : [];
  if (items.length === 0) {
    return '';
  }
  const classes = ['draft-book-gallery'];
  if (items.length === 1) classes.push('is-single');
  if (items.length === 2) classes.push('is-duo');
  if (items.length >= 3) classes.push('is-cols-3');

  return `
    <div class="draft-book-gallery-wrap${items.length === 1 ? ' is-single' : ''}">
      <div class="draft-book-mini-title">Instants en images</div>
      <div class="${classes.join(' ')}">
        ${items.map((url, index) => `
          <figure class="draft-book-photo">
            <img src="${escapeHtml(url)}" alt="Photo ${index + 1}" loading="lazy" />
          </figure>
        `).join('')}
      </div>
    </div>
  `;
}

function buildQuestionsForChapter(title) {
  return [
    `Raconte une scene tres precise liee a "${title}" avec les details de lieu, sons et ambiance.`,
    `Quel geste ou quelle phrase te revient en premier quand tu penses a ce moment ?`,
    `Qu est-ce que ce souvenir dit de la relation avec la personne celebree ?`
  ];
}

function buildOrganizerContributionText(chapterTitle, chapterOrder) {
  const intro = chapterOrder === 0
    ? 'Je voulais que ce livre garde une trace sincere de ce que nous avons vecu ensemble.'
    : 'Ce chapitre est important pour moi car il montre la progression de notre histoire.';

  return [
    intro,
    `Sur "${chapterTitle}", j ai essaye de garder les details concrets: les gestes, les silences, les regards.`,
    'Ces souvenirs racontent autant les emotions que les faits, avec une intention claire de coherence narrative.',
    'Mon objectif est de transmettre une experience de lecture vivante, elegante et profonde.'
  ].join(' ');
}

function buildGuestContributionText(chapterTitle, chapterOrder, variant) {
  const tone = variant % 2 === 0 ? 'chaleureuse' : 'vive';
  return [
    `Quand je pense a "${chapterTitle}", je revois une scene ${tone} ou tout etait tres clair.`,
    'On entendait les voix se melanger, les rires monter, et chaque detail semblait important.',
    chapterOrder % 2 === 0
      ? 'Ce moment a renforce notre sentiment de proximite.'
      : 'Ce souvenir me reste parce qu il a change notre facon de nous parler.',
    'Je veux garder cette trace pour que la lecture reste authentique et precise.'
  ].join(' ');
}

function buildPageBodyText(chapterTitle, chapterIndex, pageNumber) {
  return [
    `Page ${pageNumber} autour de "${chapterTitle}": la narration suit un fil emotionnel progressif et coherent.`,
    'Le texte privilegie les details concrets, les scenes precises et des transitions fluides.',
    chapterIndex % 2 === 0
      ? 'La voix collective des proches reste visible, sans surcharger la page.'
      : 'La respiration typographique aide a lire sans fatigue, meme sur des textes denses.',
    'Chaque bloc est pense pour occuper l espace de facon elegante et stable.'
  ].join('\n\n');
}

function buildCoverConfig({
  bookTitle,
  variant,
  nowIso,
  recipientName,
  recipientAge,
  eventType,
  coverStyle,
  previewFormat
}) {
  const safeEvent = eventType || 'anniversaire';
  const safeRecipient = recipientName || 'Omar';
  const safeAge = Number.isFinite(Number(recipientAge)) ? Number(recipientAge) : 40;

  return {
    title: bookTitle,
    subtitle: 'Edition prestige collaborative',
    recipientLine: `Pour ${safeRecipient}`,
    eventLine: `${capitalizeFirstLetter(safeEvent)} | ${safeAge} ans`,
    quote: `Pour ses ${safeAge} ans, ses proches racontent Omar avec chaleur, humour et precision.`,
    signature: 'Ses proches',
    qrLabel: 'Galerie privee',
    style: coverStyle || 'prestige_contemporain',
    previewFormat: previewFormat || 'luxe',
    previewLayoutSettings: {
      textDensity: 'balanced',
      imageDensity: 'balanced'
    },
    lifecycleStatus: variant === 'finalized' ? 'finalized' : 'editing',
    finalValidatedAt: variant === 'finalized' ? nowIso : null,
    motif: 'olive',
    showMonogram: true,
    showPhotoFrame: false,
    photoLabel: 'Portrait anniversaire'
  };
}

function buildBackCoverConfig({ recipientName, eventType }) {
  const safeRecipient = recipientName || 'Omar';
  const safeEvent = eventType || 'anniversaire';
  return {
    blurb: `Un ouvrage collaboratif pour ${safeRecipient}, qui rassemble les souvenirs marquants de cet ${safeEvent}, les voix des proches et une mise en page premium.`,
    signature: 'Contributions reunies par ses proches',
    quote: 'Un livre unique pour une personne unique.',
    qrLabel: 'Photos et videos',
    dateLocation: `Paris, ${new Date().getFullYear()}`
  };
}

function buildBookTitle({ seedVariant, recipient, eventType }) {
  const suffix = new Date().toISOString().slice(0, 10);
  const safeRecipient = recipient || 'Omar';
  const safeEvent = eventType || 'anniversaire';
  const statusLabel = seedVariant === 'finalized' ? 'finalise' : 'edition';
  return `[DEMO] ${capitalizeFirstLetter(safeEvent)} de ${safeRecipient} - ${statusLabel} ${suffix}`;
}

function pickChapterImages(chapterOrder) {
  const shift = chapterOrder % PHOTO_POOL.length;
  const rotated = [...PHOTO_POOL.slice(shift), ...PHOTO_POOL.slice(0, shift)];
  return rotated.slice(0, 4);
}

function resolveChapterStateForVariant(seedVariant, chapterOrder, totalChapters) {
  if (seedVariant === 'finalized') {
    return 'closed';
  }

  if (chapterOrder <= Math.min(3, totalChapters - 1)) {
    return 'closed';
  }
  if (chapterOrder <= Math.min(5, totalChapters - 1)) {
    return 'contributions_closed';
  }
  return 'open';
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

function normalizeVariant(value) {
  const normalized = cleanArg(value).toLowerCase();
  return normalized === 'finalized' ? 'finalized' : 'editing';
}

function parseBooleanArg(value, defaultValue = false) {
  const normalized = cleanArg(value).toLowerCase();
  if (!normalized) return defaultValue;
  return ['1', 'true', 'yes', 'y', 'on'].includes(normalized);
}

function clampInt(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function cleanArg(value) {
  if (value === null || value === undefined || value === true) return '';
  return String(value).trim();
}

function deriveNameFromEmail(email) {
  const localPart = String(email || '').split('@')[0] || 'organisateur';
  return localPart.replace(/[._-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function pickRandomContributors({ contributors, chapterOrder, minCount, maxCount }) {
  const source = Array.isArray(contributors) ? contributors.slice() : [];
  if (source.length === 0) {
    return [];
  }

  const minSafe = Math.max(1, Math.min(Number(minCount) || 1, source.length));
  const maxSafe = Math.max(minSafe, Math.min(Number(maxCount) || source.length, source.length));
  const random = createSeededRandom(chapterOrder + source.length * 7 + 11);
  const targetCount = Math.floor(random() * (maxSafe - minSafe + 1)) + minSafe;

  shuffleInPlace(source, random);
  return source.slice(0, targetCount);
}

function createSeededRandom(seed) {
  let state = Math.floor(Number(seed) || 1) >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleInPlace(array, random) {
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const tmp = array[i];
    array[i] = array[j];
    array[j] = tmp;
  }
}

function capitalizeFirstLetter(value) {
  const normalized = String(value || '').trim();
  if (!normalized) {
    return '';
  }
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
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

async function insertBookWithSchemaFallback(initialPayload) {
  const payload = { ...initialPayload };
  const ignoredColumns = new Set();

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const candidate = Object.entries(payload).reduce((acc, [key, value]) => {
      if (!ignoredColumns.has(key)) {
        acc[key] = value;
      }
      return acc;
    }, {});

    const { data, error } = await supabase
      .from('books')
      .insert([candidate])
      .select('*')
      .single();

    if (!error) {
      return { data, error: null };
    }

    const message = String(error.message || '');
    const missingColumnMatch = message.match(/Could not find the '([^']+)' column/i);
    if (missingColumnMatch?.[1]) {
      const columnName = missingColumnMatch[1];
      if (ignoredColumns.has(columnName)) {
        return { data: null, error };
      }
      ignoredColumns.add(columnName);
      console.log(`Skipping missing books.${columnName} column for this environment`);
      continue;
    }

    return { data: null, error };
  }

  return {
    data: null,
    error: new Error('Unable to insert demo book after schema fallbacks')
  };
}
