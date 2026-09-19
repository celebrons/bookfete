import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { checkIsAdmin, fetchBookPreviewHtml, listAllBooks, poserCodeAdmin } from '../../services/adminApi';
import '../../styles/luxe-theme.css';
import AdminHealth from './AdminHealth';
import AdminEvents from './AdminEvents';
import './AdminBooksLuxe.css';

// Espace d'administration : tous les livres, leur statut, qui les a faits, et
// de quoi les consulter.
//
// LECTURE SEULE, volontairement (voir backend/routes/admin.js) : on peut tout
// voir, rien modifier. Agir sur le livre de quelqu'un d'autre demande une
// reflexion a part (traçabilite, confirmation, recours) qu'on ne bacle pas en
// meme temps que l'affichage.
//
// Le filtrage de recherche se fait cote serveur (l'ecran doit rester
// utilisable a des milliers de livres), avec un anti-rebond pour ne pas
// declencher une requete par frappe.

const LIFECYCLE_TONE = {
  editing: 'is-draft',
  preview_available: 'is-draft',
  finalized: 'is-ready',
  sent_to_printer: 'is-progress',
  printed: 'is-progress',
  shipped: 'is-done'
};

const FORMAT_LABELS = { livret: 'Livret', standard: 'Standard', luxe: 'Luxe' };

const formatDate = (value) => (value
  ? new Date(value).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
  : '—');

const formatEuro = (cents) => (cents == null ? '—' : `${(cents / 100).toFixed(2)} €`);

function OwnerCell({ owner }) {
  if (owner.anonymous) {
    return (
      <span className="admin-owner">
        <span className="admin-owner-name">Sans compte</span>
        <span className="admin-owner-note">livre commencé sans inscription</span>
      </span>
    );
  }
  return (
    <span className="admin-owner">
      <span className="admin-owner-name">{owner.name || '—'}</span>
      <span className="admin-owner-mail">{owner.email || 'email inconnu'}</span>
    </span>
  );
}

