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
const { listEvents } = require('../services/events/eventLog');
const { etatServeur } = require('../services/events/serverHealth');
const bookContentService = require('../services/composition/bookContentService');
const templateCatalog = require('../services/composition/templateCatalog');
const pageRenderer = require('../services/composition/pageRenderer');
const coverComposer = require('../services/composition/coverComposer');
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
// Journal des EVENEMENTS METIER (voir services/events/eventLog.js).
//
// Repond a « que s est-il passe sur cette commande ? » sans ouvrir de
// terminal, et identiquement quel que soit le serveur qui a agi — chaque
// evenement porte son environnement d origine.
//
// Lecture seule, comme tout cet espace. Filtres facultatifs : orderId,
// bookId, level.
// Etat de sante du serveur : memoire, processeur, disque, rendus en cours,
// derniere sauvegarde. Tout ce qui se lit depuis Node, donc disponible sur
// les trois environnements.
//
// Les journaux systeme ne passent PAS par ici : lire journalctl demande des
// privileges et n existe que sous Linux. Les erreurs applicatives sont dans
// le journal des evenements, juste au-dessus.
router.get('/health', authenticate, requireAdmin, (req, res) => {
  try {
    let rendusEnCours = null;
    try {
      // eslint-disable-next-line global-require
      rendusEnCours = require('./books').countActivePdfJobs();
    } catch (_error) { /* l information manque, ce n est pas une erreur */ }

    return res.json(etatServeur({ rendusEnCours }));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.get('/events', authenticate, requireAdmin, async (req, res) => {
  try {
    const evenements = await listEvents({
      orderId: req.query.orderId,
      bookId: req.query.bookId,
      level: req.query.level,
      limit: req.query.limit
    });
    return res.json({ events: evenements });
  } catch (error) {
    // La table peut ne pas exister si la migration phase21 n a pas ete
    // passee : on le dit plutot que de renvoyer une erreur opaque.
    return res.status(500).json({
      error: error.message,
      indice: "Avez-vous execute sql/phase21_app_events.sql dans Supabase ?"
    });
  }
});

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

    const [interiorPages, items, layouts, template] = await Promise.all([
      bookContentService.listPages(book.id),
      bookContentService.listContentItems(book.id),
      templateCatalog.listActiveLayouts(),
      book.template_id ? templateCatalog.getTemplateById(book.template_id) : Promise.resolve(null)
    ]);

    const format = resolveRenderFormat(book.print_format);
    // Les couvertures ne sont JAMAIS stockees dans book_pages : elles sont
    // recalculees a la volee par coverComposer (voir son en-tete), hors du
    // budget de pages interieures. Rendre uniquement `listPages` donnait donc
    // un livre sans premiere ni quatrieme de couverture (signale le
    // 2026-09-12). On passe par le meme chemin que l'apercu client
    // (routes/composition.js GET /preview.html) — jamais une seconde facon
    // d'assembler un livre, qui finirait par diverger.
    const pages = coverComposer.composeCoversIntoPages({ book, items, template, interiorPages, format });

    const html = pageRenderer.renderBookHtml({ book, pages, items, layouts, format });

    res.set('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
