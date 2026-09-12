// backend/routes/admin.js
//
// Espace d'administration (2026-09-12) : voir tous les livres, leur statut,
// qui les a faits, et les consulter.
//
// LECTURE SEULE, volontairement, pour cette premiere version. Un
// administrateur peut tout VOIR, rien modifier ni supprimer : les gestes
// destructifs sur le livre de quelqu'un d'autre demandent une reflexion
// separee (traçabilité, confirmation, recours) qu'on ne bâcle pas en même
// temps que l'affichage.
//
// Toutes les routes passent par `authenticate` PUIS `requireAdmin` — voir
// middleware/requireAdmin.js pour la designation des administrateurs.

const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const authenticate = require('../middleware/auth');
const requireAdmin = require('../middleware/requireAdmin');
const bookContentService = require('../services/composition/bookContentService');
const templateCatalog = require('../services/composition/templateCatalog');
const pageRenderer = require('../services/composition/pageRenderer');
const { resolveCoverFormat, COVER_FORMATS, DEFAULT_COVER_FORMAT_ID } = require('../services/composition/coverFormat');
const { resolveFormatDensity } = require('../services/composition/formatDensity');

// Statut de fabrication du livre. Repris a l'identique de routes/orders.js
// (getBookLifecycleStatusFromBook) : le meme livre doit afficher le meme
// statut partout, une seconde interpretation divergerait tot ou tard.
const LIFECYCLE_LABELS = {
  editing: 'En cours de création',
  preview_available: 'Aperçu disponible',
  finalized: 'Finalisé',
  sent_to_printer: "Envoyé à l'imprimeur",
  printed: 'Imprimé',
  shipped: 'Expédié'
};

const resolveLifecycle = (book) => {
  const coverConfig = book?.cover_config && typeof book.cover_config === 'object' ? book.cover_config : {};
  const explicit = coverConfig.lifecycleStatus || book?.lifecycle_status || book?.production_status;
  if (explicit && LIFECYCLE_LABELS[explicit]) return explicit;
  if (coverConfig.finalPdfReadyAt) return 'finalized';
  if (coverConfig.previewAvailableAt) return 'preview_available';
  if (String(book?.statut || '').toLowerCase() === 'termine') return 'finalized';
  return 'editing';
};

const resolveRenderFormat = (formatId) => {
  const normalized = Object.prototype.hasOwnProperty.call(COVER_FORMATS, formatId) ? formatId : DEFAULT_COVER_FORMAT_ID;
  return { formatId: normalized, ...resolveCoverFormat(formatId), ...resolveFormatDensity(formatId) };
};

// GET /api/admin/me
// Permet a l'interface de n'afficher le lien "Administration" qu'aux
// administrateurs. Ce n'est PAS une protection — chaque route de donnees est
// gardee independamment par requireAdmin ; ici on repond simplement oui/non
// a un utilisateur authentifie, sans jamais reveler QUI est administrateur.
router.get('/me', authenticate, (req, res) => {
  res.json({ isAdmin: requireAdmin.isAdminUser(req.user) });
});

