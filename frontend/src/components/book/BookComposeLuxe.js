import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';
import {
  listTemplates,
  listContentItems,
  getRecommendedPageCount,
  addTextItem,
  deleteContentItem,
  uploadPhoto,
  updateBook,
  composeBook,
  fetchPreviewHtml,
  fetchPreviewPdfBlob
} from '../../services/compositionApi';
import './BookComposeLuxe.css';

const PAGE_COUNT_OPTIONS = [24, 32, 40, 48, 60];
const STEP_LABELS = ['Style', 'Contenu', 'Pages', 'Aperçu'];

export default function BookComposeLuxe() {
  const { bookId } = useParams();

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [book, setBook] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState(null);

  const [items, setItems] = useState([]);
  const [newText, setNewText] = useState('');
  const [uploading, setUploading] = useState(false);

  const [pageMode, setPageMode] = useState('auto');
  const [selectedPageCount, setSelectedPageCount] = useState(24);
  const [recommendation, setRecommendation] = useState(null);
  const [loadingRecommendation, setLoadingRecommendation] = useState(false);

  const [composing, setComposing] = useState(false);
  const [overflow, setOverflow] = useState(false);
  const [variant, setVariant] = useState(0);
  const [previewHtml, setPreviewHtml] = useState(null);
  const [pdfError, setPdfError] = useState('');

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [{ data: bookRow, error: bookError }, templateList, itemList] = await Promise.all([
        supabase.from('books').select('*').eq('id', bookId).single(),
        listTemplates(),
        listContentItems(bookId)
      ]);
      if (bookError) throw new Error(bookError.message || 'Livre introuvable.');

      setBook(bookRow);
      setTemplates(templateList);
      setItems(itemList);
      setSelectedTemplateId(bookRow.template_id || null);
      setSelectedPageCount(bookRow.page_count || 24);
    } catch (err) {
      setError(err.message || 'Erreur de chargement.');
    } finally {
      setLoading(false);
    }
  }, [bookId]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const photoCount = useMemo(() => items.filter((item) => item.kind === 'photo').length, [items]);
  const textCount = useMemo(() => items.filter((item) => item.kind === 'texte').length, [items]);

  async function handleContinueStep1() {
    if (!selectedTemplateId) {
      setError('Choisissez un style avant de continuer.');
      return;
    }
    setError('');
    try {
      await updateBook(bookId, { template_id: selectedTemplateId });
      setStep(2);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handlePhotoChange(event) {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;
    setUploading(true);
    setError('');
    try {
      for (const file of files) {
        const created = await uploadPhoto(bookId, file, items.length);
        setItems((prev) => [...prev, created]);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  }

  async function handleAddText() {
    const text = newText.trim();
    if (!text) return;
    setError('');
    try {
      const created = await addTextItem(bookId, text, items.length);
      setItems((prev) => [...prev, created]);
      setNewText('');
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDeleteItem(itemId) {
    try {
      await deleteContentItem(bookId, itemId);
      setItems((prev) => prev.filter((item) => item.id !== itemId));
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleContinueStep2() {
    if (items.length === 0) {
      setError('Ajoutez au moins une photo ou un texte avant de continuer.');
      return;
    }
    setError('');
    setStep(3);
    setLoadingRecommendation(true);
    try {
      const reco = await getRecommendedPageCount(bookId);
      setRecommendation(reco);
      setSelectedPageCount(reco.recommended);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingRecommendation(false);
    }
  }

  async function handleContinueStep3() {
    setError('');
    try {
      await updateBook(bookId, { page_count: selectedPageCount, page_count_mode: pageMode === 'auto' ? 'auto' : 'manual' });
      setStep(4);
    } catch (err) {
      setError(err.message);
    }
  }

  async function runCompose(nextVariant) {
    setComposing(true);
    setError('');
    setPdfError('');
    try {
      const result = await composeBook(bookId, nextVariant);
      setOverflow(result.overflow);
      const html = await fetchPreviewHtml(bookId);
      setPreviewHtml(html);
    } catch (err) {
      setError(err.message);
    } finally {
      setComposing(false);
    }
  }

  async function handleDownloadPdf() {
    setPdfError('');
    try {
      const blob = await fetchPreviewPdfBlob(bookId);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
    } catch (err) {
      setPdfError(err.message || "Le PDF n'est pas disponible sur cet environnement pour le moment.");
    }
  }

  if (loading) {
    return <div className="compose-loading">Chargement…</div>;
  }

  if (!book) {
    return <div className="compose-loading">{error || 'Livre introuvable.'}</div>;
  }

  return (
    <div className="wizard-container compose-flow">
      <div className="wizard-card">
        <header className="wizard-header">
          <div className="ab-header-top">
            <span className="event-badge">{book.title}</span>
            <Link to={`/book/${bookId}`} className="compose-back-link">← Retour au livre</Link>
          </div>
          <div className="progress-steps ab-progress-steps">
            {STEP_LABELS.map((label, index) => {
              const stepNumber = index + 1;
              return (
                <div
                  key={label}
                  className={`progress-step ab-progress-step${step === stepNumber ? ' is-active' : ''}${step > stepNumber ? ' is-done' : ''}`}
                >
                  <span className={`progress-bar${step >= stepNumber ? ' active' : ''}`} />
                  <span className={`progress-label${step >= stepNumber ? ' active' : ''}`}>{label}</span>
                </div>
              );
            })}
          </div>
        </header>

        <section className="wizard-content">
          {error ? <div className="wizard-error">{error}</div> : null}

          {step === 1 && (
            <div className="ab-step">
              <h2 className="form-title">Choisissez un style</h2>
              <p className="form-intro">Le style détermine la densité et l'allure des pages composées automatiquement.</p>
              <div className="compose-template-grid">
                {templates.map((template) => (
                  <button
                    type="button"
                    key={template.id}
                    className={`card-luxe compose-template-card${selectedTemplateId === template.id ? ' is-selected' : ''}`}
                    onClick={() => setSelectedTemplateId(template.id)}
                  >
                    <h3>{template.label}</h3>
                    <p>{template.description}</p>
                  </button>
                ))}
              </div>
              <button type="button" className="btn btn-primary" onClick={handleContinueStep1}>Continuer</button>
            </div>
          )}

          {step === 2 && (
            <div className="ab-step">
              <h2 className="form-title">Photos &amp; souvenirs</h2>
              <p className="form-intro">{photoCount} photo(s), {textCount} texte(s) ajoutés.</p>

              <div className="photo-grid">
                {items.filter((item) => item.kind === 'photo').map((item) => (
                  <div key={item.id} className="photo-item">
                    <img src={item.url} alt="" />
                    <button type="button" className="photo-remove" onClick={() => handleDeleteItem(item.id)}>×</button>
                  </div>
                ))}
              </div>

              <input
                type="file"
                accept="image/*"
                multiple
                onChange={handlePhotoChange}
                id="compose-photo-upload"
                style={{ display: 'none' }}
                disabled={uploading}
              />
              <label htmlFor="compose-photo-upload" className="btn btn-outline" style={{ opacity: uploading ? 0.6 : 1 }}>
                {uploading ? 'Envoi…' : 'Ajouter des photos'}
              </label>

              <div className="compose-text-list">
                {items.filter((item) => item.kind === 'texte').map((item) => (
                  <div key={item.id} className="compose-text-item">
                    <p>{item.text}</p>
                    <button type="button" className="photo-remove" onClick={() => handleDeleteItem(item.id)}>×</button>
                  </div>
                ))}
              </div>

              <div className="form-group">
                <label>Ajouter un texte</label>
                <textarea
                  value={newText}
                  onChange={(event) => setNewText(event.target.value)}
                  rows={3}
                  placeholder="Un souvenir, un message..."
                />
                <button type="button" className="btn btn-outline" onClick={handleAddText}>Ajouter le texte</button>
              </div>

              <button type="button" className="btn btn-primary" onClick={handleContinueStep2}>Continuer</button>
            </div>
          )}

          {step === 3 && (
            <div className="ab-step">
              <h2 className="form-title">Nombre de pages</h2>
              <p className="form-intro">
                D'après votre contenu ({photoCount} photo(s), {textCount} texte(s)), voici la recommandation. Vous pouvez aussi choisir vous-même.
              </p>

              <div className="compose-mode-toggle">
                <button
                  type="button"
                  className={`btn btn-outline${pageMode === 'auto' ? ' is-selected' : ''}`}
                  onClick={() => { setPageMode('auto'); if (recommendation) setSelectedPageCount(recommendation.recommended); }}
                >
                  Automatique
                </button>
                <button
                  type="button"
                  className={`btn btn-outline${pageMode === 'manual' ? ' is-selected' : ''}`}
                  onClick={() => setPageMode('manual')}
                >
                  Manuel
                </button>
              </div>

              {loadingRecommendation && <p className="form-intro">Calcul de la recommandation…</p>}

              {pageMode === 'auto' && recommendation && (
                <div className="card-luxe compose-recommendation">
                  <h3>{recommendation.recommended} pages</h3>
                  <p>C'est le palier le plus adapté à votre contenu actuel. Ajoutez plus de photos/textes plus tard et recalculez si besoin.</p>
                </div>
              )}

              {pageMode === 'manual' && (
                <div className="compose-pagecount-grid">
                  {PAGE_COUNT_OPTIONS.map((count) => {
                    const tierInfo = recommendation?.tiers.find((tier) => tier.pageCount === count);
                    return (
                      <button
                        type="button"
                        key={count}
                        className={`card-luxe compose-pagecount-card${selectedPageCount === count ? ' is-selected' : ''}`}
                        onClick={() => setSelectedPageCount(count)}
                      >
                        {count} pages
                        {tierInfo && !tierInfo.fits && <span className="compose-pagecount-warning">contenu un peu juste</span>}
                      </button>
                    );
                  })}
                </div>
              )}

              <button type="button" className="btn btn-primary" onClick={handleContinueStep3}>Continuer</button>
            </div>
          )}

          {step === 4 && (
            <div className="ab-step">
              <h2 className="form-title">Composer et prévisualiser</h2>
              <p className="form-intro">Le moteur place automatiquement vos photos et textes sur les pages, selon le style choisi.</p>

              <div className="compose-actions">
                <button type="button" className="btn btn-primary" onClick={() => runCompose(variant)} disabled={composing}>
                  {composing ? 'Composition…' : previewHtml ? 'Recomposer' : 'Composer mon livre'}
                </button>
                {previewHtml && (
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => { const next = variant + 1; setVariant(next); runCompose(next); }}
                    disabled={composing}
                  >
                    Essayer une autre présentation
                  </button>
                )}
                {previewHtml && (
                  <button type="button" className="btn btn-outline" onClick={handleDownloadPdf}>Télécharger en PDF</button>
                )}
              </div>

              {overflow && (
                <div className="wizard-error">
                  Le contenu dépasse le nombre de pages choisi : le livre sera plus long que prévu, ou ajoutez moins de contenu.
                </div>
              )}
              {pdfError && <div className="wizard-error">{pdfError}</div>}

              {previewHtml && (
                <iframe
                  title="Aperçu du livre"
                  srcDoc={previewHtml}
                  className="compose-preview-frame"
                />
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
