import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';
import {
  confirmStripePayment,
  createOrder,
  createStripeCheckoutSession,
  getOrderById,
  getApiBaseUrl,
  listOrdersByBook,
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
import {
  getJourneyPrimaryAction,
  getJourneyStatusConfig,
  resolveBookJourneyStatus
} from '../../utils/clientJourney';
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

const wait = (durationMs) => new Promise((resolve) => {
  setTimeout(resolve, durationMs);
});
const isMissingPdfJobError = (error) => (
  /job export introuvable|introuvable/i.test(String(error?.message || ''))
);
const isPdfOrderLinkError = (error) => (
  /commande associee au pdf introuvable/i.test(String(error?.message || ''))
);
const NETWORK_TIMEOUT_MS = Number(process.env.REACT_APP_API_TIMEOUT_MS || 20000);
const PREVIEW_FORMAT_IDS = new Set(['prestige', 'livret', 'carre']);
const PREVIEW_TEXT_DENSITY_IDS = new Set(['airy', 'balanced', 'compact']);
const PREVIEW_IMAGE_DENSITY_IDS = new Set(['discrete', 'balanced', 'immersive']);

const fetchJsonWithTimeout = async (url, options = {}, timeoutMs = NETWORK_TIMEOUT_MS) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    const payload = await response.json().catch(() => ({}));
    return { response, payload };
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('Le serveur met trop de temps a repondre. Reessayez dans quelques instants.');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
};

