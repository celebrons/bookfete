require('dotenv').config();

const { createClient } = require('@supabase/supabase-js');

const CHAPTER_STATE_EMAIL = '__chapter_state__@system.local';
const CHAPTER_DRAFT_EMAIL = '__chapter_draft__@system.local';
const DEFAULT_BOOK_ID = '47b56660-ad86-4602-8211-3b03da5c388f';
const DEFAULT_OWNER_EMAIL = 'test1@test.com';
const DEFAULT_TITLE_HINT = 'Anniversaire de Omar';
const MIN_REGULAR_CONTRIBUTIONS = 4;
const CHAPTER_PAGE_COUNT = 8;

const CHAPTER_BLUEPRINTS = [
  {
    title: 'Ouverture - Le souffle des quarante',
    description: 'Le soir ou tout le monde est la, pret a celebrer Omar.',
    chapterMood: 'lumiere chaude, maison ouverte, energie collective',
    intro: [
      'La veille de la fete, la maison a change de rythme. Il y avait des fleurs sur la table, une playlist qui tournait en boucle et cette sensation que quelque chose d important allait se jouer.',
      'Pour les 40 ans d Omar, chacun est venu avec un souvenir precise. Pas seulement pour raconter une anecdote, mais pour dire ce que sa presence change dans une vie.'
    ],
    bridge: 'Ce premier chapitre pose le ton: simple, vivant, sincere.',
    closing: 'Le livre s ouvre ici, dans cette piece pleine de voix et de regards complices.',
    questions: [
      'Quel detail de la preparation des 40 ans d Omar t a marque en premier ?',
      'Raconte une scene precise de l arrivee des proches: qui etait la, que disait-on, quelle ambiance ?',
      'Qu est-ce que cette ouverture raconte deja de sa place dans le groupe ?'
    ],
    detailPool: [
      'l odeur du gateau encore tiede et des bougies qu on testait en secret',
      'les rubans poses sur la table et les photos etalees pour la surprise',
      'la porte d entree qui s ouvrait toutes les cinq minutes avec un nouveau rire'
    ],
    dialoguePool: [
      '"On tient le timing, mais on garde de la place pour l emotion", a souffle Camille en refermant un album photo.',
      '"Ce soir, on ne lit pas un discours, on raconte Omar comme on le vit", a dit Hugo en branchant l enceinte.',
      '"On veut du vrai, pas du parfait", a resume Lea avec un sourire.'
    ],
    insightPool: [
      'Ce moment a montre qu autour de lui, les gens osent etre eux-memes.',
      'On a compris que sa force n est pas de prendre toute la place, mais de donner de la place aux autres.',
      'Des le debut, tout disait la meme chose: Omar rassemble sans jamais forcer.'
    ]
  },
  {
    title: 'Chapitre 1 - Les racines d Omar',
    description: 'Ce qui a construit Omar: gestes, principes, transmissions.',
    chapterMood: 'memoire familiale, gratitude, fidelite',
    intro: [
      'Parler de ses 40 ans, c etait impossible sans revenir a ses racines. Les souvenirs de famille reviennent toujours avec des details tres concrets: une phrase, un repas, un dimanche lent.',
      'Ce chapitre montre ce qui tient encore aujourd hui: la loyaut, la pudeur, l humour qui desamorce et la facon de rester present quand il faut.'
    ],
    bridge: 'On ne raconte pas seulement un passe, on explique une base.',
    closing: 'Ses racines ne l enferment pas: elles lui donnent une direction.',
    questions: [
      'Quel souvenir d enfance ou de jeunesse explique le mieux la personnalite d Omar ?',
      'Quel geste transmis par sa famille le suit encore aujourd hui ?',
      'Si tu devais resumer ses racines en une scene, laquelle choisirais-tu ?'
    ],
    detailPool: [
      'la table du dimanche, toujours pleine, ou chacun racontait sa semaine',
      'les trajets en voiture avec des conseils glisses entre deux blagues',
      'les petits rituels de famille qui paraissaient simples mais tenaient tout ensemble'
    ],
    dialoguePool: [
      '"Chez nous, on finit ce qu on commence", lui rappelait souvent sa mere.',
      '"Reste calme, puis avance", repetait son pere quand un choix etait difficile.',
      '"On peut rire de tout, sauf de la parole donnee", disait souvent un oncle.'
    ],
    insightPool: [
      'C est la qu il a appris la constance: faire peu de promesses, mais les tenir.',
      'Ces reperes lui ont donne une boussole tres claire, meme dans les periodes floues.',
      'Derriere son humour, il y a toujours un sens tres net de la responsabilite.'
    ]
  },
  {
    title: 'Chapitre 2 - La bande et les liens solides',
    description: 'Amitie, fratrie choisie, moments qui ont cree le nous.',
    chapterMood: 'amities longues, complicite, confiance',
    intro: [
      'Autour d Omar, il y a une bande qui n a pas besoin de se parler tous les jours pour rester soudee. Chacun le decrit avec des mots differents, mais tous racontent la meme fiabilite.',
      'Ce chapitre capte ces liens la: ceux qui tiennent dans les bons moments, et surtout quand les choses se compliquent.'
    ],
    bridge: 'L amitie ici n est pas une decoration, c est une structure.',
    closing: 'A 40 ans, il ne collectionne pas des contacts: il cultive des liens.',
    questions: [
      'Raconte une scene d amitie avec Omar qui resume votre facon de fonctionner ensemble.',
      'Quel moment difficile avez-vous traverse a plusieurs, et comment Omar a tenu sa place ?',
      'Qu est-ce qui rend votre groupe different quand il est la ?'
    ],
    detailPool: [
      'les messages de groupe qui commencent en blagues et finissent en vraie entraide',
      'les soirees improvisees ou personne ne voulait etre ailleurs',
      'les trajets tardifs pour aller aider un proche sans poser de question'
    ],
    dialoguePool: [
      '"On y va ensemble, on revient ensemble", a lance Yanis en attrapant les cles.',
      '"Avec lui, pas de theatre: on se dit les choses, puis on avance", a dit Mehdi.',
      '"Il t ecoute vraiment, meme quand tout le monde est distrait", a souligne Sofia.'
    ],
    insightPool: [
      'Son vrai talent, c est d unir des profils tres differents sans lisser les personnalites.',
      'Il transforme un groupe d amis en equipe qui se fait confiance.',
      'Sa loyaut est concrete: des actes, du temps, et de la constance.'
    ]
  },
  {
    title: 'Chapitre 3 - Rires, scenes et legendes',
    description: 'Les episodes qui font rire encore des annees apres.',
    chapterMood: 'humour tendre, details visuels, joie partagee',
    intro: [
      'Chaque famille a ses legendes. Chez Omar, elles reviennent toujours au bon moment, souvent a table, et personne ne s en lasse.',
      'Ce chapitre rassemble les scenes qui provoquent encore les memes eclats de rire: les maladresses, les reparties et les improvisations improbables.'
    ],
    bridge: 'On rit, mais on comprend aussi sa facon de garder le groupe leger.',
    closing: 'Ces rires-la valent de l or: ils deviennent une memoire collective.',
    questions: [
      'Quelle anecdote sur Omar fait encore rire tout le monde des que tu la racontes ?',
      'Decris la scene comme un plan de cinema: decor, sons, gestes, dialogues.',
      'Pourquoi ce souvenir est-il devenu une legende familiale ?'
    ],
    detailPool: [
      'les verres qui s entrechoquent pendant qu il improvise une imitation',
      'les regards complices juste avant qu une blague parte trop loin',
      'les photos floues prises au pire moment, devenues les plus precieuses'
    ],
    dialoguePool: [
      '"Ne t inquiete pas, j ai un plan", a dit Omar cinq secondes avant une improvisation totale.',
      '"On dirait un sketch ecrit a l avance, sauf que rien n etait prevu", a ri Lina.',
      '"Avec lui, meme un retard devient une histoire qu on raconte encore", a note Nora.'
    ],
    insightPool: [
      'Son humour n ecrase jamais les autres: il les embarque.',
      'Il sait detendre une piece sans la vider de sens.',
      'Ce rire commun est aussi une preuve de confiance entre proches.'
    ]
  },
  {
    title: 'Chapitre 4 - Les virages et le courage',
    description: 'Les passages exigeants qui ont renforce Omar et son entourage.',
    chapterMood: 'solidite, determination, pudeur',
    intro: [
      'Un anniversaire compte aussi parce qu il regarde les passages plus rudes. Omar en a traverse plusieurs, souvent sans bruit, avec une discipline impressionnante.',
      'Ce chapitre parle de ces virages: decisions lourdes, fatigue, incertitudes, et cette facon de tenir debout pour lui et pour les autres.'
    ],
    bridge: 'Le courage ici n est pas spectaculaire: il est quotidien.',
    closing: 'Ce qu il a traverse donne du relief a tout le reste.',
    questions: [
      'Raconte un moment difficile ou Omar a montre une force particuliere.',
      'Quel geste concret a-t-il pose pour traverser cette periode ?',
      'Qu est-ce que cette epreuve a change dans votre regard sur lui ?'
    ],
    detailPool: [
      'les rendez-vous enchainees, les carnets remplis et les nuits courtes',
      'les appels tardifs ou il prenait des nouvelles des autres malgre sa propre pression',
      'les matins silencieux ou il repartait quand meme avec methode'
    ],
    dialoguePool: [
      '"On fait un pas utile aujourd hui, puis un autre demain", disait-il quand la charge etait forte.',
      '"Je prefere avancer lentement que promettre trop vite", a-t-il repete pendant des semaines.',
      '"Je tiens, ne t en fais pas, on trouvera une sortie propre", a-t-il dit pour rassurer tout le monde.'
    ],
    insightPool: [
      'Sa force est sobre: peu de mots, beaucoup d actes.',
      'Dans les moments tendus, il garde la tete froide et une ligne claire.',
      'Il a montre qu on peut rester solide sans se durcir.'
    ]
  },
  {
    title: 'Epilogue - La suite commence',
    description: 'Clore les 40 ans et ouvrir la prochaine decennie.',
    chapterMood: 'projection, tendresse, elan',
    intro: [
      'Arriver a la fin de ce livre, c est regarder Omar tel qu il est aujourd hui: ancre, lucide, entoure, et toujours en mouvement.',
      'L epilogue ne ferme pas une histoire. Il ouvre une nouvelle sequence, avec la meme qualite de liens et une envie intacte de construire.'
    ],
    bridge: 'Ce qui a ete raconte ici sert de point d appui pour la suite.',
    closing: 'Quarante ans: une etape. Le meilleur reste a inventer.',
    questions: [
      'Quand tu penses aux dix prochaines annees d Omar, que lui souhaites-tu concretement ?',
      'Quelle qualite d Omar veux-tu absolument voir intacte dans la suite ?',
      'Quel message aimerais-tu lui laisser pour relire ce livre plus tard ?'
    ],
    detailPool: [
      'les toasts de fin de soiree, entre sourire et voix un peu serree',
      'les derniers invites qui restent pour prolonger le moment',
      'la sensation calme apres la fete, quand chacun comprend ce qui vient de se passer'
    ],
    dialoguePool: [
      '"On a celebre ton passe, maintenant on pousse ton horizon", a lance un proche en levant son verre.',
      '"Ce livre, c est une promesse de presence pour la suite", a dit Camille.',
      '"Tu as 40 ans, mais l energie d un nouveau depart", a resume Hugo.'
    ],
    insightPool: [
      'Tout le monde sort de cette fete avec une meme certitude: Omar avance, et nous avec lui.',
      'La suite ne sera pas parfaite, mais elle sera entouree, solide et joyeuse.',
      'Ce final laisse une trace utile: une memoire qui donne de l elan.'
    ]
  }
];

