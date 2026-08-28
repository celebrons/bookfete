// Variante du livre de test entierement pret pour l'apercu global :
// couverture + 4e de couverture renseignees, et TOUS les chapitres valides.

const base = require('./bookFixture');

const VALIDATED_BOOK_ID = 'book-validated-1';

function buildValidatedDraftState(title, summary, bodyHtml) {
  return JSON.stringify({
    version: 1,
    status: 'validated',
    generationCount: 1,
    maxGenerations: 3,
    title,
    summary,
    html: bodyHtml,
    aiQuality: { score: 88, issues: [], metrics: {} },
    sections: null,
    generationMode: 'single_pass_db_prompt',
    lastGeneratedAt: '2026-02-10T08:00:00.000Z',
    lastEditedAt: '2026-02-10T09:00:00.000Z',
    finalizedAt: '2026-02-11T08:00:00.000Z'
  });
}

const validatedBook = {
  ...base.book,
  id: VALIDATED_BOOK_ID,
  status: 'ready',
  cover_config: {
    ...base.book.cover_config,
    title: 'Les 60 ans de Marguerite',
    recipientLine: 'Pour Marguerite',
    eventLine: 'Anniversaire — 14 mars 2026',
    previewFormat: 'standard',
    paperType: 'creme'
  },
  back_cover_config: {
    blurb:
      'Trente-huit voix se sont donne rendez-vous dans ces pages pour raconter la meme femme, chacune a sa maniere : la cuisine du dimanche, les surnoms qui collent a la peau, et les etes qui ne finissaient jamais.',
    signature: 'Toute la famille, mars 2026'
  }
};

const validatedChapters = [
  {
    id: 'vchapter-1',
    book_id: VALIDATED_BOOK_ID,
    order_index: 1,
    title: 'Les racines',
    description: 'Ses origines, son village, sa famille.',
    amorce_text: 'Racontez le lieu ou Marguerite a grandi.',
    triggers: ['la maison de famille'],
    contributions: [
      {
        id: 'vdraft-1',
        chapter_id: 'vchapter-1',
        contributor_email: '__chapter_draft__@system.local',
        contributor_name: '__chapter_draft__',
        message: buildValidatedDraftState(
          'Les racines',
          'Le village, la maison aux volets bleus et les etes qui ne finissaient jamais.',
          '<section class="draft-chapter"><h2>Les racines</h2><p>La maison avait des volets bleus qui claquaient au mistral, et une cuisine ou tout le monde finissait par entrer sans frapper.</p><p>Marguerite y a appris a compter en comptant les assiettes.</p></section>'
        ),
        approved: true,
        is_finalized: true,
        created_at: '2026-02-11T08:00:00.000Z'
      }
    ],
    chapter_invites: []
  },
  {
    id: 'vchapter-2',
    book_id: VALIDATED_BOOK_ID,
    order_index: 2,
    title: 'La cuisine du dimanche',
    description: 'Le rituel des repas de famille.',
    amorce_text: 'Quel plat de Marguerite vous revient en memoire ?',
    triggers: ['le grand plat bleu'],
    contributions: [
      {
        id: 'vdraft-2',
        chapter_id: 'vchapter-2',
        contributor_email: '__chapter_draft__@system.local',
        contributor_name: '__chapter_draft__',
        message: buildValidatedDraftState(
          'La cuisine du dimanche',
          'Le grand plat bleu, la radio allumee et les feuilles de brick ratees douze fois.',
          '<section class="draft-chapter"><h2>La cuisine du dimanche</h2><p>La cuisine sentait le cumin bien avant que quiconque descende l escalier.</p><p>Sophie a rate douze feuilles de brick avant la premiere reussie.</p></section>'
        ),
        approved: true,
        is_finalized: true,
        created_at: '2026-02-11T08:30:00.000Z'
      }
    ],
    chapter_invites: []
  },
  {
    id: 'vchapter-3',
    book_id: VALIDATED_BOOK_ID,
    order_index: 3,
    title: 'Ce qu elle nous a transmis',
    description: 'Ce que chacun garde d elle.',
    amorce_text: 'Qu avez-vous appris d elle ?',
    triggers: [],
    contributions: [
      {
        id: 'vdraft-3',
        chapter_id: 'vchapter-3',
        contributor_email: '__chapter_draft__@system.local',
        contributor_name: '__chapter_draft__',
        message: buildValidatedDraftState(
          'Ce qu elle nous a transmis',
          'Les surnoms, la table toujours mise, et l art de ne jamais s excuser avec des mots.',
          '<section class="draft-chapter"><h2>Ce qu elle nous a transmis</h2><p>Personne dans la famille ne sait s excuser avec des mots. On tend une assiette.</p></section>'
        ),
        approved: true,
        is_finalized: true,
        created_at: '2026-02-11T09:00:00.000Z'
      }
    ],
    chapter_invites: []
  }
];

// Chapitre non valide, pour tester le refus d'apercu
const pendingChapter = {
  id: 'vchapter-4-pending',
  book_id: VALIDATED_BOOK_ID,
  order_index: 4,
  title: 'Chapitre en cours',
  description: 'Pas encore genere.',
  amorce_text: 'A completer.',
  triggers: [],
  contributions: [],
  chapter_invites: []
};

const bookWithoutCover = {
  ...validatedBook,
  id: 'book-no-cover-1',
  cover_config: { title: 'Sans couverture validee' },
  back_cover_config: {}
};

function buildTables({ withPendingChapter = false, withBookWithoutCover = true } = {}) {
  const chapters = [...validatedChapters];
  if (withPendingChapter) {
    chapters.push(pendingChapter);
  }

  const books = [validatedBook];
  if (withBookWithoutCover) {
    books.push(bookWithoutCover);
  }

  return {
    books,
    book_configs: [{ ...base.bookConfig, book_id: VALIDATED_BOOK_ID }],
    book_contributors: base.contributors.map((contributor) => ({
      ...contributor,
      book_id: VALIDATED_BOOK_ID
    })),
    chapters: chapters.flatMap((chapter) => {
      const rows = [{ ...chapter }];
      // Le livre sans couverture partage les memes chapitres valides
      if (withBookWithoutCover) {
        rows.push({ ...chapter, id: `nocover-${chapter.id}`, book_id: bookWithoutCover.id });
      }
      return rows;
    }),
    contributions: chapters.flatMap((chapter) => chapter.contributions || [])
  };
}

module.exports = {
  VALIDATED_BOOK_ID,
  NO_COVER_BOOK_ID: bookWithoutCover.id,
  PENDING_CHAPTER_ID: pendingChapter.id,
  validatedBook,
  validatedChapters,
  bookWithoutCover,
  buildValidatedDraftState,
  buildTables
};
