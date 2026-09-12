import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  getOrderStatusConfig,
  includesPrint,
  includesPdf,
  formatPriceCents
} from '../../utils/orderWorkflow';
import { createStripeCheckoutSession, deleteOrder, listOrders, updateOrderStatus } from '../../services/ordersApi';
import '../../styles/luxe-theme.css';
import './OrdersLuxe.css';

const nextPrintStatus = (status) => {
  if (status === 'print_queued') return 'sent_to_printer';
  if (status === 'sent_to_printer') return 'printed';
  if (status === 'printed') return 'shipped';
  if (status === 'shipped') return 'delivered';
  return null;
};

const nextPrintLabel = (status) => {
  if (status === 'print_queued') return 'Marquer envoye imprimeur';
  if (status === 'sent_to_printer') return 'Marquer imprime';
  if (status === 'printed') return 'Marquer expedie';
  if (status === 'shipped') return 'Marquer livre';
  return '';
};

const OrdersLuxe = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState([]);
  const [notice, setNotice] = useState(null);
  const [updatingOrderId, setUpdatingOrderId] = useState('');
  const [startingPaymentOrderId, setStartingPaymentOrderId] = useState('');
  const [deletingOrderId, setDeletingOrderId] = useState('');

  const loadOrders = async () => {
    try {
      const data = await listOrders();
      setOrders(Array.isArray(data) ? data : []);
    } catch (error) {
      setNotice({ type: 'error', message: error.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();
  }, []);

  const advancePrintFlow = async (order) => {
    const nextStatus = nextPrintStatus(order.status);
    if (!nextStatus) return;

    try {
      setUpdatingOrderId(order.id);
      setNotice(null);
      const updated = await updateOrderStatus(order.id, nextStatus);
      setOrders((prev) => prev.map((item) => (item.id === order.id ? updated : item)));
    } catch (error) {
      setNotice({ type: 'error', message: error.message });
    } finally {
      setUpdatingOrderId('');
    }
  };

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
              const canAdvancePrint = includesPrint(order.type) && Boolean(nextPrintStatus(order.status));
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

                    {canAdvancePrint && (
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={updatingOrderId === order.id}
                        onClick={() => advancePrintFlow(order)}
                      >
                        {updatingOrderId === order.id ? 'Mise a jour...' : nextPrintLabel(order.status)}
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
