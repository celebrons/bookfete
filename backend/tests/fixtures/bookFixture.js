// Jeu de donnees deterministe reproduisant un livre en cours de redaction :
// 3 chapitres, un chapitre courant avec contribution organisateur + 2 invites
// approuves, photos, invitations. Sert de base aux tests de rendu.

const OWNER_ID = 'owner-test-1';
const OWNER_EMAIL = 'organisateur@test.local';
const BOOK_ID = 'book-test-1';
const CHAPTER_ID = 'chapter-test-2';

const book = {
  id: BOOK_ID,
  owner_id: OWNER_ID,
  title: 'Les 60 ans de Marguerite',
  recipient_name: 'Marguerite',
  recipient_age: 60,
  recipient_gender: 'femme',
  event_type: 'anniversaire',
  style_narratif: 'intime',
  status: 'editing',
  created_at: '2026-01-05T09:00:00.000Z',
  cover_config: {
    aiProjectBrief: 'Un livre tendre et lumineux pour les 60 ans de Marguerite, entre rires et souvenirs de famille.',
    title: 'Les 60 ans de Marguerite',
    subtitle: 'Recueil de nos souvenirs',
    paperType: 'creme',
    format: 'standard'
  }
};

const bookConfig = {
  id: 'config-test-1',
  book_id: BOOK_ID,
  event_type: 'anniversaire',
  event_subtype: 'anniversaire_rond',
  narrative_person: 'third_person',
  recipient_nickname: 'Margot',
  character_trait: 'genereuse et taquine, toujours la premiere a rire',
  signature_anecdote: 'Elle a un jour prepare un couscous pour 40 personnes sans prevenir personne.',
  signature_phrase: 'Allez, encore une petite assiette !',
  future_wish: 'Que ses etes en Provence durent encore longtemps.'
};

const contributors = [
  { id: 'contrib-1', book_id: BOOK_ID, name: 'Sophie Berger', email: 'sophie@test.local' },
  { id: 'contrib-2', book_id: BOOK_ID, name: 'Karim Haddad', email: 'karim@test.local' },
  { id: 'contrib-3', book_id: BOOK_ID, name: 'Elena Rossi', email: 'elena@test.local' }
];

const currentChapterContributions = [
  {
    id: 'contribution-org-1',
    chapter_id: CHAPTER_ID,
    contributor_email: OWNER_EMAIL,
    contributor_name: 'Moi (organisateur)',
    message:
      "C'est dans la cuisine de Marguerite que tout se passait. Le dimanche matin, elle sortait le grand plat bleu et nous appelait un par un. On savait qu'il fallait venir, sinon elle montait le son de la radio jusqu'a ce qu'on cede.",
    photo_urls: ['https://cdn.test.local/photos/cuisine.jpg'],
    approved: true,
    is_finalized: true,
    needs_revision: false,
    created_at: '2026-02-01T10:00:00.000Z'
  },
  {
    id: 'contribution-guest-1',
    chapter_id: CHAPTER_ID,
    contributor_email: 'sophie@test.local',
    contributor_name: 'Sophie Berger',
    message:
      "Je me souviens du jour ou elle m'a appris a plier les feuilles de brick. J'en ai rate douze avant la premiere reussie, et elle riait tellement qu'elle en avait les larmes aux yeux.",
    photo_urls: ['https://cdn.test.local/photos/brick.jpg', 'https://cdn.test.local/photos/table.jpg'],
    approved: true,
    is_finalized: true,
    needs_revision: false,
    created_at: '2026-02-02T11:30:00.000Z'
  },
  {
    id: 'contribution-guest-2',
    chapter_id: CHAPTER_ID,
    contributor_email: 'karim@test.local',
    contributor_name: 'Karim Haddad',
    message:
      "Marguerite ne m'a jamais appele par mon prenom. Pour elle j'etais 'le grand'. Trente ans plus tard, elle continue, et honnetement ca me manquerait si elle arretait.",
    photo_urls: [],
    approved: true,
    is_finalized: true,
    needs_revision: false,
    created_at: '2026-02-03T09:15:00.000Z'
  },
  // Contribution non approuvee : doit etre exclue du rendu
  {
    id: 'contribution-guest-3',
    chapter_id: CHAPTER_ID,
    contributor_email: 'elena@test.local',
    contributor_name: 'Elena Rossi',
    message: 'Contribution en attente de moderation, ne doit pas apparaitre dans le brouillon.',
    photo_urls: [],
    approved: false,
    is_finalized: true,
    needs_revision: false,
    created_at: '2026-02-04T09:15:00.000Z'
  }
];

