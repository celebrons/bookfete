// Tests de fumee des routes du mode collectif : activation/parametres,
// gestion des participants (proprietaire), et flux public par token
// individuel (ouverture/contribution/statut/date limite/tracabilite).

const BOOK_ID = 'book-test-8'; // collectif pas encore active
const ACTIVATED_BOOK_ID = 'book-test-9'; // collectif active, date limite future
const CLOSED_BOOK_ID = 'book-test-10'; // collectif active, date limite passee
const OTHER_BOOK_ID = 'book-test-8-other'; // appartient a quelqu'un d'autre

let supabaseMock;

jest.mock('../config/supabase', () => {
  const { createSupabaseMock } = require('./helpers/supabaseMock');
  const mock = createSupabaseMock(
    {
      books: [
        { id: 'book-test-8', owner_id: 'owner-test-1', title: 'Livre collectif pas encore active', collection_mode: 'open' },
        {
          id: 'book-test-9',
          owner_id: 'owner-test-1',
          title: 'Livre collectif actif',
          collection_mode: 'open',
          collective_activated_at: '2026-01-01T00:00:00.000Z',
          collective_event_title: 'Anniversaire de Sophie',
          collective_message: 'Partagez un souvenir.',
          collective_deadline: '2099-01-01',
          collective_reminders_enabled: false,
          collective_reminder_days_before: [7, 2]
        },
        {
          id: 'book-test-10',
          owner_id: 'owner-test-1',
          title: 'Livre collectif termine',
          collection_mode: 'open',
          collective_activated_at: '2025-01-01T00:00:00.000Z',
          collective_event_title: 'Depart en retraite',
          collective_deadline: '2020-01-01'
        },
        { id: 'book-test-8-other', owner_id: 'someone-else', title: "Livre d'un autre", collection_mode: 'open' }
      ],
      book_participants: [
        {
          id: 'participant-invited',
          book_id: 'book-test-9',
          email: 'marie@test.local',
          name: 'Marie Dupont',
          invite_token: 'token-invited',
          status: 'invited',
          invited_at: '2026-01-01T00:00:00.000Z'
        },
        {
          id: 'participant-completed',
          book_id: 'book-test-9',
          email: 'thomas@test.local',
          name: 'Thomas',
          invite_token: 'token-completed',
          status: 'completed',
          invited_at: '2026-01-01T00:00:00.000Z',
          opened_at: '2026-01-02T00:00:00.000Z',
          started_at: '2026-01-02T00:00:00.000Z',
          completed_at: '2026-01-03T00:00:00.000Z'
        },
        {
          id: 'participant-closed',
          book_id: 'book-test-10',
          email: 'paul@test.local',
          invite_token: 'token-closed',
          status: 'invited',
          invited_at: '2025-01-01T00:00:00.000Z'
        }
      ],
      book_content_items: [
        {
          id: 'item-completed-photo',
          book_id: 'book-test-9',
          participant_id: 'participant-completed',
          source: 'contribution',
          kind: 'photo',
          url: 'https://cdn.test/thomas.jpg',
          display_order: 0
        }
      ]
    },
    { userId: 'owner-test-1', userEmail: 'organisateur@test.local' }
  );
  global.__supabaseMock = mock;
  return mock;
});

jest.mock('../services/storageService', () => ({
  uploadFile: jest.fn(async () => ({ success: true, url: 'https://cdn.test/uploaded.jpg', fileName: 'book-test-9/uploaded.jpg' }))
}));

const express = require('express');
const request = require('supertest');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/', require('../routes/collective'));
  return app;
}