// GET /api/admin/books
// Liste TOUS les livres, avec leur auteur et de quoi juger d'un coup d'oeil.
//
// Les comptages (photos, souvenirs, pages, commandes) sont faits en 4
// requetes globales puis agreges en memoire, jamais en une requete par
// livre : a quelques centaines de livres la difference est deja franche, et
// ca evite le classique N+1 qui rend l'ecran inutilisable des que le projet
// marche.
router.get('/books', authenticate, requireAdmin, async (req, res) => {
  try {
    const search = String(req.query.search || '').trim().toLowerCase();

    const { data: books, error } = await supabase
      .from('books')
      .select('*')
      .order('updated_at', { ascending: false });
    if (error) throw error;

    const bookIds = (books || []).map((book) => book.id);
    const ownerIds = [...new Set((books || []).map((book) => book.owner_id).filter(Boolean))];

    const [{ data: items }, { data: pages }, { data: orders }, { data: profiles }] = await Promise.all([
      supabase.from('book_content_items').select('book_id, kind').in('book_id', bookIds.length ? bookIds : ['-']),
      supabase.from('book_pages').select('book_id').in('book_id', bookIds.length ? bookIds : ['-']),
      supabase.from('orders').select('book_id, status, type, total_cents').in('book_id', bookIds.length ? bookIds : ['-']),
      supabase.from('profiles').select('id, email, full_name').in('id', ownerIds.length ? ownerIds : ['-'])
    ]);

    const countBy = (rows, key, predicate = () => true) => (rows || []).reduce((acc, row) => {
      if (!predicate(row)) return acc;
      acc[row[key]] = (acc[row[key]] || 0) + 1;
      return acc;
    }, {});

    const photosByBook = countBy(items, 'book_id', (row) => row.kind === 'photo');
    const textsByBook = countBy(items, 'book_id', (row) => row.kind === 'texte');
    const pagesByBook = countBy(pages, 'book_id');
    const ordersByBook = (orders || []).reduce((acc, row) => {
      (acc[row.book_id] = acc[row.book_id] || []).push(row);
      return acc;
    }, {});
    const profileById = Object.fromEntries((profiles || []).map((row) => [row.id, row]));

    const rows = (books || []).map((book) => {
      const profile = profileById[book.owner_id] || null;
      // `owner_email`/`owner_name` sont des colonnes heritees, souvent
      // vides : le profil reste la source la plus fiable, l'ancienne colonne
      // ne sert que de repli.
      const ownerEmail = profile?.email || book.owner_email || null;
      const bookOrders = ordersByBook[book.id] || [];
      const lifecycle = resolveLifecycle(book);

      return {
        id: book.id,
        title: book.title || null,
        createdAt: book.created_at,
        updatedAt: book.updated_at,
        lifecycle,
        lifecycleLabel: LIFECYCLE_LABELS[lifecycle] || lifecycle,
        printFormat: book.print_format || null,
        pageCount: book.page_count || null,
        collectionMode: book.collection_mode || 'solo',
        owner: {
          id: book.owner_id || null,
          email: ownerEmail,
          name: profile?.full_name || book.owner_name || null,
          // Un compte ANONYME n'a pas d'email — c'est meme sa definition.
          // On ne peut pas se fier a l'absence de PROFIL : depuis la
          // migration phase16, le declencheur cree bien une ligne pour ces
          // comptes, simplement avec un email vide. L'absence d'email est
          // donc le seul signal fiable, et le distinguer explicitement evite
          // de lire "sans compte" comme "donnee manquante".
          anonymous: Boolean(book.owner_id) && !ownerEmail
        },
        counts: {
          photos: photosByBook[book.id] || 0,
          texts: textsByBook[book.id] || 0,
          pages: pagesByBook[book.id] || 0,
          orders: bookOrders.length
        },
        orders: bookOrders.map((order) => ({
          status: order.status,
          type: order.type,
          totalCents: order.total_cents
        }))
      };
    });

    const filtered = search
      ? rows.filter((row) => [row.title, row.owner.email, row.owner.name, row.id]
        .some((value) => String(value || '').toLowerCase().includes(search)))
      : rows;

    res.json({
      total: rows.length,
      shown: filtered.length,
      books: filtered
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/admin/books/:bookId/preview.html
// Consulter un livre : le document complet, rendu par le MEME moteur que
// l'aperçu client et le PDF (pageRenderer) — jamais une seconde
// representation qui pourrait diverger de ce que l'utilisateur voit.
router.get('/books/:bookId/preview.html', authenticate, requireAdmin, async (req, res) => {
  try {
    const { data: book, error } = await supabase
      .from('books')
      .select('*')
      .eq('id', req.params.bookId)
      .single();
    if (error || !book) return res.status(404).json({ error: 'Livre introuvable.' });

    const [pages, items, layouts] = await Promise.all([
      bookContentService.listPages(book.id),
      bookContentService.listContentItems(book.id),
      templateCatalog.listActiveLayouts()
    ]);

    const html = pageRenderer.renderBookHtml({
      book,
      pages,
      items,
      layouts,
      format: resolveRenderFormat(book.print_format)
    });

    res.set('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
