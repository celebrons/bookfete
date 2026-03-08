import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';
import {
  createOrder,
  getApiBaseUrl,
  listOrdersByBook,
  payOrder,
  updateOrderStatus
} from '../../services/ordersApi';
import {
  formatPriceCents,
  getOrderStatusConfig,
  includesPdf,
  includesPrint
} from '../../utils/orderWorkflow';
import {
  getBookLifecycleStatusFromBook,
  isBookLifecycleAtLeast
} from '../../utils/bookLifecycle';
import '../../styles/luxe-theme.css';
import './OrdersLuxe.css';

const DEFAULT_ADDRESS = {
  fullName: '',
  line1: '',
  line2: '',
  postalCode: '',
  city: '',
  country: 'France',
  phone: ''
};

const computeEstimate = (book, type, quantity) => {
  const pages = Number(book?.pages || 0);
  const safePages = Number.isFinite(pages) && pages > 0 ? pages : 64;
  const safeQuantity = Math.max(1, Number(quantity) || 1);
  const printUnit = Math.max(6900, 4900 + Math.round(safePages * 85));
  const pdfUnit = 3900;
  let unit = pdfUnit;
  if (type === 'print') unit = printUnit;
  if (type === 'pack') unit = printUnit + 2000;
  return {
    unit,
    total: unit * safeQuantity
  };
};

