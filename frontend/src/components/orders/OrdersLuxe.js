import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import {
  getOrderStatusConfig,
  includesPrint,
  includesPdf,
  isPdfReady,
  formatPriceCents
} from '../../utils/orderWorkflow';
import { createStripeCheckoutSession, deleteOrder, getOrderInvoice, getOrderTracking, listOrders } from '../../services/ordersApi';
import '../../styles/luxe-theme.css';
import './OrdersLuxe.css';

// Une seule action PRINCIPALE par commande (retour utilisateur, 2026-09-30,
// piste "Commande & compte" : "une action principale et un menu ··· pour le
// reste") — priorite a ce qui fait le plus avancer la commande. Tout le
// reste (retour au livre, facture, suppression) rejoint le menu "···".
function resolveActionPrincipale(order) {
  if (order.status === 'awaiting_payment') return 'payer';
  if (order.status === 'pdf_generating' && includesPdf(order.type)) return 'suivre_pdf';
  if (isPdfReady(order) && includesPdf(order.type)) return 'recuperer_pdf';
  if (includesPrint(order.type) && order.book_id) return 'suivre_livraison';
  if (order.status === 'paid' && includesPdf(order.type)) return 'finaliser_pdf';
  return 'retour_livre';
}

const TYPE_KEYS = ['pdf', 'print', 'pack'];

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
  const { t, i18n } = useTranslation('checkout');
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState([]);
  const [notice, setNotice] = useState(null);
  const [startingPaymentOrderId, setStartingPaymentOrderId] = useState('');
  const [deletingOrderId, setDeletingOrderId] = useState('');
  const [openMenuOrderId, setOpenMenuOrderId] = useState('');
  const [fetchingInvoiceId, setFetchingInvoiceId] = useState('');

  const loadOrders = async () => {
    try {
      const data = await listOrders();
      const liste = Array.isArray(data) ? data : [];
      setOrders(liste);
      rafraichirDepuisImprimeur(liste);
    } catch (error) {
      setNotice({ type: 'error', message: error.message || t('ordersList.loadFailed') });
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

  // Ferme le menu "···" ouvert des qu'on clique ailleurs sur la page — sans
  // ca, plusieurs menus pourraient rester ouverts en meme temps.
  useEffect(() => {
    if (!openMenuOrderId) return undefined;
    const handleClickOutside = (event) => {
      if (!event.target.closest('.orders-card-menu')) setOpenMenuOrderId('');
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [openMenuOrderId]);


  // Suppression d'une commande (essais de formats/types/paiement). Le serveur
  // est seul juge de ce qui est supprimable : on se contente de confirmer
  // l'intention et de relayer son refus le cas echeant.
  const removeOrder = async (order) => {
    if (!order?.id || deletingOrderId) return;
    // eslint-disable-next-line no-restricted-globals
    if (!window.confirm(t('ordersList.deleteConfirm', { number: order.order_number || '' }))) return;

    try {
      setDeletingOrderId(order.id);
      setNotice(null);
      await deleteOrder(order.id);
      setOrders((prev) => prev.filter((item) => item.id !== order.id));
      setNotice({ type: 'success', message: t('ordersList.deleteSuccess') });
    } catch (error) {
      setNotice({ type: 'error', message: error.message });
    } finally {
      setDeletingOrderId('');
    }
  };

  // Ouverture de la facture depuis le menu "···" — a la demande, pas de
  // sondage systematique comme dans InvoiceDownloadLink.js (evite N appels
  // reseau simultanes sur une liste qui peut compter plusieurs commandes).
  const voirLaFacture = async (order) => {
    if (!order?.id || fetchingInvoiceId) return;
    try {
      setFetchingInvoiceId(order.id);
      setNotice(null);
      const invoice = await getOrderInvoice(order.id);
      if (!invoice?.url) throw new Error(t('ordersList.invoiceUnavailable'));
      window.open(invoice.url, '_blank', 'noopener');
    } catch (error) {
      setNotice({ type: 'error', message: error.message || t('ordersList.invoiceOpenFailed') });
    } finally {
      setFetchingInvoiceId('');
    }
  };

  const startStripePayment = async (order) => {
    if (!order?.id) return;
    try {
      setStartingPaymentOrderId(order.id);
      setNotice(null);
      const checkoutSession = await createStripeCheckoutSession(order.id);
      if (!checkoutSession?.checkoutUrl) {
        throw new Error(t('ordersList.stripeOpenFailed'));
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
          <p>{t('ordersList.loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="orders-page">
      <div className="container-luxe orders-shell">
        <header className="orders-hero">
          <div>
            <h1>{t('ordersList.title')}</h1>
            <p>{t('ordersList.subtitle')}</p>
          </div>
          <div className="orders-hero-links">
            <Link to="/account" className="orders-hero-link">{t('ordersList.backToAccount')}</Link>
          </div>
        </header>

        {notice?.message && (
          <div className={`orders-notice is-${notice.type || 'info'}`}>
            {notice.message}
          </div>
        )}

        {orders.length === 0 ? (
          <div className="orders-panel">
            <p className="orders-empty">{t('ordersList.empty')}</p>
          </div>
        ) : (
          <div className="orders-list orders-list-full">
            {orders.map((order) => {
              const statusConfig = getOrderStatusConfig(order.status);
              const bookId = order.book_id;
              const actionPrincipale = resolveActionPrincipale(order);
              const menuOuvert = openMenuOrderId === order.id;

              return (
                <article key={order.id} className="orders-card">
                  <div className="orders-card-top">
                    <span className={`orders-card-status ${statusConfig.tone}`}>{statusConfig.label}</span>

                    {/* Meme famille que la carte Bibliotheque
                        (BookCardLuxe.js) : une action principale visible,
                        le reste (retour au livre sauf s'il est deja
                        l'action principale, facture, suppression) derriere
                        "···". */}
                    <div className="orders-card-menu">
                      <button
                        type="button"
                        className={`orders-card-menu-btn ${menuOuvert ? 'is-open' : ''}`}
                        onClick={() => setOpenMenuOrderId(menuOuvert ? '' : order.id)}
                        aria-haspopup="true"
                        aria-expanded={menuOuvert}
                        aria-label={t('ordersList.menu.otherActions')}
                      >
                        ···
                      </button>
                      {menuOuvert && (
                        <div className="orders-card-menu-panel">
                          {actionPrincipale !== 'retour_livre' && (
                            <button type="button" onClick={() => { setOpenMenuOrderId(''); navigate(`/book/${bookId}`); }}>
                              {t('ordersList.menu.backToBook')}
                            </button>
                          )}
                          {order.status !== 'awaiting_payment' && (
                            <button
                              type="button"
                              disabled={fetchingInvoiceId === order.id}
                              onClick={() => { setOpenMenuOrderId(''); voirLaFacture(order); }}
                            >
                              {fetchingInvoiceId === order.id ? t('ordersList.menu.viewInvoiceOpening') : t('ordersList.menu.viewInvoice')}
                            </button>
                          )}
                          <button
                            type="button"
                            className="is-danger"
                            disabled={deletingOrderId === order.id}
                            onClick={() => { setOpenMenuOrderId(''); removeOrder(order); }}
                          >
                            {deletingOrderId === order.id ? t('ordersList.menu.deleting') : t('ordersList.menu.delete')}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="orders-card-body">
                    <h3>{order.book_title || t('ordersList.untitledBook')}</h3>
                    <p className="orders-card-type">{TYPE_KEYS.includes(order.type) ? t(`stepPayment.typeLabels.${order.type}`) : order.type}</p>
                  </div>

                  {/* Une seule ligne de meta-donnees (retour utilisateur,
                      2026-09-30, piste "Commande & compte") a la place des
                      trois cases Type / Total / Date : le type est deja
                      dans le corps de la carte ci-dessus. */}
                  <p className="orders-card-summary">
                    {formatPriceCents(order.total_cents, order.currency || 'EUR')}
                    {' · '}
                    {new Date(order.created_at).toLocaleDateString(i18n.language === 'en' ? 'en-US' : 'fr-FR')}
                    {' · '}
                    {order.order_number}
                  </p>

                  <div className="orders-card-footer">
                    {actionPrincipale === 'payer' && (
                      <button
                        type="button"
                        className="orders-card-primary-btn"
                        disabled={startingPaymentOrderId === order.id}
                        onClick={() => startStripePayment(order)}
                      >
                        {startingPaymentOrderId === order.id ? t('ordersList.actions.payRedirecting') : t('ordersList.actions.pay')}
                      </button>
                    )}
                    {actionPrincipale === 'suivre_pdf' && (
                      <button type="button" className="orders-card-primary-btn" onClick={() => navigate(`/book/${bookId}/checkout`)}>
                        {t('ordersList.actions.followPdf')}
                      </button>
                    )}
                    {actionPrincipale === 'recuperer_pdf' && (
                      <button type="button" className="orders-card-primary-btn" onClick={() => navigate(`/book/${bookId}/checkout`)}>
                        {t('ordersList.actions.getPdf')}
                      </button>
                    )}
                    {/* Le detail du suivi (frise de production, numero de
                        colis) vit dans l'ecran de suivi du parcours de
                        commande : on y renvoie plutot que de le dupliquer. */}
                    {actionPrincipale === 'suivre_livraison' && (
                      <button type="button" className="orders-card-primary-btn" onClick={() => navigate(`/book/${bookId}/checkout`)}>
                        {t('ordersList.actions.followDelivery')}
                      </button>
                    )}
                    {actionPrincipale === 'finaliser_pdf' && (
                      <button type="button" className="orders-card-primary-btn" onClick={() => navigate(`/book/${bookId}/checkout`)}>
                        {t('ordersList.actions.finalizePdf')}
                      </button>
                    )}
                    {actionPrincipale === 'retour_livre' && (
                      <button type="button" className="orders-card-primary-btn" onClick={() => navigate(`/book/${bookId}`)}>
                        {t('ordersList.actions.backToBook')}
                      </button>
                    )}
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
