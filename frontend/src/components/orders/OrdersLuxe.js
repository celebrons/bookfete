import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  getOrderStatusConfig,
  includesPrint,
  includesPdf,
  formatPriceCents
} from '../../utils/orderWorkflow';
import { createStripeCheckoutSession, deleteOrder, getOrderTracking, listOrders } from '../../services/ordersApi';
import '../../styles/luxe-theme.css';
import './OrdersLuxe.css';

// L'avance MANUELLE du statut d'impression a ete retiree le 2026-09-18.
//
// Elle datait d'avant le suivi reel : a l'epoque, rien ne faisait bouger
// print_queued -> sent_to_printer -> printed -> shipped tout seul, et ces
// boutons servaient a simuler la progression.
//
// Depuis, l'etat vient de l'imprimeur (GET /orders/:id/tracking). Garder une
// avance manuelle devenait nuisible : le suivi ne fait JAMAIS reculer un
// statut, donc declarer un livre « expedie » avant Gelato rendait l'erreur
// irrattrapable — le vrai statut, plus bas dans la sequence, etait ensuite
// ignore pour toujours.
//
// La route serveur POST /:orderId/status existe toujours : elle sert au
// parcours de paiement et aux tests. Seul ce raccourci d'interface part.

// Etats ou plus rien ne bougera : inutile de redemander a l'imprimeur.
const ETATS_TERMINAUX = ['delivered', 'cancelled', 'failed'];