const BookCheckoutLuxe = () => {
  const { bookId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [book, setBook] = useState(null);
  const [existingOrders, setExistingOrders] = useState([]);
  const [orderType, setOrderType] = useState('pdf');
  const [quantity, setQuantity] = useState(1);
  const [address, setAddress] = useState(DEFAULT_ADDRESS);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState(null);
  const [latestOrder, setLatestOrder] = useState(null);
  const [pdfJob, setPdfJob] = useState(null);
  const [downloadingKind, setDownloadingKind] = useState('');

  const estimate = useMemo(
    () => computeEstimate(book, orderType, quantity),
    [book, orderType, quantity]
  );

  const canOrder = useMemo(
    () => isBookLifecycleAtLeast(getBookLifecycleStatusFromBook(book), 'finalized'),
    [book]
  );

  useEffect(() => {
    const loadData = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          navigate('/login');
          return;
        }

        const { data: bookData, error: bookError } = await supabase
          .from('books')
          .select('*')
          .eq('id', bookId)
          .eq('owner_id', user.id)
          .single();

        if (bookError || !bookData) {
          throw new Error('Livre introuvable');
        }

        setBook(bookData);

        const loadedOrders = await listOrdersByBook(bookId);
        setExistingOrders(Array.isArray(loadedOrders) ? loadedOrders : []);
      } catch (error) {
        setNotice({ type: 'error', message: error.message });
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [bookId, navigate]);

  const setAddressField = (event) => {
    const { name, value } = event.target;
    setAddress((previous) => ({ ...previous, [name]: value }));
  };

  const getAuthHeaders = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) {
      throw new Error('Session invalide. Reconnectez-vous.');
    }

    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    };
  };

  const startPdfExport = async () => {
    const headers = await getAuthHeaders();
    const response = await fetch(`${getApiBaseUrl()}/books/${bookId}/export-final-pdf`, {
      method: 'POST',
      headers
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.error || 'Impossible de lancer la generation PDF');
    }
    return payload;
  };

  const pollPdfJobUntilReady = async (jobId) => {
    const headers = await getAuthHeaders();
    const maxAttempts = 80;
    const delayMs = 2500;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      // eslint-disable-next-line no-await-in-loop
      const response = await fetch(`${getApiBaseUrl()}/books/${bookId}/export-final-pdf/${jobId}/status`, {
        method: 'GET',
        headers
      });
      // eslint-disable-next-line no-await-in-loop
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || 'Erreur pendant le suivi PDF');
      }

      setPdfJob(payload);

      if (payload.status === 'ready') {
        return payload;
      }

      if (payload.status === 'failed') {
        throw new Error(payload.error || 'La generation PDF a echoue');
      }

      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    throw new Error('Generation PDF trop longue. Reessayez depuis le livre.');
  };

  const downloadPdfFile = async (kind) => {
    const jobId = latestOrder?.metadata?.pdfJobId || pdfJob?.jobId;
    if (!jobId) return;

    try {
      setDownloadingKind(kind);
      const headers = await getAuthHeaders();
      const response = await fetch(
        `${getApiBaseUrl()}/books/${bookId}/export-final-pdf/${jobId}/download/${kind}`,
        { method: 'GET', headers }
      );

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || 'Telechargement impossible');
      }

      const blob = await response.blob();
      const fallbackName = kind === 'cover' ? 'couverture.pdf' : 'interieur.pdf';
      const disposition = response.headers.get('content-disposition') || '';
      const match = disposition.match(/filename="?([^";]+)"?/i);
      const fileName = match?.[1] || fallbackName;
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      setNotice({ type: 'error', message: error.message });
    } finally {
      setDownloadingKind('');
    }
  };

  const submitOrder = async () => {
    try {
      setSubmitting(true);
      setNotice(null);

      if (!canOrder) {
        throw new Error('Le livre doit etre finalise avant la commande.');
      }

      const createdOrder = await createOrder({
        bookId,
        type: orderType,
        quantity,
        shippingAddress: includesPrint(orderType) ? address : null
      });

      let currentOrder = await payOrder(createdOrder.id, {
        paymentReference: `SIM-${Date.now()}`
      });
      setLatestOrder(currentOrder);

      if (includesPdf(orderType)) {
        currentOrder = await updateOrderStatus(currentOrder.id, 'pdf_generating');
        setLatestOrder(currentOrder);
        const exportJob = await startPdfExport();
        const readyJob = await pollPdfJobUntilReady(exportJob.jobId);

        if (includesPrint(orderType)) {
          currentOrder = await updateOrderStatus(currentOrder.id, 'print_queued', {
            pdfReady: true,
            pdfJobId: readyJob.jobId,
            pdfCompletedAt: readyJob.completedAt || new Date().toISOString()
          });
        } else {
          currentOrder = await updateOrderStatus(currentOrder.id, 'pdf_ready', {
            pdfJobId: readyJob.jobId,
            pdfCompletedAt: readyJob.completedAt || new Date().toISOString()
          });
        }
        setLatestOrder(currentOrder);
      } else if (includesPrint(orderType)) {
        currentOrder = await updateOrderStatus(currentOrder.id, 'print_queued');
        setLatestOrder(currentOrder);
      }

      setNotice({ type: 'success', message: 'Commande creee avec succes.' });
      const refreshedOrders = await listOrdersByBook(bookId);
      setExistingOrders(Array.isArray(refreshedOrders) ? refreshedOrders : []);
    } catch (error) {
      setNotice({ type: 'error', message: error.message });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="orders-page">
        <div className="container-luxe orders-shell">
          <p>Chargement du checkout...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="orders-page">
      <div className="container-luxe orders-shell">
        <header className="orders-hero card-luxe">
          <div className="label-gold">Commande</div>
          <h1>Finaliser votre commande</h1>
          <p>
            Livre: <strong>{book?.title || 'Sans titre'}</strong>
          </p>
          <div className="orders-hero-links">
            <Link to={`/book/${bookId}`} className="btn btn-outline">Retour au livre</Link>
            <Link to="/orders" className="btn btn-outline">Mes commandes</Link>
          </div>
        </header>

        {notice?.message && (
          <div className={`orders-notice is-${notice.type || 'info'}`}>
            {notice.message}
          </div>
        )}

        {!canOrder && (
          <div className="orders-notice is-warning">
            Ce livre n est pas encore finalise. Terminez l apercu/PDF final avant la commande.
          </div>
        )}

        <section className="orders-grid">
          <article className="orders-panel">
            <h2>1. Choix du produit</h2>
            <div className="product-choice-grid">
              {[
                { key: 'pdf', title: 'PDF seul', note: 'Telechargement uniquement' },
                { key: 'print', title: 'Livre imprime', note: 'Impression + livraison' },
                { key: 'pack', title: 'Pack PDF + imprime', note: 'Les deux versions' }
              ].map((choice) => (
                <button
                  key={choice.key}
                  type="button"
                  className={`product-choice ${orderType === choice.key ? 'is-active' : ''}`}
                  onClick={() => setOrderType(choice.key)}
                >
                  <strong>{choice.title}</strong>
                  <span>{choice.note}</span>
                </button>
              ))}
            </div>

            <div className="orders-field">
              <label htmlFor="quantity">Quantite</label>
              <input
                id="quantity"
                type="number"
                min="1"
                max="20"
                className="input-luxe"
                value={quantity}
                onChange={(event) => setQuantity(Number(event.target.value || 1))}
              />
            </div>
          </article>

          {includesPrint(orderType) && (
            <article className="orders-panel">
              <h2>2. Adresse de livraison</h2>
              <div className="orders-form-grid">
                <input className="input-luxe" name="fullName" value={address.fullName} onChange={setAddressField} placeholder="Nom complet" />
                <input className="input-luxe" name="line1" value={address.line1} onChange={setAddressField} placeholder="Adresse" />
                <input className="input-luxe" name="line2" value={address.line2} onChange={setAddressField} placeholder="Complement" />
                <input className="input-luxe" name="postalCode" value={address.postalCode} onChange={setAddressField} placeholder="Code postal" />
                <input className="input-luxe" name="city" value={address.city} onChange={setAddressField} placeholder="Ville" />
                <input className="input-luxe" name="country" value={address.country} onChange={setAddressField} placeholder="Pays" />
                <input className="input-luxe" name="phone" value={address.phone} onChange={setAddressField} placeholder="Telephone" />
              </div>
            </article>
          )}

          <article className="orders-panel">
            <h2>{includesPrint(orderType) ? '3' : '2'}. Paiement et execution</h2>
            <div className="orders-summary">
              <div>
                <span>Produit</span>
                <strong>{orderType === 'pdf' ? 'PDF seul' : orderType === 'print' ? 'Livre imprime' : 'Pack PDF + imprime'}</strong>
              </div>
              <div>
                <span>Total</span>
                <strong>{formatPriceCents(estimate.total)}</strong>
              </div>
            </div>

            <button
              type="button"
              className="btn btn-primary"
              disabled={submitting || !canOrder}
              onClick={submitOrder}
            >
              {submitting ? 'Traitement...' : 'Payer et lancer la commande'}
            </button>
            <p className="orders-disclaimer">
              Paiement en mode simulation pour le MVP. Stripe sera branche ensuite.
            </p>
          </article>
        </section>

        {latestOrder && (
          <section className="orders-panel orders-result">
            <h2>Commande creee</h2>
            <div className="orders-result-grid">
              <div>
                <span>Numero</span>
                <strong>{latestOrder.order_number}</strong>
              </div>
              <div>
                <span>Statut</span>
                <strong>{getOrderStatusConfig(latestOrder.status).label}</strong>
              </div>
            </div>

            {(latestOrder.status === 'pdf_ready' || latestOrder?.metadata?.pdfReady) && (
              <div className="orders-download-actions">
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => downloadPdfFile('interior')}
                  disabled={downloadingKind === 'interior'}
                >
                  {downloadingKind === 'interior' ? 'Telechargement...' : 'Telecharger interieur.pdf'}
                </button>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => downloadPdfFile('cover')}
                  disabled={downloadingKind === 'cover'}
                >
                  {downloadingKind === 'cover' ? 'Telechargement...' : 'Telecharger couverture.pdf'}
                </button>
              </div>
            )}
          </section>
        )}

        <section className="orders-panel">
          <h2>Commandes deja creees pour ce livre</h2>
          {existingOrders.length === 0 ? (
            <p className="orders-empty">Aucune commande pour ce livre.</p>
          ) : (
            <div className="orders-list">
              {existingOrders.map((order) => (
                <div key={order.id} className="orders-list-item">
                  <div>
                    <strong>{order.order_number}</strong>
                    <span>{new Date(order.created_at).toLocaleString('fr-FR')}</span>
                  </div>
                  <span className={`orders-status-chip ${getOrderStatusConfig(order.status).tone}`}>
                    {getOrderStatusConfig(order.status).label}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default BookCheckoutLuxe;