const RELATION_BY_NAME = {
  camille: 'sa soeur',
  hugo: 'son cousin',
  lea: 'son amie de longue date',
  nora: 'son amie du quotidien',
  yanis: 'son ami de route',
  sofia: 'sa cousine',
  mehdi: 'son ami de toujours',
  lina: 'sa belle-soeur'
};

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const args = parseArgs(process.argv.slice(2));
const targetBookId = cleanArg(args['book-id']) || DEFAULT_BOOK_ID;
const ownerEmail = cleanArg(args['owner-email']) || DEFAULT_OWNER_EMAIL;
const titleHint = cleanArg(args['title-hint']) || DEFAULT_TITLE_HINT;

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Omar 40 enrichment failed:', error.message);
    process.exit(1);
  });

async function run() {
  const targetBook = await resolveTargetBook({
    bookId: targetBookId,
    ownerEmail,
    titleHint
  });

  if (!targetBook?.id) {
    throw new Error('Target book not found.');
  }

  const ownerProfile = await fetchOwnerProfile(targetBook.owner_id);
  const ownerName = ownerProfile?.full_name || deriveNameFromEmail(ownerProfile?.email || ownerEmail || 'organisateur');
  const ownerMail = ownerProfile?.email || ownerEmail || `owner-${targetBook.owner_id}@demo.local`;
  const recipientName = targetBook.recipient_name || 'Omar';
  const recipientAge = Number(targetBook.recipient_age || 40);

  const chapters = await fetchChapters(targetBook.id);
  if (chapters.length === 0) {
    throw new Error('No chapters found on target book.');
  }

  const contributors = await fetchBookContributors(targetBook.id);
  const roster = buildRoster({
    ownerName,
    ownerEmail: ownerMail,
    contributors
  });

  const updateSummary = {
    chaptersUpdated: 0,
    contributionsUpdated: 0,
    contributionsInserted: 0,
    draftsUpdated: 0,
    draftsInserted: 0
  };

  for (let chapterIndex = 0; chapterIndex < chapters.length; chapterIndex += 1) {
    const chapter = chapters[chapterIndex];
    const blueprint = CHAPTER_BLUEPRINTS[Math.min(chapterIndex, CHAPTER_BLUEPRINTS.length - 1)];
    const chapterTitle = blueprint.title;
    const chapterDescription = blueprint.description;
    const chapterQuestions = blueprint.questions;

    const { error: chapterUpdateError } = await supabase
      .from('chapters')
      .update({
        title: chapterTitle,
        description: chapterDescription,
        questions_ia: chapterQuestions,
        questions_validated: true
      })
      .eq('id', chapter.id);

    if (chapterUpdateError) {
      throw new Error(`Unable to update chapter ${chapter.id}: ${chapterUpdateError.message}`);
    }

    updateSummary.chaptersUpdated += 1;

    const chapterContributions = await fetchChapterContributions(chapter.id);
    const regularRows = chapterContributions.filter((row) => isRegularContribution(row.contributor_email));
    const draftRow = chapterContributions.find((row) => String(row.contributor_email || '').toLowerCase() === CHAPTER_DRAFT_EMAIL);
    const chapterPhotos = buildChapterPhotos(chapter.id, chapterIndex);

    const desiredContributionCount = Math.max(MIN_REGULAR_CONTRIBUTIONS, regularRows.length);
    const speakers = pickSpeakersForChapter({
      roster,
      chapterIndex,
      count: desiredContributionCount
    });

    const narratives = speakers.map((speaker, speakerIndex) => ({
      speaker,
      message: buildTestimonyText({
        chapterTitle,
        blueprint,
        recipientName,
        speaker,
        chapterIndex,
        speakerIndex
      }),
      photoUrls: [
        chapterPhotos[(speakerIndex * 2) % chapterPhotos.length],
        chapterPhotos[(speakerIndex * 2 + 1) % chapterPhotos.length]
      ]
    }));

    for (let index = 0; index < regularRows.length; index += 1) {
      const row = regularRows[index];
      const narrative = narratives[index % narratives.length];
      const payload = {
        contributor_name: narrative.speaker.name,
        contributor_email: narrative.speaker.email,
        message: narrative.message,
        photo_urls: narrative.photoUrls,
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
      updateSummary.contributionsUpdated += 1;
    }

    if (regularRows.length < narratives.length) {
      const toInsert = narratives.slice(regularRows.length).map((narrative) => ({
        chapter_id: chapter.id,
        contributor_name: narrative.speaker.name,
        contributor_email: narrative.speaker.email,
        message: narrative.message,
        photo_urls: narrative.photoUrls,
        approved: true,
        is_finalized: true,
        needs_revision: false,
        moderation_feedback: null
      }));

      const { error: insertError } = await supabase
        .from('contributions')
        .insert(toInsert);

      if (insertError) {
        throw new Error(`Unable to insert contributions for chapter ${chapterTitle}: ${insertError.message}`);
      }
      updateSummary.contributionsInserted += toInsert.length;
    }

    const refreshed = await fetchChapterContributions(chapter.id);
    const regularAfter = refreshed.filter((row) => isRegularContribution(row.contributor_email));
    const draftPayload = buildDraftPayload({
      chapterTitle,
      chapterIndex,
      recipientName,
      recipientAge,
      blueprint,
      photos: chapterPhotos,
      contributions: regularAfter.map((row) => ({
        name: row.contributor_name,
        email: row.contributor_email,
        message: row.message,
        photoUrls: Array.isArray(row.photo_urls) ? row.photo_urls : []
      })),
      previousRaw: draftRow?.message
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
        throw new Error(`Unable to update chapter draft for ${chapterTitle}: ${draftUpdateError.message}`);
      }
      updateSummary.draftsUpdated += 1;
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
        throw new Error(`Unable to insert chapter draft for ${chapterTitle}: ${draftInsertError.message}`);
      }
      updateSummary.draftsInserted += 1;
    }
  }

  const coverConfig = mergeCoverConfig(targetBook.cover_config, {
    title: 'Omar, 40 ans de liens et de lumiere',
    subtitle: 'Edition prestige anniversaire',
    recipientLine: 'Pour Omar',
    eventLine: `Anniversaire | ${Number.isFinite(recipientAge) ? recipientAge : 40} ans`,
    quote: 'Huit proches, six chapitres et une memoire collective pour ses quarante ans.',
    signature: 'Ses proches',
    style: 'elegance_intemporelle'
  });

  const backCoverConfig = mergeBackConfig(targetBook.back_cover_config, {
    blurb: 'Ce livre retrace l anniversaire des 40 ans d Omar a travers des scenes precises, des voix sinceres et des souvenirs qui donnent envie de relire.',
    signature: 'Contributions reunies par ses proches',
    quote: 'Une histoire collective, intime et lumineuse.',
    qrLabel: 'Galerie souvenirs',
    dateLocation: `Paris, ${new Date().getFullYear()}`
  });

  const { error: bookUpdateError } = await supabase
    .from('books')
    .update({
      event_type: 'anniversaire',
      recipient_name: recipientName,
      recipient_age: Number.isFinite(recipientAge) ? recipientAge : 40,
      style_narratif: 'intime',
      cover_config: coverConfig,
      back_cover_config: backCoverConfig
    })
    .eq('id', targetBook.id);

  if (bookUpdateError) {
    throw new Error(`Unable to update book cover/back config: ${bookUpdateError.message}`);
  }

  console.log('Done.');
  console.log(`Book: ${targetBook.id} (${targetBook.title})`);
  console.log(`Chapters updated: ${updateSummary.chaptersUpdated}`);
  console.log(`Contributions updated: ${updateSummary.contributionsUpdated}`);
  console.log(`Contributions inserted: ${updateSummary.contributionsInserted}`);
  console.log(`Drafts updated: ${updateSummary.draftsUpdated}`);
  console.log(`Drafts inserted: ${updateSummary.draftsInserted}`);
}

