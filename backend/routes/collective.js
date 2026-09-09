// backend/routes/collective.js
//
// Mode collectif : invitations NOMINATIVES (un lien individuel par
// personne, jamais anonyme), suivi de statut par participant
// (invited -> opened -> started -> completed), date limite obligatoire,
// relance manuelle. Voir sql/phase15_collective_mode.sql pour le schema.
//
// Coexiste avec le lien de partage anonyme existant (books.share_token,
// routes/composition.js) sans le remplacer ni en dependre — deux
// mecanismes independants, le createur choisit lequel utiliser. Reutilise
// bookContentService.createContentItem/storageService.uploadFile a
// l'identique (memes fonctions que composition.js), seule l'identite du
// contributeur change : ici elle est resolue SERVEUR via le token
// individuel du participant (jamais fournie par le client), ce qui rend
// "qui a envoye cette photo ?" reellement fiable — contrairement au flux
// anonyme, ou seul un prenom libre non verifie est capture.

const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const supabase = require('../config/supabase');
const authenticate = require('../middleware/auth');
const upload = require('../middleware/upload');
const storageService = require('../services/storageService');
const bookContentService = require('../services/composition/bookContentService');

const PHOTO_BUCKET = 'contribution-photos';

// Meme duplication deliberee que composition.js (requireOwnedBook n'y est
// pas exporte, convention deja etablie dans ce projet pour ces petits
// middlewares par fichier de routes) — select('*') plutot qu'une liste de
// colonnes explicite : une colonne opportuniste absente sur une
// installation ne doit jamais faire echouer TOUTE la requete (meme raison
// documentee dans composition.js:getBook).
async function getBook(bookId) {
  const { data, error } = await supabase
    .from('books')
    .select('*')
    .eq('id', bookId)
    .single();
  if (error || !data) return null;
  return data;
}

async function requireOwnedBook(req, res, next) {
  const book = await getBook(req.params.bookId);
  if (!book) return res.status(404).json({ error: 'Livre introuvable.' });
  if (book.owner_id !== req.user.id) return res.status(403).json({ error: 'Acces refuse.' });
  req.book = book;
  return next();
}

// Resout un PARTICIPANT par son token individuel (public, sans compte) —
// meme esprit que resolveBookByShareToken (composition.js), une etape plus
// loin : ici on identifie la personne, pas seulement le livre.
async function resolveParticipantByToken(req, res, next) {
  const { data: participant, error } = await supabase
    .from('book_participants')
    .select('*')
    .eq('invite_token', req.params.token)
    .maybeSingle();

  if (error || !participant) {
    return res.status(404).json({ error: 'Lien invalide ou expire.' });
  }

  const book = await getBook(participant.book_id);
  if (!book) {
    return res.status(404).json({ error: 'Livre introuvable.' });
  }

  req.participant = participant;
  req.book = book;
  return next();
}

// Comparaison par date seule (pas d'heure) : la date limite reste valide
// jusqu'a la fin de sa propre journee, pas depuis minuit.
function isDeadlinePassed(book) {
  if (!book.collective_deadline) return false;
  const deadline = new Date(`${book.collective_deadline}T23:59:59`);
  return Date.now() > deadline.getTime();
}

function cleanEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function parseCollectiveSettingsPayload(body) {
  const eventTitle = typeof body?.eventTitle === 'string' ? body.eventTitle.trim() : '';
  const message = typeof body?.message === 'string' ? body.message.trim() : '';
  const deadline = typeof body?.deadline === 'string' ? body.deadline.trim() : '';
  const remindersEnabled = Boolean(body?.remindersEnabled);
  // §8 du cahier des charges : 7 et 2 jours avant par defaut, mais jamais
  // envoye automatiquement sans que remindersEnabled soit explicitement
  // active par le createur (voir la route /finish et le frontend — aucun
  // scheduler n'existe dans ce backend aujourd'hui, ce reglage est stocke/
  // affiche pour l'instant, pas encore declenche tout seul).
  const reminderDaysBefore = Array.isArray(body?.reminderDaysBefore) && body.reminderDaysBefore.length > 0
    ? body.reminderDaysBefore.map((value) => Number.parseInt(value, 10)).filter((value) => Number.isFinite(value) && value > 0)
    : [7, 2];
  return { eventTitle, message, deadline, remindersEnabled, reminderDaysBefore };
}