const chapters = [
  {
    id: 'chapter-test-1',
    book_id: BOOK_ID,
    order_index: 1,
    title: 'Les racines',
    description: 'Ses origines, son village, sa famille.',
    amorce_text: 'Racontez le lieu ou Marguerite a grandi.',
    triggers: ['la maison de famille', 'les etes en Provence'],
    contributions: [
      {
        id: 'contribution-state-1',
        chapter_id: 'chapter-test-1',
        contributor_email: '__chapter_draft__@system.local',
        contributor_name: '__chapter_draft__',
        message: JSON.stringify({
          version: 1,
          status: 'validated',
          generationCount: 2,
          maxGenerations: 3,
          title: 'Les racines',
          summary: 'Le village, la maison aux volets bleus et les etes qui ne finissaient jamais.',
          html: '<section><p>Chapitre valide.</p></section>',
          lastGeneratedAt: '2026-02-10T08:00:00.000Z',
          finalizedAt: '2026-02-11T08:00:00.000Z'
        }),
        approved: true,
        is_finalized: true,
        created_at: '2026-02-11T08:00:00.000Z'
      }
    ],
    chapter_invites: []
  },
  {
    id: CHAPTER_ID,
    book_id: BOOK_ID,
    order_index: 2,
    title: 'La cuisine du dimanche',
    description: 'Le rituel des repas de famille, les odeurs, les disputes et les rires.',
    amorce_text: 'Quel plat de Marguerite vous revient immediatement en memoire ?',
    triggers: ['le grand plat bleu', 'la radio dans la cuisine', 'les feuilles de brick'],
    contributions: currentChapterContributions,
    chapter_invites: [
      { id: 'invite-1', chapter_id: CHAPTER_ID, email: 'sophie@test.local', accepted: true, contributed: true },
      { id: 'invite-2', chapter_id: CHAPTER_ID, email: 'karim@test.local', accepted: true, contributed: true },
      { id: 'invite-3', chapter_id: CHAPTER_ID, email: 'elena@test.local', accepted: true, contributed: false },
      { id: 'invite-4', chapter_id: CHAPTER_ID, email: 'absent@test.local', accepted: false, contributed: false }
    ]
  },
  {
    id: 'chapter-test-3',
    book_id: BOOK_ID,
    order_index: 3,
    title: 'Ce qu elle nous a transmis',
    description: 'Ce que chacun garde d elle.',
    amorce_text: 'Qu avez-vous appris d elle sans qu elle vous l enseigne ?',
    triggers: [],
    contributions: [],
    chapter_invites: []
  }
];

function buildTables(overrides = {}) {
  return {
    books: [book],
    book_configs: [bookConfig],
    book_contributors: contributors,
    chapters: chapters.map((chapter) => ({
      ...chapter,
      contributions: [...(chapter.contributions || [])],
      chapter_invites: [...(chapter.chapter_invites || [])]
    })),
    contributions: chapters.flatMap((chapter) => chapter.contributions || []),
    ...overrides
  };
}

module.exports = {
  OWNER_ID,
  OWNER_EMAIL,
  BOOK_ID,
  CHAPTER_ID,
  book,
  bookConfig,
  contributors,
  chapters,
  currentChapterContributions,
  buildTables
};