async function resolveTargetBook({ bookId, ownerEmail: ownerMail, titleHint: hint }) {
  if (bookId) {
    const { data, error } = await supabase
      .from('books')
      .select('id, title, owner_id, recipient_name, recipient_age, cover_config, back_cover_config')
      .eq('id', bookId)
      .maybeSingle();
    if (error) {
      throw new Error(`Unable to fetch book by id: ${error.message}`);
    }
    if (data) return data;
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
    .select('id, title, owner_id, recipient_name, recipient_age, cover_config, back_cover_config')
    .order('created_at', { ascending: false })
    .limit(20);

  if (ownerId) {
    query = query.eq('owner_id', ownerId);
  }

  if (hint) {
    query = query.ilike('title', `%${hint}%`);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Unable to fetch target book: ${error.message}`);
  }
  if (!Array.isArray(data) || data.length === 0) {
    return null;
  }
  return data[0];
}

async function fetchOwnerProfile(ownerId) {
  if (!ownerId) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .eq('id', ownerId)
    .maybeSingle();
  if (error) return null;
  return data || null;
}

async function fetchChapters(bookId) {
  const { data, error } = await supabase
    .from('chapters')
    .select('id, title, order_index, description')
    .eq('book_id', bookId)
    .order('order_index', { ascending: true });
  if (error) {
    throw new Error(`Unable to fetch chapters: ${error.message}`);
  }
  return Array.isArray(data) ? data : [];
}

async function fetchBookContributors(bookId) {
  const { data, error } = await supabase
    .from('book_contributors')
    .select('name, email')
    .eq('book_id', bookId)
    .order('created_at', { ascending: true });
  if (error) {
    throw new Error(`Unable to fetch book contributors: ${error.message}`);
  }
  return Array.isArray(data) ? data : [];
}

async function fetchChapterContributions(chapterId) {
  const { data, error } = await supabase
    .from('contributions')
    .select('id, contributor_name, contributor_email, message, photo_urls, created_at')
    .eq('chapter_id', chapterId)
    .order('created_at', { ascending: true });
  if (error) {
    throw new Error(`Unable to fetch chapter contributions: ${error.message}`);
  }
  return Array.isArray(data) ? data : [];
}

function buildRoster({ ownerName, ownerEmail, contributors }) {
  const list = [{
    name: ownerName || 'Organisateur',
    email: ownerEmail || 'organisateur@demo.local',
    relation: 'organisateur du livre',
    isOwner: true
  }];

  (Array.isArray(contributors) ? contributors : []).forEach((entry) => {
    if (!entry?.email) return;
    const cleanName = String(entry.name || deriveNameFromEmail(entry.email)).trim();
    const normalized = cleanName.toLowerCase();
    list.push({
      name: cleanName,
      email: entry.email,
      relation: RELATION_BY_NAME[normalized] || 'proche de la famille',
      isOwner: false
    });
  });

  return dedupeSpeakers(list);
}

function dedupeSpeakers(speakers) {
  const seen = new Set();
  const out = [];
  (Array.isArray(speakers) ? speakers : []).forEach((speaker) => {
    const key = String(speaker?.email || '').toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(speaker);
  });
  return out;
}

function pickSpeakersForChapter({ roster, chapterIndex, count }) {
  const speakers = Array.isArray(roster) ? roster.slice() : [];
  if (speakers.length === 0) {
    return [];
  }

  const owner = speakers.find((speaker) => speaker.isOwner);
  const others = speakers.filter((speaker) => !speaker.isOwner);
  const picked = [];
  if (owner) {
    picked.push(owner);
  }

  const start = (chapterIndex * 2) % Math.max(others.length, 1);
  for (let i = 0; i < others.length && picked.length < count; i += 1) {
    picked.push(others[(start + i) % others.length]);
  }

  while (picked.length < count) {
    picked.push(speakers[picked.length % speakers.length]);
  }
  return picked;
}

function buildChapterPhotos(chapterId, chapterIndex) {
  const seedBase = `${String(chapterId || '').slice(0, 8)}-${chapterIndex + 1}`;
  return [
    `https://picsum.photos/seed/omar40-${seedBase}-a/1600/1000`,
    `https://picsum.photos/seed/omar40-${seedBase}-b/1600/1000`,
    `https://picsum.photos/seed/omar40-${seedBase}-c/1600/1000`,
    `https://picsum.photos/seed/omar40-${seedBase}-d/1600/1000`,
    `https://picsum.photos/seed/omar40-${seedBase}-e/1600/1000`,
    `https://picsum.photos/seed/omar40-${seedBase}-f/1600/1000`
  ];
}

function buildTestimonyText({
  chapterTitle,
  blueprint,
  recipientName,
  speaker,
  chapterIndex,
  speakerIndex
}) {
  const detail = blueprint.detailPool[(speakerIndex + chapterIndex) % blueprint.detailPool.length];
  const line = blueprint.dialoguePool[(speakerIndex + chapterIndex) % blueprint.dialoguePool.length];
  const insight = blueprint.insightPool[(speakerIndex + chapterIndex) % blueprint.insightPool.length];
  const relation = speaker.isOwner ? 'en tant qu organisateur du livre' : `en tant que ${speaker.relation}`;

  return [
    `Je parle ici ${relation}. Pour "${chapterTitle}", je revois tres nettement ${detail}.`,
    `${line} Ce n etait pas une grande mise en scene, juste un moment vrai, avec les voix, les gestes et les regards qui disent tout sans forcer.`,
    `Ce souvenir decrit bien ${recipientName}: present, attentif, et capable de garder le cap meme quand la piece bouge dans tous les sens.`,
    `${insight} C est pour cela que je voulais que ce passage figure dans ce livre de ses 40 ans.`
  ].join('\n\n');
}

function buildDraftPayload({
  chapterTitle,
  chapterIndex,
  recipientName,
  recipientAge,
  blueprint,
  photos,
  contributions,
  previousRaw
}) {
  const nowIso = new Date().toISOString();
  const previous = parseJson(previousRaw);
  const normalizedContributions = Array.isArray(contributions) ? contributions : [];
  const excerpts = normalizedContributions
    .slice(0, 5)
    .map((entry) => ({
      name: entry.name || 'Proche',
      excerpt: firstSentence(entry.message || '')
    }))
    .filter((entry) => entry.excerpt);

  const html = buildChapterHtml({
    chapterTitle,
    chapterIndex,
    recipientName,
    recipientAge,
    blueprint,
    photos,
    excerpts
  });

  return {
    version: Math.max(1, Number(previous?.version || 1)),
    status: 'validated',
    generationCount: Math.max(2, Number(previous?.generationCount || 0) + 1),
    maxGenerations: Math.max(3, Number(previous?.maxGenerations || 3)),
    title: chapterTitle,
    summary: `Version narrative enrichie pour les 40 ans de ${recipientName}.`,
    html,
    aiQuality: {
      score: 93,
      issues: []
    },
    aiPlan: {
      structure: '8_pages',
      tone: 'intime',
      enrichment: 'narration+temoignages+images'
    },
    generationMode: 'seed_omar40_enrichment',
    lastGeneratedAt: nowIso,
    lastEditedAt: nowIso,
    finalizedAt: previous?.finalizedAt || nowIso
  };
}

function buildChapterHtml({
  chapterTitle,
  chapterIndex,
  recipientName,
  recipientAge,
  blueprint,
  photos,
  excerpts
}) {
  const heroPhoto = photos[0] || '';
  const galleryPhotos = photos.slice(1, 4);
  const excerptA = excerpts[0]?.excerpt || `Ce soir des 40 ans a montre une version tres juste de ${recipientName}.`;
  const excerptB = excerpts[1]?.excerpt || 'Chaque voix ajoute un angle concret et sincere.';
  const excerptC = excerpts[2]?.excerpt || 'Le groupe raconte la meme personne, avec des mots differents mais complementaires.';
  const chapterNumber = String(chapterIndex + 1).padStart(2, '0');

  const pages = [
    {
      heading: chapterTitle,
      paragraphs: blueprint.intro,
      extra: `<p class="draft-book-intro">${escapeHtml(blueprint.bridge)}</p>`
    },
    {
      heading: 'Le decor qui revenait dans toutes les voix',
      paragraphs: [
        `Ce qui frappe dans les temoignages, c est la precision du decor: ${blueprint.chapterMood}. Rien d artificiel, juste une scene vivante ou chacun trouve naturellement sa place.`,
        `Pour les ${recipientAge || 40} ans de ${recipientName}, les proches ne racontent pas seulement des faits. Ils racontent des atmospheres: un ton de voix, un regard au bon moment, une phrase qui reste.`
      ]
    },
    {
      heading: 'Une scene cle',
      paragraphs: [
        excerptA,
        excerptB
      ],
      callout: `"${excerptC}"`
    },
    {
      heading: 'Instant en image',
      paragraphs: [
        'Cette page garde un rythme plus visuel pour laisser respirer le recit. Le texte se retire un peu, l image prend la main, puis la narration revient au fil suivant.',
        'L objectif est de construire un livre agreable a relire: dense quand il faut, epure quand c est necessaire.'
      ],
      heroPhoto
    },
    {
      heading: 'Points de memoire',
      paragraphs: [
        `Ce que tout le monde confirme: ${recipientName} a une facon tres concrete d etre present.`,
        'On retrouve trois constantes dans les recits ci-dessous.'
      ],
      list: [
        'Une attention sincere aux autres, meme dans les moments charges.',
        'Une facon d installer la confiance sans grandes declarations.',
        'Un humour qui rassemble et qui protege la dynamique du groupe.'
      ]
    },
    {
      heading: 'Vos proches ont dit...',
      paragraphs: [
        'Ces extraits courts preservent la voix de chacun sans casser le rythme du chapitre.'
      ],
      spotlight: excerpts.slice(0, 3)
    },
    {
      heading: 'Instants en images',
      paragraphs: [
        'Les photos servent ici de respiration et de trace. Elles confirment les details racontes et donnent du relief a la lecture.'
      ],
      gallery: galleryPhotos
    },
    {
      heading: 'Epilogue du chapitre',
      paragraphs: [
        blueprint.closing,
        `Ce chapitre ${chapterNumber} laisse une matiere solide pour la suite du livre: des faits, des voix, des scenes, et une emotion claire.`
      ]
    }
  ];

  const htmlPages = pages.map((page, pageIndex) => {
    return `
      <section class="draft-book-page${pageIndex === 0 ? ' draft-book-page-opening' : ''}${page.gallery ? ' draft-book-page-gallery' : ''}">
        ${page.heading ? `<h3>${escapeHtml(page.heading)}</h3>` : ''}
        <div class="draft-book-body">${paragraphsToHtml((page.paragraphs || []).join('\n\n'))}</div>
        ${page.extra || ''}
        ${page.callout ? `<div class="draft-book-callout"><p>${escapeHtml(page.callout)}</p></div>` : ''}
        ${page.heroPhoto ? `
          <figure class="draft-book-media-block">
            <img src="${escapeHtml(page.heroPhoto)}" alt="Photo ${escapeHtml(chapterTitle)}" loading="lazy" />
          </figure>
        ` : ''}
        ${page.list ? renderList(page.list) : ''}
        ${page.spotlight ? renderSpotlight(page.spotlight) : ''}
        ${page.gallery ? renderGallery(page.gallery) : ''}
        <div class="draft-book-folio" aria-hidden="true">
          <span class="draft-book-folio-value">${String(pageIndex + 1).padStart(2, '0')}</span>
          <span class="draft-book-folio-dot"></span>
          <span class="draft-book-folio-value">${String(CHAPTER_PAGE_COUNT).padStart(2, '0')}</span>
        </div>
      </section>
    `;
  }).join('');

  return `
    <section class="draft-book-chapter" lang="fr">
      <div class="draft-book-chapter-shell">
        ${htmlPages}
      </div>
    </section>
  `.trim();
}

function renderList(items) {
  return `
    <ol class="draft-book-question-list">
      ${(Array.isArray(items) ? items : []).map((item) => `
        <li><span>${escapeHtml(item)}</span></li>
      `).join('')}
    </ol>
  `;
}

function renderSpotlight(entries) {
  const items = Array.isArray(entries) ? entries.filter((entry) => entry?.excerpt) : [];
  if (items.length === 0) return '';
  return `
    <div class="draft-book-contribution-spotlight">
      <div class="draft-book-mini-title">Voix retenues</div>
      <div class="draft-book-contributor-list">
        ${items.map((entry) => `
          <div class="draft-book-contributor-item">
            <strong>${escapeHtml(entry.name || 'Proche')}</strong>
            <p>${escapeHtml(entry.excerpt || '')}</p>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function renderGallery(images) {
  const list = Array.isArray(images) ? images.filter(Boolean) : [];
  if (list.length === 0) return '';
  const classes = ['draft-book-gallery'];
  if (list.length === 1) classes.push('is-single');
  if (list.length === 2) classes.push('is-duo');
  if (list.length >= 3) classes.push('is-cols-3');

  return `
    <div class="draft-book-gallery-wrap${list.length === 1 ? ' is-single' : ''}">
      <div class="draft-book-mini-title">Galerie du chapitre</div>
      <div class="${classes.join(' ')}">
        ${list.map((url, index) => `
          <figure class="draft-book-photo">
            <img src="${escapeHtml(url)}" alt="Photo ${index + 1}" loading="lazy" />
          </figure>
        `).join('')}
      </div>
    </div>
  `;
}

function mergeCoverConfig(existing, patch) {
  const base = isPlainObject(existing) ? existing : {};
  const merged = { ...base, ...patch };
  if (!merged.previewLayoutSettings || !isPlainObject(merged.previewLayoutSettings)) {
    merged.previewLayoutSettings = {
      textDensity: 'balanced',
      imageDensity: 'balanced'
    };
  }
  return merged;
}

function mergeBackConfig(existing, patch) {
  const base = isPlainObject(existing) ? existing : {};
  return { ...base, ...patch };
}

function isRegularContribution(email) {
  const normalized = String(email || '').toLowerCase();
  return normalized
    && normalized !== CHAPTER_STATE_EMAIL
    && normalized !== CHAPTER_DRAFT_EMAIL;
}

function parseJson(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (_error) {
    return null;
  }
}

function firstSentence(text) {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  const match = normalized.match(/^(.{48,240}?[.!?])(\s|$)/);
  if (match?.[1]) return match[1].trim();
  return normalized.slice(0, 220).trim();
}

function deriveNameFromEmail(email) {
  const localPart = String(email || '').split('@')[0] || 'organisateur';
  return localPart
    .replace(/[._-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function parseArgs(argv) {
  return argv.reduce((acc, token) => {
    const normalized = String(token || '').trim();
    if (!normalized.startsWith('--')) return acc;
    const [key, ...parts] = normalized.slice(2).split('=');
    acc[key] = parts.length > 0 ? parts.join('=') : true;
    return acc;
  }, {});
}

function cleanArg(value) {
  if (value === null || value === undefined || value === true) return '';
  return String(value).trim();
}

function paragraphsToHtml(text) {
  return String(text || '')
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
    .join('');
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}