export default function AdminBooksLuxe() {
  const [allowed, setAllowed] = useState(null); // null = verification en cours
  // Un code partage est-il configure sur ce serveur ? Si oui, on propose
  // un champ plutot que de repondre « Page introuvable » a quelqu un qui a
  // le droit d entrer avec un autre compte (demande du 2026-09-19).
  const [codeAttendu, setCodeAttendu] = useState(false);
  const [code, setCode] = useState('');
  const [codeRefuse, setCodeRefuse] = useState(false);
  const [books, setBooks] = useState([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [previewBook, setPreviewBook] = useState(null);
  const [previewHtml, setPreviewHtml] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);

  const verifierLAcces = useCallback(async () => {
    const { isAdmin, codeAttendu: attendu } = await checkIsAdmin();
    setAllowed(isAdmin);
    setCodeAttendu(attendu);
    return isAdmin;
  }, []);

  useEffect(() => {
    verifierLAcces();
  }, [verifierLAcces]);

  const soumettreLeCode = async (evenement) => {
    evenement.preventDefault();
    setCodeRefuse(false);
    poserCodeAdmin(code.trim());
    const ouvert = await verifierLAcces();
    if (!ouvert) {
      // Code faux : on l efface, sinon toutes les requetes suivantes
      // partiraient avec lui et compteraient dans la limite de debit.
      poserCodeAdmin('');
      setCodeRefuse(true);
    }
  };

  const load = useCallback(async (term) => {
    setLoading(true);
    setError('');
    try {
      const data = await listAllBooks(term);
      setBooks(data.books || []);
      setTotal(data.total || 0);
    } catch (err) {
      setError(err.message || 'Chargement impossible.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Anti-rebond : on ne veut pas une requete par touche frappee.
  useEffect(() => {
    if (allowed !== true) return undefined;
    const timer = setTimeout(() => load(search), search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [allowed, search, load]);

  const openPreview = async (book) => {
    setPreviewBook(book);
    setPreviewHtml('');
    setPreviewLoading(true);
    try {
      setPreviewHtml(await fetchBookPreviewHtml(book.id));
    } catch (err) {
      setError(err.message || "Impossible d'afficher ce livre.");
      setPreviewBook(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  if (allowed === null) {
    return <div className="admin-shell"><p className="admin-state">Vérification des droits…</p></div>;
  }

  // Meme reponse que le serveur : on ne confirme pas l'existence de cet
  // espace a quelqu'un qui n'y a pas droit.
  if (allowed === false) {
    // Sans code configure, la reponse reste la meme qu avant : on ne
    // confirme pas l existence de cet espace a quelqu un qui n y a pas
    // droit.
    if (!codeAttendu) {
      return (
        <div className="admin-shell">
          <p className="admin-state">Page introuvable.</p>
          <Link className="btn btn-outline" to="/dashboard">Retour au tableau de bord</Link>
        </div>
      );
    }

    return (
      <div className="admin-shell">
        <form className="admin-code" onSubmit={soumettreLeCode}>
          <h1 className="admin-title">Administration</h1>
          <p className="admin-code-note">
            Cet espace montre les livres, les contenus et les adresses de tous
            les comptes. Entrez le code de consultation pour continuer.
          </p>
          <input
            className="admin-code-champ"
            type="password"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Code de consultation"
            autoFocus
          />
          {codeRefuse && <p className="admin-code-erreur">Code refusé.</p>}
          <button className="btn btn-primary" type="submit" disabled={!code.trim()}>
            Ouvrir
          </button>
          <Link className="btn btn-outline" to="/dashboard">Retour au tableau de bord</Link>
        </form>
      </div>
    );
  }

  return (
    <div className="admin-shell">
      <header className="admin-header">
        <div>
          <h1 className="admin-title">Administration</h1>
          <p className="admin-subtitle">
            {total} livre{total > 1 ? 's' : ''} au total
            {search && books.length !== total ? ` · ${books.length} affiché${books.length > 1 ? 's' : ''}` : ''}
          </p>
        </div>
        <Link className="btn btn-outline" to="/dashboard">Retour au tableau de bord</Link>
      </header>

      <input
        type="search"
        className="input-luxe admin-search"
        placeholder="Rechercher un titre, un nom, un email…"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />

      {error && <p className="admin-error">{error}</p>}

      {loading ? (
        <p className="admin-state">Chargement…</p>
      ) : books.length === 0 ? (
        <p className="admin-state">Aucun livre ne correspond.</p>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Livre</th>
                <th>Qui</th>
                <th>Statut</th>
                <th>Format</th>
                <th className="is-num">Contenu</th>
                <th className="is-num">Commandes</th>
                <th>Modifié</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {books.map((book) => (
                <tr key={book.id}>
                  <td>
                    <span className="admin-book-title">{book.title || 'Sans titre'}</span>
                    <span className="admin-book-id">{book.id.slice(0, 8)}</span>
                  </td>
                  <td><OwnerCell owner={book.owner} /></td>
                  <td>
                    <span className={`admin-chip ${LIFECYCLE_TONE[book.lifecycle] || 'is-draft'}`}>
                      {book.lifecycleLabel}
                    </span>
                    {book.collectionMode !== 'solo' && (
                      <span className="admin-chip is-mode">Collectif</span>
                    )}
                  </td>
                  <td>{FORMAT_LABELS[book.printFormat] || '—'}</td>
                  <td className="is-num">
                    {book.counts.photos} photo{book.counts.photos > 1 ? 's' : ''}
                    <span className="admin-sep"> · </span>
                    {book.counts.texts} texte{book.counts.texts > 1 ? 's' : ''}
                    <span className="admin-sep"> · </span>
                    {book.counts.pages} page{book.counts.pages > 1 ? 's' : ''}
                  </td>
                  <td className="is-num">
                    {book.counts.orders === 0 ? '—' : (
                      <span title={book.orders.map((o) => `${o.type} · ${o.status} · ${formatEuro(o.totalCents)}`).join('\n')}>
                        {book.counts.orders}
                      </span>
                    )}
                  </td>
                  <td>{formatDate(book.updatedAt)}</td>
                  <td>
                    <button type="button" className="btn btn-outline admin-view-btn" onClick={() => openPreview(book)}>
                      Consulter
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {previewBook && (
        <div className="admin-preview-backdrop" onClick={() => setPreviewBook(null)}>
          <div className="admin-preview-panel" onClick={(event) => event.stopPropagation()}>
            <header className="admin-preview-head">
              <div>
                <strong>{previewBook.title || 'Sans titre'}</strong>
                <span className="admin-preview-owner">
                  {previewBook.owner.anonymous ? 'sans compte' : (previewBook.owner.email || '—')}
                </span>
              </div>
              <button type="button" className="btn btn-outline" onClick={() => setPreviewBook(null)}>Fermer</button>
            </header>
            {previewLoading ? (
              <p className="admin-state">Rendu du livre…</p>
            ) : (
              // srcDoc et non src : le HTML est recupere avec l'en-tete
              // d'authentification, le jeton ne passe jamais par une URL.
              <iframe title="Aperçu du livre" className="admin-preview-frame" srcDoc={previewHtml} />
            )}
          </div>
        </div>
      )}

      {/* Ce que fait la machine en ce moment. */}
      <AdminHealth />

      {/* Le journal des evenements : le deroule de ce qui est arrive aux
          livres et aux commandes, tous serveurs confondus. */}
      <AdminEvents />
    </div>
  );
}