describe('routes/collective', () => {
  let app;

  beforeAll(() => {
    app = buildApp();
    supabaseMock = global.__supabaseMock;
  });

  describe('activation et parametres (proprietaire)', () => {
    it('POST .../activate refuse sans date limite (obligatoire, cahier des charges §2)', async () => {
      const response = await request(app)
        .post(`/api/books/${BOOK_ID}/collective/activate`)
        .set('Authorization', 'Bearer valid-token')
        .send({ eventTitle: 'Anniversaire de Sophie', message: 'Un mot' });
      expect(response.status).toBe(400);
    });

    it('POST .../activate avec une date limite active le mode collectif', async () => {
      const response = await request(app)
        .post(`/api/books/${BOOK_ID}/collective/activate`)
        .set('Authorization', 'Bearer valid-token')
        .send({ eventTitle: 'Anniversaire de Sophie', message: 'Un mot pour les invites', deadline: '2099-06-15' });
      expect(response.status).toBe(200);
      expect(response.body.collective_activated_at).toBeTruthy();
      expect(response.body.collective_event_title).toBe('Anniversaire de Sophie');
      expect(response.body.collective_deadline).toBe('2099-06-15');
      // Paliers de relance par defaut (§8) quand aucun n'est fourni.
      expect(response.body.collective_reminder_days_before).toEqual([7, 2]);
    });

    it("refuse la modification des parametres d'un livre appartenant a quelqu'un d'autre", async () => {
      const response = await request(app)
        .put(`/api/books/${OTHER_BOOK_ID}/collective/settings`)
        .set('Authorization', 'Bearer valid-token')
        .send({ deadline: '2099-01-01' });
      expect(response.status).toBe(403);
    });
  });

  describe('GET .../collective — reglages + participants + compteurs', () => {
    it('renvoie les reglages et les participants avec leurs compteurs de contributions', async () => {
      const response = await request(app)
        .get(`/api/books/${ACTIVATED_BOOK_ID}/collective`)
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(200);
      expect(response.body.bookTitle).toBe('Livre collectif actif');
      expect(response.body.settings.eventTitle).toBe('Anniversaire de Sophie');
      expect(response.body.settings.isClosed).toBe(false);
      expect(response.body.participants).toHaveLength(2);

      const thomas = response.body.participants.find((p) => p.id === 'participant-completed');
      expect(thomas.status).toBe('completed');
      expect(thomas.counts).toEqual({ photos: 1, souvenirs: 0 });

      const marie = response.body.participants.find((p) => p.id === 'participant-invited');
      expect(marie.counts).toEqual({ photos: 0, souvenirs: 0 });
    });

    it('un livre a la date limite depassee est marque isClosed:true', async () => {
      const response = await request(app)
        .get(`/api/books/${CLOSED_BOOK_ID}/collective`)
        .set('Authorization', 'Bearer valid-token');
      expect(response.status).toBe(200);
      expect(response.body.settings.isClosed).toBe(true);
    });
  });

  describe('gestion des participants (proprietaire)', () => {
    it('POST .../participants ajoute plusieurs emails en une fois, dedupliques', async () => {
      const response = await request(app)
        .post(`/api/books/${ACTIVATED_BOOK_ID}/collective/participants`)
        .set('Authorization', 'Bearer valid-token')
        .send({ emails: ['Nouvelle@Test.local', 'autre@test.local', 'nouvelle@test.local'] });

      expect(response.status).toBe(201);
      expect(response.body).toHaveLength(2);
      expect(response.body.every((p) => p.book_id === ACTIVATED_BOOK_ID)).toBe(true);
      expect(response.body.every((p) => p.status === 'invited')).toBe(true);
      // Chaque participant recoit son PROPRE token individuel (cahier des
      // charges §4 : "chaque invite recoit un lien individuel"), jamais le
      // meme pour deux personnes.
      expect(response.body[0].invite_token).not.toBe(response.body[1].invite_token);
      expect(response.body.map((p) => p.email).sort()).toEqual(['autre@test.local', 'nouvelle@test.local']);
    });

    it('refuse un ajout sans email', async () => {
      const response = await request(app)
        .post(`/api/books/${ACTIVATED_BOOK_ID}/collective/participants`)
        .set('Authorization', 'Bearer valid-token')
        .send({ emails: [] });
      expect(response.status).toBe(400);
    });

    it('PUT .../participants/:id modifie un email existant', async () => {
      const response = await request(app)
        .put(`/api/books/${ACTIVATED_BOOK_ID}/collective/participants/participant-invited`)
        .set('Authorization', 'Bearer valid-token')
        .send({ email: 'marie.dupont@test.local' });
      expect(response.status).toBe(200);
      expect(response.body.email).toBe('marie.dupont@test.local');
    });

    it('DELETE .../participants/:id supprime reellement un invite', async () => {
      const created = await request(app)
        .post(`/api/books/${ACTIVATED_BOOK_ID}/collective/participants`)
        .set('Authorization', 'Bearer valid-token')
        .send({ emails: ['a-supprimer@test.local'] });
      const participantId = created.body[0].id;

      const deleteResponse = await request(app)
        .delete(`/api/books/${ACTIVATED_BOOK_ID}/collective/participants/${participantId}`)
        .set('Authorization', 'Bearer valid-token');
      expect(deleteResponse.status).toBe(204);

      const list = await request(app)
        .get(`/api/books/${ACTIVATED_BOOK_ID}/collective`)
        .set('Authorization', 'Bearer valid-token');
      expect(list.body.participants.some((p) => p.id === participantId)).toBe(false);
    });

    it("un id de participant qui n'appartient pas au livre cible n'est jamais supprime (filtre par book_id)", async () => {
      const response = await request(app)
        .delete(`/api/books/${ACTIVATED_BOOK_ID}/collective/participants/participant-closed`)
        .set('Authorization', 'Bearer valid-token');
      // 204 (idempotent, comme un DELETE REST classique), mais le
      // participant du livre CLOSED_BOOK_ID doit rester intact.
      expect(response.status).toBe(204);

      const stillThere = await request(app).get('/api/public/collectif/token-closed');
      expect(stillThere.status).toBe(200);
    });

    it('POST .../remind marque la date de derniere relance', async () => {
      const response = await request(app)
        .post(`/api/books/${ACTIVATED_BOOK_ID}/collective/participants/participant-invited/remind`)
        .set('Authorization', 'Bearer valid-token');
      expect(response.status).toBe(200);
      expect(response.body.last_reminder_sent_at).toBeTruthy();
    });
  });

  describe('flux public (par token individuel, sans authentification)', () => {
    it('GET /api/public/collectif/:token renvoie 404 pour un token invalide', async () => {
      const response = await request(app).get('/api/public/collectif/does-not-exist');
      expect(response.status).toBe(404);
    });

    it("GET renvoie le contexte de l'evenement et fait passer un participant 'invited' a 'opened'", async () => {
      const response = await request(app).get('/api/public/collectif/token-invited');
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        bookTitle: 'Livre collectif actif',
        eventTitle: 'Anniversaire de Sophie',
        participantName: 'Marie Dupont',
        status: 'opened',
        isClosed: false
      });

      // Confidentialite (cahier des charges §5) : jamais les contributions
      // des AUTRES participants dans cette reponse.
      expect(response.body).not.toHaveProperty('participants');
      expect(response.body).not.toHaveProperty('contributions');
    });

    it("une seconde ouverture ne fait jamais regresser un statut deja plus avance (jamais 'completed' -> 'opened')", async () => {
      const response = await request(app).get('/api/public/collectif/token-completed');
      expect(response.status).toBe(200);
      expect(response.body.status).toBe('completed');
    });

    it('POST .../text cree la contribution, la relie au VRAI participant (tracabilite) et passe le statut a started', async () => {
      const response = await request(app)
        .post('/api/public/collectif/token-invited/text')
        .send({ text: 'Notre premier voyage ensemble...' });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        book_id: ACTIVATED_BOOK_ID,
        participant_id: 'participant-invited',
        kind: 'texte',
        text: 'Notre premier voyage ensemble...'
      });
      // Le nom vient du PARTICIPANT resolu par le token, jamais d'un champ
      // libre fourni par le client (contrairement au lien de partage
      // anonyme existant).
      expect(response.body.metadata).toEqual({ contributor_name: 'Marie Dupont' });

      const stateResponse = await request(app).get('/api/public/collectif/token-invited');
      expect(stateResponse.body.status).toBe('started');
    });

    it("POST .../photo relie aussi la photo au vrai participant — 'qui a envoye cette photo' reste toujours repondable", async () => {
      const response = await request(app)
        .post('/api/public/collectif/token-invited/photo')
        .attach('photo', Buffer.from('fake-image-bytes'), 'souvenir.jpg');

      expect(response.status).toBe(201);
      expect(response.body.participant_id).toBe('participant-invited');

      // Cote proprietaire : la route de detail par participant retrouve
      // bien cette photo precise.
      const detail = await request(app)
        .get(`/api/books/${ACTIVATED_BOOK_ID}/collective/participants/participant-invited/contributions`)
        .set('Authorization', 'Bearer valid-token');
      expect(detail.status).toBe(200);
      expect(detail.body.some((item) => item.kind === 'photo' && item.participant_id === 'participant-invited')).toBe(true);
    });

    it('POST .../finish marque la contribution comme terminee', async () => {
      const response = await request(app).post('/api/public/collectif/token-invited/finish');
      expect(response.status).toBe(200);
      expect(response.body.status).toBe('completed');
      expect(response.body.completed_at).toBeTruthy();
    });

    it('un lien dont la date limite est depassee bloque toute nouvelle contribution (cahier des charges §2)', async () => {
      const getResponse = await request(app).get('/api/public/collectif/token-closed');
      expect(getResponse.body.isClosed).toBe(true);

      const textResponse = await request(app)
        .post('/api/public/collectif/token-closed/text')
        .send({ text: 'Un souvenir en retard.' });
      expect(textResponse.status).toBe(403);

      const photoResponse = await request(app)
        .post('/api/public/collectif/token-closed/photo')
        .attach('photo', Buffer.from('fake-image-bytes'), 'souvenir.jpg');
      expect(photoResponse.status).toBe(403);
    });
  });
});