const BookCheckoutLuxe = () => {
  const { bookId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const stripeResumeRef = useRef('');
  const autoRecoverInFlightRef = useRef(false);
  const jobMonitorRef = useRef('');
  const [loading, setLoading] = useState(true);
  const [book, setBook] = useState(null);
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
  const stripeTestEnabled = process.env.REACT_APP_STRIPE_ENABLED === '1';
  const checkoutJourneyStatus = useMemo(
    () => resolveBookJourneyStatus({ book, latestOrder }),
    [book, latestOrder]
  );
  const checkoutJourneyConfig = useMemo(
    () => getJourneyStatusConfig(checkoutJourneyStatus),
    [checkoutJourneyStatus]
  );
  const checkoutJourneyAction = useMemo(
    () => getJourneyPrimaryAction(checkoutJourneyStatus, latestOrder),
    [checkoutJourneyStatus, latestOrder]
  );
  const hasPendingPaymentOrder = (
    String(latestOrder?.status || '').toLowerCase() === 'awaiting_payment'
  );
  const checkoutFormLocked = hasPendingPaymentOrder;
  const effectiveOrderType = checkoutFormLocked
    ? String(latestOrder?.type || orderType).toLowerCase()
    : orderType;
  const effectiveTotal = checkoutFormLocked
    ? Number(latestOrder?.total_cents || estimate.total)
    : estimate.total;
  const effectiveQuantity = checkoutFormLocked
    ? Math.max(1, Number(latestOrder?.quantity || quantity || 1))
    : quantity;

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
        const bookOrders = await listOrdersByBook(bookId).catch(() => []);
        const latestBookOrder = Array.isArray(bookOrders) ? bookOrders[0] : null;
        if (latestBookOrder) {
          setLatestOrder(latestBookOrder);
          const recoveredJobId = String(latestBookOrder?.metadata?.pdfJobId || '').trim();
          if (recoveredJobId) {
            const recoveredStatus = latestBookOrder?.status === 'pdf_ready' || latestBookOrder?.metadata?.pdfReady
              ? 'ready'
              : 'rendering';
            setPdfJob({
              jobId: recoveredJobId,
              status: recoveredStatus,
              completedAt: latestBookOrder?.metadata?.pdfCompletedAt || null
            });
          }
        }
      } catch (error) {
        setNotice({ type: 'error', message: error.message });
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [bookId, navigate]);

  useEffect(() => {
    if (!checkoutFormLocked || !latestOrder) {
      return;
    }

    const normalizedType = String(latestOrder?.type || '').toLowerCase();
    if (normalizedType === 'pdf' || normalizedType === 'print' || normalizedType === 'pack') {
      setOrderType(normalizedType);
    }
    setQuantity(Math.max(1, Number(latestOrder?.quantity || 1)));

    if (includesPrint(normalizedType)) {
      const shipping = latestOrder?.shipping_address && typeof latestOrder.shipping_address === 'object'
        ? latestOrder.shipping_address
        : {};
      setAddress((previous) => ({
        ...previous,
        ...shipping
      }));
    }
  }, [checkoutFormLocked, latestOrder]);

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

  const startPdfExport = async (orderId = '') => {
    const headers = await getAuthHeaders();
    const normalizedOrderId = String(orderId || '').trim();
    const configuredFormat = String(book?.cover_config?.previewFormat || '').toLowerCase();
    const previewFormat = PREVIEW_FORMAT_IDS.has(configuredFormat) ? configuredFormat : 'prestige';
    const rawLayoutSettings = (
      book?.cover_config?.previewLayoutSettings
      && typeof book.cover_config.previewLayoutSettings === 'object'
    )
      ? book.cover_config.previewLayoutSettings
      : {};
    const payloadBody = {
      previewFormat,
      previewLayoutSettings: {
        textDensity: PREVIEW_TEXT_DENSITY_IDS.has(rawLayoutSettings.textDensity)
          ? rawLayoutSettings.textDensity
          : 'balanced',
        imageDensity: PREVIEW_IMAGE_DENSITY_IDS.has(rawLayoutSettings.imageDensity)
          ? rawLayoutSettings.imageDensity
          : 'balanced'
      }
    };
    if (normalizedOrderId) {
      payloadBody.orderId = normalizedOrderId;
    }
    const { response, payload } = await fetchJsonWithTimeout(
      `${getApiBaseUrl()}/books/${bookId}/export-final-pdf`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(payloadBody)
      },
      NETWORK_TIMEOUT_MS
    );
    if (!response.ok) {
      throw new Error(payload?.error || 'Impossible de lancer la generation PDF');
    }
    return payload;
  };

  const startPdfExportWithRetry = async (orderId, maxAttempts = 4) => {
    let lastError = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        // eslint-disable-next-line no-await-in-loop
        return await startPdfExport(orderId);
      } catch (error) {
        if (isPdfOrderLinkError(error) && orderId) {
          try {
            // eslint-disable-next-line no-await-in-loop
            return await startPdfExport('');
          } catch (fallbackError) {
            lastError = fallbackError;
          }
        } else {
          lastError = error;
        }
        const message = String(error?.message || '').toLowerCase();
        const isPaymentPropagationIssue = (
          message.includes('uniquement apres paiement')
          || message.includes('paiement requis')
          || message.includes('commande associee au pdf introuvable')
        );
        if (!isPaymentPropagationIssue || attempt === maxAttempts) {
          break;
        }
        // eslint-disable-next-line no-await-in-loop
        await wait(1200 * attempt);
      }
    }
    throw lastError || new Error('Impossible de lancer la generation PDF');
  };

  const pollPdfJobUntilReady = async (jobId) => {
    const headers = await getAuthHeaders();
    const maxAttempts = 80;
    const delayMs = 2500;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      // eslint-disable-next-line no-await-in-loop
      const { response, payload } = await fetchJsonWithTimeout(
        `${getApiBaseUrl()}/books/${bookId}/export-final-pdf/${jobId}/status`,
        {
          method: 'GET',
          headers
        },
        15000
      );
      if (!response.ok) {
        const errorMessage = String(payload?.error || 'Erreur pendant le suivi PDF');
        const normalizedError = errorMessage.toLowerCase();
        const canRetryOnPaymentPropagation = (
          normalizedError.includes('uniquement apres paiement')
          || normalizedError.includes('paiement requis')
        );
        if (canRetryOnPaymentPropagation && attempt < 10) {
          // eslint-disable-next-line no-await-in-loop
          await wait(delayMs);
          // eslint-disable-next-line no-continue
          continue;
        }
        throw new Error(errorMessage);
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

  const fetchPdfDownloadBlob = async ({ jobId, kind, headers }) => {
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

    return { blob, fileName };
  };

  const recoverPdfJobForDownload = async () => {
    const currentOrder = latestOrder;
    if (!currentOrder?.id || !includesPdf(currentOrder.type)) {
      throw new Error('Commande PDF introuvable');
    }

    setNotice({
      type: 'info',
      message: 'Le job PDF a expire. Regeneration en cours...'
    });

    let workingOrder = currentOrder;
    if (String(workingOrder.status || '').toLowerCase() === 'paid') {
      workingOrder = await updateOrderStatus(workingOrder.id, 'pdf_generating');
      setLatestOrder(workingOrder);
    }

    const restartedJob = await startPdfExportWithRetry(workingOrder.id, 2);
    setPdfJob(restartedJob);

    workingOrder = await updateOrderStatus(workingOrder.id, 'pdf_generating', {
      pdfJobId: restartedJob.jobId,
      pdfRequestedAt: restartedJob.createdAt || new Date().toISOString(),
      pdfReady: false
    });
    setLatestOrder(workingOrder);

    const readyJob = await pollPdfJobUntilReady(restartedJob.jobId);
    const nextStatus = includesPrint(workingOrder.type) ? 'print_queued' : 'pdf_ready';
    const completedOrder = await updateOrderStatus(workingOrder.id, nextStatus, {
      pdfReady: true,
      pdfJobId: readyJob.jobId,
      pdfCompletedAt: readyJob.completedAt || new Date().toISOString()
    });

    setLatestOrder(completedOrder);
    setPdfJob(readyJob);
    setNotice({
      type: 'success',
      message: 'PDF regenere. Le telechargement demarre.'
    });

    return readyJob.jobId;
  };

  const downloadPdfFile = async (kind) => {
    const initialJobId = latestOrder?.metadata?.pdfJobId || pdfJob?.jobId;
    if (!initialJobId) {
      setNotice({
        type: 'warning',
        message: 'Aucun job PDF disponible. Regeneration automatique en cours...'
      });
    }

    try {
      setDownloadingKind(kind);
      const headers = await getAuthHeaders();
      let jobIdToUse = initialJobId;
      if (!jobIdToUse) {
        jobIdToUse = await recoverPdfJobForDownload();
      }

      let blobResult;
      try {
        blobResult = await fetchPdfDownloadBlob({ jobId: jobIdToUse, kind, headers });
      } catch (error) {
        if (!isMissingPdfJobError(error)) {
          throw error;
        }
        const recoveredJobId = await recoverPdfJobForDownload();
        blobResult = await fetchPdfDownloadBlob({ jobId: recoveredJobId, kind, headers });
      }

      const { blob, fileName } = blobResult;
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
      if (!stripeTestEnabled) {
        throw new Error('Le paiement Stripe doit etre active pour lancer la commande.');
      }

      const createdOrder = await createOrder({
        bookId,
        type: orderType,
        quantity,
        shippingAddress: includesPrint(orderType) ? address : null
      });

      const checkoutSession = await createStripeCheckoutSession(createdOrder.id);
      if (!checkoutSession?.checkoutUrl) {
        throw new Error('Impossible d ouvrir Stripe Checkout');
      }
      window.location.assign(checkoutSession.checkoutUrl);
      return;
    } catch (error) {
      setNotice({ type: 'error', message: error.message });
    } finally {
      setSubmitting(false);
    }
  };

  const payPendingOrder = async () => {
    try {
      setSubmitting(true);
      setNotice(null);

      if (!stripeTestEnabled) {
        throw new Error('Le paiement Stripe doit etre active pour lancer la commande.');
      }
      if (!latestOrder?.id || String(latestOrder.status || '').toLowerCase() !== 'awaiting_payment') {
        throw new Error('Aucune commande en attente de paiement.');
      }

      const checkoutSession = await createStripeCheckoutSession(latestOrder.id);
      if (!checkoutSession?.checkoutUrl) {
        throw new Error('Impossible d ouvrir Stripe Checkout');
      }
      window.location.assign(checkoutSession.checkoutUrl);
    } catch (error) {
      setNotice({ type: 'error', message: error.message });
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    if (!stripeTestEnabled) {
      return;
    }

    const params = new URLSearchParams(location.search || '');
    const payment = String(params.get('payment') || '').toLowerCase();
    const orderId = params.get('orderId');
    const sessionId = params.get('session_id');
    const resumeKey = `${orderId || ''}:${sessionId || ''}`;

    if (payment === 'cancel') {
      setNotice({ type: 'warning', message: 'Paiement annule. Vous pouvez relancer la commande.' });
      navigate(`/book/${bookId}/checkout`, { replace: true });
      return;
    }

    if (payment !== 'success' || !orderId || !sessionId || stripeResumeRef.current === resumeKey) {
      return;
    }

    stripeResumeRef.current = resumeKey;

    const resumeAfterStripe = async () => {
      try {
        setSubmitting(true);
        setNotice({ type: 'info', message: 'Paiement recu. Finalisation de la commande en cours...' });

        let currentOrder = await confirmStripePayment(orderId, sessionId);
        setLatestOrder(currentOrder);
        let finalNotice = { type: 'success', message: 'Paiement confirme. Commande mise a jour.' };

        if (includesPdf(currentOrder.type) && ['paid', 'pdf_generating'].includes(currentOrder.status)) {
          if (currentOrder.status === 'paid') {
            currentOrder = await updateOrderStatus(currentOrder.id, 'pdf_generating');
            setLatestOrder(currentOrder);
          }

          let exportJob = null;
          try {
            exportJob = await startPdfExportWithRetry(currentOrder.id);
          } catch (_error) {
            exportJob = null;
          }

          if (exportJob?.jobId) {
            setPdfJob(exportJob);
            currentOrder = await updateOrderStatus(currentOrder.id, 'pdf_generating', {
              pdfJobId: exportJob.jobId,
              pdfRequestedAt: exportJob.createdAt || new Date().toISOString()
            });
            setLatestOrder(currentOrder);
          }

          if (exportJob?.jobId) {
            try {
              const readyJob = await pollPdfJobUntilReady(exportJob.jobId);

              if (includesPrint(currentOrder.type)) {
                currentOrder = await updateOrderStatus(currentOrder.id, 'print_queued', {
                  pdfReady: true,
                  pdfJobId: readyJob.jobId,
                  pdfCompletedAt: readyJob.completedAt || new Date().toISOString()
                });
              } else {
                currentOrder = await updateOrderStatus(currentOrder.id, 'pdf_ready', {
                  pdfReady: true,
                  pdfJobId: readyJob.jobId,
                  pdfCompletedAt: readyJob.completedAt || new Date().toISOString()
                });
              }
              setLatestOrder(currentOrder);
              finalNotice = {
                type: 'success',
                message: 'Paiement valide. Le PDF final est genere et telechargeable.'
              };
            } catch (_pollError) {
              finalNotice = {
                type: 'warning',
                message: 'Paiement valide. Le PDF est en cours de generation et sera disponible sous peu.'
              };
              const refreshedOrder = await getOrderById(currentOrder.id).catch(() => null);
              if (refreshedOrder) {
                setLatestOrder(refreshedOrder);
              }
            }
          } else {
            finalNotice = {
              type: 'warning',
              message: 'Paiement valide. La generation PDF demarre en arriere-plan et sera disponible sous peu.'
            };
          }
        } else if (includesPrint(currentOrder.type) && currentOrder.status === 'paid') {
          currentOrder = await updateOrderStatus(currentOrder.id, 'print_queued');
          setLatestOrder(currentOrder);
          finalNotice = { type: 'success', message: 'Paiement valide. Production lancee.' };
        }

        setNotice(finalNotice);
      } catch (error) {
        setNotice({ type: 'error', message: error.message || 'Erreur apres paiement Stripe.' });
      } finally {
        setSubmitting(false);
        navigate(`/book/${bookId}/checkout`, { replace: true });
      }
    };

    resumeAfterStripe();
  }, [location.search, bookId, navigate, stripeTestEnabled]);

  useEffect(() => {
    if (!latestOrder?.id || latestOrder.status !== 'pdf_generating') {
      return undefined;
    }

    let active = true;
    let timer = null;

    const refreshOrder = async () => {
      try {
        const freshOrder = await getOrderById(latestOrder.id);
        if (!active) return;

        setLatestOrder(freshOrder);
        if (freshOrder.status === 'pdf_ready' || freshOrder?.metadata?.pdfReady) {
          setNotice({
            type: 'success',
            message: 'Paiement valide. Le PDF final est genere et telechargeable.'
          });
          return;
        }
      } catch (_error) {
        // Silent retry in background
      }

      if (active) {
        timer = setTimeout(refreshOrder, 5000);
      }
    };

    timer = setTimeout(refreshOrder, 4000);

    return () => {
      active = false;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [latestOrder?.id, latestOrder?.status]);

  useEffect(() => {
    if (!latestOrder?.id || !includesPdf(latestOrder.type)) {
      return undefined;
    }

    const status = String(latestOrder.status || '').toLowerCase();
    const existingJobId = String(latestOrder?.metadata?.pdfJobId || '').trim();
    if (status !== 'pdf_generating' || !existingJobId) {
      return undefined;
    }

    const monitorKey = `${latestOrder.id}:${existingJobId}:${latestOrder.type}`;
    if (jobMonitorRef.current === monitorKey) {
      return undefined;
    }
    jobMonitorRef.current = monitorKey;

    let active = true;
    const monitorAndRecoverPdfJob = async () => {
      try {
        const readyJob = await pollPdfJobUntilReady(existingJobId);
        if (!active) return;

        const nextStatus = includesPrint(latestOrder.type) ? 'print_queued' : 'pdf_ready';
        const updatedOrder = await updateOrderStatus(latestOrder.id, nextStatus, {
          pdfReady: true,
          pdfJobId: readyJob.jobId,
          pdfCompletedAt: readyJob.completedAt || new Date().toISOString()
        });
        if (!active) return;

        setLatestOrder(updatedOrder);
        setPdfJob(readyJob);
        setNotice({
          type: 'success',
          message: 'Paiement valide. Le PDF final est genere et telechargeable.'
        });
        return;
      } catch (error) {
        if (!active) return;
        if (!isMissingPdfJobError(error)) {
          return;
        }
      }

      try {
        setNotice({
          type: 'info',
          message: 'Paiement valide. Relance automatique de la generation PDF...'
        });
        const restartedJob = await startPdfExportWithRetry(latestOrder.id);
        if (!active) return;

        setPdfJob(restartedJob);
        const updatedOrder = await updateOrderStatus(latestOrder.id, 'pdf_generating', {
          pdfJobId: restartedJob.jobId,
          pdfRequestedAt: restartedJob.createdAt || new Date().toISOString(),
          pdfReady: false
        });
        if (!active) return;

        setLatestOrder(updatedOrder);
        setNotice({
          type: 'warning',
          message: 'Paiement valide. Le PDF est en cours de generation et sera disponible sous peu.'
        });
      } catch (_restartError) {
        if (!active) return;
        setNotice({
          type: 'warning',
          message: 'Paiement valide. Le PDF est en cours de preparation. Revenez dans quelques instants.'
        });
      }
    };

    monitorAndRecoverPdfJob();

    return () => {
      active = false;
    };
  }, [latestOrder?.id, latestOrder?.status, latestOrder?.metadata?.pdfJobId, latestOrder?.type]);

  useEffect(() => {
    if (!latestOrder?.id || !includesPdf(latestOrder.type)) {
      return undefined;
    }

    const status = String(latestOrder.status || '').toLowerCase();
    if (!['paid', 'pdf_generating'].includes(status)) {
      return undefined;
    }

    const existingJobId = String(latestOrder?.metadata?.pdfJobId || '').trim();
    if (existingJobId) {
      return undefined;
    }

    let active = true;
    let retryTimer = null;
    const resumePendingPdf = async () => {
      if (!active || autoRecoverInFlightRef.current) {
        if (active) {
          retryTimer = setTimeout(resumePendingPdf, 15000);
        }
        return;
      }

      autoRecoverInFlightRef.current = true;
      try {
        setNotice({
          type: 'info',
          message: 'Paiement valide. Relance de la generation PDF en cours...'
        });

        let currentOrder = latestOrder;
        if (status === 'paid') {
          currentOrder = await updateOrderStatus(currentOrder.id, 'pdf_generating');
          if (!active) return;
          setLatestOrder(currentOrder);
        }

        const exportJob = await startPdfExportWithRetry(currentOrder.id, 1);
        if (!active) return;

        setPdfJob(exportJob);
        currentOrder = await updateOrderStatus(currentOrder.id, 'pdf_generating', {
          pdfJobId: exportJob.jobId,
          pdfRequestedAt: exportJob.createdAt || new Date().toISOString()
        });
        if (!active) return;

        setLatestOrder(currentOrder);
        setNotice({
          type: 'warning',
          message: 'Paiement valide. Le PDF est en cours de generation et sera disponible sous peu.'
        });
      } catch (_error) {
        if (!active) return;
        const errorMessage = String(_error?.message || '').trim();
        setNotice({
          type: 'warning',
          message: errorMessage
            ? `Paiement valide, mais la relance automatique a echoue: ${errorMessage}`
            : 'Paiement valide. Le PDF sera disponible sous peu.'
        });
      } finally {
        autoRecoverInFlightRef.current = false;
        if (active) {
          retryTimer = setTimeout(resumePendingPdf, 15000);
        }
      }
    };

    resumePendingPdf();

    return () => {
      active = false;
      if (retryTimer) {
        clearTimeout(retryTimer);
      }
    };
  }, [latestOrder?.id, latestOrder?.status, latestOrder?.metadata?.pdfJobId, latestOrder?.type]);

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
          <div className="orders-journey">
            <span className={`orders-status-chip ${checkoutJourneyConfig.tone}`}>
              {checkoutJourneyConfig.label}
            </span>
            <span className="orders-journey-next">
              Prochaine action: {checkoutJourneyAction.label}
            </span>
          </div>
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
        {checkoutFormLocked && (
          <div className="orders-notice is-info">
            Une commande est deja en attente de paiement. La creation d une nouvelle commande est temporairement bloquee.
          </div>
        )}

        <section className="orders-grid">
          <article className="orders-panel">
            <h2>{checkoutFormLocked ? '1. Commande en attente' : '1. Choix du produit'}</h2>
            <div className="product-choice-grid">
              {[
                { key: 'pdf', title: 'PDF seul', note: 'Telechargement uniquement' },
                { key: 'print', title: 'Livre imprime', note: 'Impression + livraison' },
                { key: 'pack', title: 'Pack PDF + imprime', note: 'Les deux versions' }
              ].map((choice) => (
                <button
                  key={choice.key}
                  type="button"
                  className={`product-choice ${effectiveOrderType === choice.key ? 'is-active' : ''}`}
                  onClick={() => {
                    if (!checkoutFormLocked) {
                      setOrderType(choice.key);
                    }
                  }}
                  disabled={checkoutFormLocked}
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
                value={effectiveQuantity}
                onChange={(event) => setQuantity(Number(event.target.value || 1))}
                disabled={checkoutFormLocked}
              />
            </div>
          </article>

          {includesPrint(effectiveOrderType) && (
            <article className="orders-panel">
              <h2>2. Adresse de livraison</h2>
              <div className="orders-form-grid">
                <input className="input-luxe" name="fullName" value={address.fullName} onChange={setAddressField} placeholder="Nom complet" disabled={checkoutFormLocked} />
                <input className="input-luxe" name="line1" value={address.line1} onChange={setAddressField} placeholder="Adresse" disabled={checkoutFormLocked} />
                <input className="input-luxe" name="line2" value={address.line2} onChange={setAddressField} placeholder="Complement" disabled={checkoutFormLocked} />
                <input className="input-luxe" name="postalCode" value={address.postalCode} onChange={setAddressField} placeholder="Code postal" disabled={checkoutFormLocked} />
                <input className="input-luxe" name="city" value={address.city} onChange={setAddressField} placeholder="Ville" disabled={checkoutFormLocked} />
                <input className="input-luxe" name="country" value={address.country} onChange={setAddressField} placeholder="Pays" disabled={checkoutFormLocked} />
                <input className="input-luxe" name="phone" value={address.phone} onChange={setAddressField} placeholder="Telephone" disabled={checkoutFormLocked} />
              </div>
            </article>
          )}

          <article className="orders-panel">
            <h2>{includesPrint(effectiveOrderType) ? '3' : '2'}. Paiement et execution</h2>
            <div className="orders-summary">
              <div>
                <span>Produit</span>
                <strong>{effectiveOrderType === 'pdf' ? 'PDF seul' : effectiveOrderType === 'print' ? 'Livre imprime' : 'Pack PDF + imprime'}</strong>
              </div>
              <div>
                <span>Total</span>
                <strong>{formatPriceCents(effectiveTotal)}</strong>
              </div>
            </div>

            <button
              type="button"
              className="btn btn-primary"
              disabled={submitting || !canOrder || !stripeTestEnabled}
              onClick={hasPendingPaymentOrder ? payPendingOrder : submitOrder}
            >
              {submitting
                ? 'Traitement...'
                : hasPendingPaymentOrder
                  ? 'Payer la commande en attente'
                  : 'Payer avec Stripe (test)'}
            </button>
            <p className="orders-disclaimer">
              {stripeTestEnabled
                ? hasPendingPaymentOrder
                  ? 'Une commande en attente existe deja. Finalisez d abord ce paiement.'
                  : 'Stripe Checkout en mode test. Utilisez une carte de test Stripe.'
                : 'Le paiement est temporairement indisponible: activez Stripe pour lancer la commande.'}
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
      </div>
    </div>
  );
};

export default BookCheckoutLuxe;