async function updateCollectiveSettings(req, res, { markActivated }) {
  try {
    const { eventTitle, message, deadline, remindersEnabled, reminderDaysBefore } = parseCollectiveSettingsPayload(req.body);
    if (!deadline) {
      return res.status(400).json({ error: 'La date limite de participation est obligatoire.' });
    }

    const update = {
      collective_event_title: eventTitle || null,
      collective_message: message || null,
      collective_deadline: deadline,
      collective_reminders_enabled: remindersEnabled,
      collective_reminder_days_before: reminderDaysBefore
    };
    if (markActivated) update.collective_activated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('books')
      .update(update)
      .eq('id', req.params.bookId)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

async function nextDisplayOrder(bookId) {
  const { count } = await supabase
    .from('book_content_items')
    .select('id', { count: 'exact', head: true })
    .eq('book_id', bookId);
  return count || 0;
}

// Jamais regressif : un participant deja 'started'/'completed' qui rouvre
// son lien ou envoie un souvenir supplementaire ne redescend jamais a un
// statut anterieur. Renvoie le statut EFFECTIF resultant (nouveau ou
// inchange) — les appelants doivent l'utiliser plutot que de continuer a
// lire l'ancien req.participant.status en memoire, jamais reassigne ici.
async function markStatusIfEarlier(participantId, currentStatus, nextStatus, timestampField) {
  const order = ['invited', 'opened', 'started', 'completed'];
  if (order.indexOf(currentStatus) >= order.indexOf(nextStatus)) return currentStatus;
  await supabase
    .from('book_participants')
    .update({ status: nextStatus, [timestampField]: new Date().toISOString() })
    .eq('id', participantId);
  return nextStatus;
}

// ============================================================
// Gestion (proprietaire, authentifie)
// ============================================================

// POST /api/books/:bookId/collective/activate — premiere configuration.
router.post('/api/books/:bookId/collective/activate', authenticate, requireOwnedBook, (req, res) => (
  updateCollectiveSettings(req, res, { markActivated: true })
));

// PUT /api/books/:bookId/collective/settings — modification apres coup (onglet Parametres).
router.put('/api/books/:bookId/collective/settings', authenticate, requireOwnedBook, (req, res) => (
  updateCollectiveSettings(req, res, { markActivated: false })
));

// GET /api/books/:bookId/collective — reglages + participants + compteurs
// de contributions par participant, en un seul appel (bandeau du haut +
// onglet Invites de BookCollectiveLuxe.js).
router.get('/api/books/:bookId/collective', authenticate, requireOwnedBook, async (req, res) => {
  try {
    const [{ data: participants, error: participantsError }, { data: items, error: itemsError }] = await Promise.all([
      supabase
        .from('book_participants')
        .select('*')
        .eq('book_id', req.params.bookId)
        .order('invited_at', { ascending: true }),
      supabase
        .from('book_content_items')
        .select('participant_id, kind')
        .eq('book_id', req.params.bookId)
        .not('participant_id', 'is', null)
    ]);
    if (participantsError) throw participantsError;
    if (itemsError) throw itemsError;

    // Compteurs par participant (photos/textes) calcules ici plutot qu'en
    // SQL (pas de fonction d'agregat groupee simple avec le client
    // Supabase sans une vue dediee) — volume par livre toujours modeste
    // (dizaines de participants/items), un passage en memoire suffit.
    const countsByParticipant = {};
    (items || []).forEach((item) => {
      const bucket = countsByParticipant[item.participant_id] || { photos: 0, souvenirs: 0 };
      if (item.kind === 'photo') bucket.photos += 1;
      else if (item.kind === 'texte') bucket.souvenirs += 1;
      countsByParticipant[item.participant_id] = bucket;
    });

    const participantsWithCounts = (participants || []).map((participant) => ({
      ...participant,
      counts: countsByParticipant[participant.id] || { photos: 0, souvenirs: 0 }
    }));

    res.json({
      bookTitle: req.book.title,
      settings: {
        activatedAt: req.book.collective_activated_at,
        eventTitle: req.book.collective_event_title,
        message: req.book.collective_message,
        deadline: req.book.collective_deadline,
        remindersEnabled: req.book.collective_reminders_enabled,
        reminderDaysBefore: req.book.collective_reminder_days_before,
        isClosed: isDeadlinePassed(req.book)
      },
      participants: participantsWithCounts
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/books/:bookId/collective/participants — {emails:[...]},
// ajout groupe (cahier des charges §3 : "ajouter plusieurs emails").
router.post('/api/books/:bookId/collective/participants', authenticate, requireOwnedBook, async (req, res) => {
  try {
    const rawEmails = Array.isArray(req.body?.emails) ? req.body.emails : [];
    const emails = [...new Set(rawEmails.map(cleanEmail).filter(Boolean))];
    if (emails.length === 0) {
      return res.status(400).json({ error: 'Au moins une adresse email est requise.' });
    }

    const rows = emails.map((email) => ({
      book_id: req.params.bookId,
      email,
      invite_token: crypto.randomUUID(),
      // Explicite plutot que de compter sur le defaut SQL de la colonne
      // (meme convention que le reste de ce fichier/composition.js : jamais
      // de valeur implicite silencieuse cote base).
      status: 'invited'
    }));

    const { data, error } = await supabase
      .from('book_participants')
      .insert(rows)
      .select();

    if (error) throw error;
    res.status(201).json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/books/:bookId/collective/participants/:participantId
router.put('/api/books/:bookId/collective/participants/:participantId', authenticate, requireOwnedBook, async (req, res) => {
  try {
    const update = {};
    if (typeof req.body?.email === 'string') {
      const email = cleanEmail(req.body.email);
      if (!email) return res.status(400).json({ error: 'Email invalide.' });
      update.email = email;
    }
    if (typeof req.body?.name === 'string') update.name = req.body.name.trim() || null;
    if (Object.keys(update).length === 0) {
      return res.status(400).json({ error: 'Rien a mettre a jour.' });
    }

    const { data, error } = await supabase
      .from('book_participants')
      .update(update)
      .eq('id', req.params.participantId)
      .eq('book_id', req.params.bookId)
      .select()
      .maybeSingle();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Participant introuvable.' });
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/books/:bookId/collective/participants/:participantId
router.delete('/api/books/:bookId/collective/participants/:participantId', authenticate, requireOwnedBook, async (req, res) => {
  try {
    const { error } = await supabase
      .from('book_participants')
      .delete()
      .eq('id', req.params.participantId)
      .eq('book_id', req.params.bookId);
    if (error) throw error;
    res.status(204).end();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST .../participants/:id/remind — marque la relance ; l'envoi email reel
// n'est pas branche pour l'instant (pas de SMTP configure, voir le plan) :
// le frontend affiche/recopie le lien individuel pour un envoi manuel par
// le createur. Brancher sendInviteEmail (services/emailService.js) ici sera
// le seul changement necessaire une fois SMTP configure.
router.post('/api/books/:bookId/collective/participants/:participantId/remind', authenticate, requireOwnedBook, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('book_participants')
      .update({ last_reminder_sent_at: new Date().toISOString() })
      .eq('id', req.params.participantId)
      .eq('book_id', req.params.bookId)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Participant introuvable.' });
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET .../participants/:id/contributions — detail complet d'un participant
// (cahier des charges §6 : "cliquer sur un participant pour voir l'ensemble
// de ses contributions").
router.get('/api/books/:bookId/collective/participants/:participantId/contributions', authenticate, requireOwnedBook, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('book_content_items')
      .select('*')
      .eq('book_id', req.params.bookId)
      .eq('participant_id', req.params.participantId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// Participant (public, par token individuel, sans compte)
// ============================================================

// GET /api/public/collectif/:token — accueil du participant (titre/
// message/date limite) + marque la premiere ouverture. Ne renvoie jamais
// les contributions des AUTRES participants (cahier des charges §5,
// confidentialite) : seules les donnees de l'evenement + l'identite propre
// du participant resolu par SON token sont exposees ici.
router.get('/api/public/collectif/:token', resolveParticipantByToken, async (req, res) => {
  try {
    const status = await markStatusIfEarlier(req.participant.id, req.participant.status, 'opened', 'opened_at');

    res.json({
      bookTitle: req.book.title,
      eventTitle: req.book.collective_event_title,
      message: req.book.collective_message,
      deadline: req.book.collective_deadline,
      participantName: req.participant.name,
      status,
      isClosed: isDeadlinePassed(req.book)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/public/collectif/:token/text
router.post('/api/public/collectif/:token/text', resolveParticipantByToken, async (req, res) => {
  try {
    if (isDeadlinePassed(req.book)) {
      return res.status(403).json({ error: 'La collecte de souvenirs est terminee.' });
    }
    const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
    if (!text) {
      return res.status(400).json({ error: 'Texte manquant.' });
    }

    const displayOrder = await nextDisplayOrder(req.book.id);
    const data = await bookContentService.createContentItem(req.book.id, {
      source: 'contribution',
      kind: 'texte',
      text,
      participant_id: req.participant.id,
      display_order: displayOrder,
      metadata: req.participant.name ? { contributor_name: req.participant.name } : {}
    });
    await markStatusIfEarlier(req.participant.id, req.participant.status, 'started', 'started_at');
    res.status(201).json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/public/collectif/:token/photo — memes middlewares (upload.js/
// storageService.js) que les routes de contribution equivalentes,
// miniature/version intermediaire generees pareil, jamais de deuxieme
// implementation.
router.post(
  '/api/public/collectif/:token/photo',
  resolveParticipantByToken,
  upload.single('photo'),
  async (req, res) => {
    try {
      if (isDeadlinePassed(req.book)) {
        return res.status(403).json({ error: 'La collecte de souvenirs est terminee.' });
      }
      if (!req.file) {
        return res.status(400).json({ error: 'Fichier manquant (champ "photo").' });
      }

      const uploadResult = await storageService.uploadFile(PHOTO_BUCKET, req.file, req.book.id);
      if (!uploadResult.success) {
        return res.status(500).json({ error: uploadResult.error || "Echec de l'upload." });
      }

      const metadata = req.participant.name ? { contributor_name: req.participant.name } : {};
      if (uploadResult.orientation) metadata.orientation = uploadResult.orientation;
      if (uploadResult.ratio) metadata.ratio = uploadResult.ratio;
      if (uploadResult.width) metadata.width = uploadResult.width;
      if (uploadResult.height) metadata.height = uploadResult.height;
      if (uploadResult.thumbnailUrl) metadata.thumbnailUrl = uploadResult.thumbnailUrl;
      if (uploadResult.previewUrl) metadata.previewUrl = uploadResult.previewUrl;

      const displayOrder = await nextDisplayOrder(req.book.id);
      const data = await bookContentService.createContentItem(req.book.id, {
        source: 'contribution',
        kind: 'photo',
        url: uploadResult.url,
        participant_id: req.participant.id,
        display_order: displayOrder,
        metadata
      });
      await markStatusIfEarlier(req.participant.id, req.participant.status, 'started', 'started_at');
      res.status(201).json(data);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// POST /api/public/collectif/:token/finish — action explicite "J'ai
// terminé" (distincte de l'envoi immediat de chaque souvenir) : c'est ce
// qui rend "commencee" et "envoyee" reellement differenciables (cahier des
// charges §3).
router.post('/api/public/collectif/:token/finish', resolveParticipantByToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('book_participants')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', req.participant.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