const OrdersLuxe = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState([]);
  const [notice, setNotice] = useState(null);
  const [startingPaymentOrderId, setStartingPaymentOrderId] = useState('');
  const [deletingOrderId, setDeletingOrderId] = useState('');

  const loadOrders = async () => {
    try {
      const data = await listOrders();
      const liste = Array.isArray(data) ? data : [];
      setOrders(liste);
      rafraichirDepuisImprimeur(liste);
    } catch (error) {
      setNotice({ type: 'error', message: error.message });
    } finally {
      setLoading(false);
    }
  };

  // Cet ecran lisait UNIQUEMENT notre base : le statut affiche pouvait dater
  // du dernier passage sur l'ecran de suivi, parfois de plusieurs jours.
  // On demande donc son etat reel a l'imprimeur, mais seulement pour les
  // commandes qui peuvent encore bouger : une commande PDF n'a rien a
  // imprimer, une commande livree ou annulee n'evoluera plus.
  //
  // En arriere-plan et sans bloquer l'affichage : la liste apparait tout de
  // suite avec ce qu'on sait, et se corrige quand l'imprimeur repond. Un
  // appel par commande concernee — acceptable a ce volume ; le jour ou la
  // liste s'allongera, il faudra une route qui les traite en une fois.
  const rafraichirDepuisImprimeur = (liste) => {
    liste
      .filter((order) => includesPrint(order.type))
      .filter((order) => !ETATS_TERMINAUX.includes(String(order.status || '').toLowerCase()))
      .forEach(async (order) => {
        try {
          const suivi = await getOrderTracking(order.id);
          if (!suivi?.status || suivi.status === order.status) return;
          setOrders((prev) => prev.map((item) => (
            item.id === order.id ? { ...item, status: suivi.status } : item
          )));
        } catch (_error) {
          // Jamais bloquant : on garde le dernier etat connu, comme l'ecran
          // de suivi.
        }
      });
  };

  useEffect(() => {
    loadOrders();
  }, []);


  // Suppression d'une commande (essais de formats/types/paiement). Le serveur
  // est seul juge de ce qui est supprimable : on se contente de confirmer
  // l'intention et de relayer son refus le cas echeant.
  const removeOrder = async (order) => {
    if (!order?.id || deletingOrderId) return;
    // eslint-disable-next-line no-restricted-globals
    if (!window.confirm(`Supprimer definitivement la commande ${order.order_number || ''} ?`)) return;

    try {
      setDeletingOrderId(order.id);
      setNotice(null);
      await deleteOrder(order.id);
      setOrders((prev) => prev.filter((item) => item.id !== order.id));
      setNotice({ type: 'success', message: 'Commande supprimee.' });
    } catch (error) {
      setNotice({ type: 'error', message: error.message });
    } finally {
      setDeletingOrderId('');
    }
  };

  const startStripePayment = async (order) => {
    if (!order?.id) return;
    try {
      setStartingPaymentOrderId(order.id);
      setNotice(null);
      const checkoutSession = await createStripeCheckoutSession(order.id);
      if (!checkoutSession?.checkoutUrl) {
        throw new Error('Impossible d ouvrir Stripe Checkout');
      }
      window.location.assign(checkoutSession.checkoutUrl);
    } catch (error) {
      setNotice({ type: 'error', message: error.message });
      setStartingPaymentOrderId('');
    }
  };

  if (loading) {
    return (
      <div className="orders-page">
        <div className="container-luxe orders-shell">
          <p>Chargement des commandes...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="orders-page">
      <div className="container-luxe orders-shell">
        <header className="orders-hero card-luxe">
          <div className="label-gold">Compte client</div>
          <h1>Mes commandes</h1>
          <p>Suivez vos commandes PDF et imprimees en temps reel.</p>
          <div className="orders-hero-links">
            <Link to="/account" className="btn btn-outline">Retour espace client</Link>
          </div>
        </header>

        {notice?.message && (
          <div className={`orders-notice is-${notice.type || 'info'}`}>
            {notice.message}
          </div>
        )}

        {orders.length === 0 ? (
          <div className="orders-panel">
            <p className="orders-empty">Aucune commande pour le moment.</p>
          </div>
        ) : (
          <div className="orders-list orders-list-full">
            {orders.map((order) => {
              const statusConfig = getOrderStatusConfig(order.status);
              const bookId = order.book_id;
              return (
                <article key={order.id} className="orders-list-card">
                  <div className="orders-list-head">
                    <div>
                      <h3>{order.book_title || 'Livre sans titre'}</h3>
                      <p>{order.order_number}</p>
                    </div>
                    <span className={`orders-status-chip ${statusConfig.tone}`}>{statusConfig.label}</span>
                  </div>

                  <div className="orders-meta-grid">
                    <div>
                      <span>Type</span>
                      <strong>{order.type === 'pdf' ? 'PDF' : order.type === 'print' ? 'Imprime' : 'Pack'}</strong>
                    </div>
                    <div>
                      <span>Total</span>
                      <strong>{formatPriceCents(order.total_cents, order.currency || 'EUR')}</strong>
                    </div>
                    <div>
                      <span>Date</span>
                      <strong>{new Date(order.created_at).toLocaleString('fr-FR')}</strong>
                    </div>
                  </div>

                  <div className="orders-card-actions">
                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={() => navigate(`/book/${bookId}`)}
                    >
                      Retour au livre
                    </button>

                    {order.status === 'awaiting_payment' && (
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={startingPaymentOrderId === order.id}
                        onClick={() => startStripePayment(order)}
                      >
                        {startingPaymentOrderId === order.id ? 'Redirection...' : 'Payer'}
                      </button>
                    )}

                    {order.status === 'paid' && includesPdf(order.type) && (
                      <button
                        type="button"
                        className="btn btn-outline"
                        onClick={() => navigate(`/book/${bookId}/checkout`)}
                      >
                        Finaliser PDF
                      </button>
                    )}

                    {order.status === 'pdf_generating' && includesPdf(order.type) && (
                      <button
                        type="button"
                        className="btn btn-outline"
                        onClick={() => navigate(`/book/${bookId}/checkout`)}
                      >
                        Suivre generation PDF
                      </button>
                    )}

                    {includesPdf(order.type) && (order.status === 'pdf_ready' || order?.metadata?.pdfReady) && (
                      <button
                        type="button"
                        className="btn btn-outline"
                        onClick={() => navigate(`/book/${bookId}/checkout`)}
                      >
                        Recuperer PDF
                      </button>
                    )}

                    {/* Le detail du suivi (frise de production, numero de
                        colis) vit dans l'ecran de suivi du parcours de
                        commande : on y renvoie plutot que de le dupliquer. */}
                    {includesPrint(order.type) && bookId && (
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => navigate(`/book/${bookId}/checkout`)}
                      >
                        Voir le suivi
                      </button>
                    )}

                    {/* Nettoyage des essais : le serveur refuse de lui-meme
                        une commande partie en production ou reellement
                        payee, on affiche alors son message. */}
                    <button
                      type="button"
                      className="btn btn-outline is-danger"
                      disabled={deletingOrderId === order.id}
                      onClick={() => removeOrder(order)}
                    >
                      {deletingOrderId === order.id ? 'Suppression...' : 'Supprimer'}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default OrdersLuxe;
