import React, { useEffect, useState } from 'react';
import { supabase } from '../../services/supabaseClient';
import Tooltip from '../ui/Tooltip';
import ChapterDetailsLuxe from './chapters/ChapterDetailsLuxe';
import ContributionsModerationLuxe from './chapters/ContributionsModerationLuxe';
import ChapterEditorLuxe from './chapters/ChapterEditorLuxe';
import BookCoverDesignerLuxe from './BookCoverDesignerLuxe';
import BookPromptInlineAdmin from './BookPromptInlineAdmin';
import { useChapterActions } from './hooks/useChapterActions';
import { useContributions } from './hooks/useContributions';
import './BookLuxe.css';

const COVER_CARD_ID = 'cover-card';
const BACK_COVER_CARD_ID = 'back-cover-card';
const SPECIAL_VIEW_IDS = new Set([COVER_CARD_ID, BACK_COVER_CARD_ID]);

const PROGRESSION_STATUS = {
  done: {
    key: 'done',
    label: 'Termine',
    color: '#1f7a3d',
    background: '#e9f7ee'
  },
  inProgress: {
    key: 'inProgress',
    label: 'En cours',
    color: '#9a5a00',
    background: '#fff4df'
  },
  notStarted: {
    key: 'notStarted',
    label: 'Non commence',
    color: '#5f6770',
    background: '#f2f4f6'
  }
};

const normalizeText = (value) => {
  if (value === null || value === undefined) return '';
  return String(value).trim();
};

const CoverFaceIcon = ({ side = 'front' }) => (
  <svg
    viewBox="0 0 48 48"
    focusable="false"
    aria-hidden="true"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="10" y="6" width="28" height="36" rx="5" />
    <path d="M16 6v36" />
    {side === 'back' ? (
      <>
        <path d="M21 14h12" />
        <path d="M21 19h12" />
        <path d="M21 24h8" />
        <rect x="21" y="30" width="12" height="6" rx="1.2" />
        <path d="M23 31v4M25 31v4M27 31v4M29 31v4M31 31v4" />
      </>
    ) : (
      <>
        <path d="M21 14h12" />
        <path d="M21 20h9" />
        <path d="M21 28h12" />
        <path d="M21 34h6" />
      </>
    )}
  </svg>
);

const ChapterCardIcon = () => (
  <svg
    viewBox="0 0 56 56"
    focusable="false"
    aria-hidden="true"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="10" y="8" width="36" height="40" rx="8.5" />
    <path d="M18 8v40" />
    <path d="M23 19h15" />
    <path d="M23 25h12" />
    <path d="M23 31h15" />
    <path d="M23 37h10" />
  </svg>
);

const ChapterListLuxe = ({
  chapters,
  onUpdateChapter,
  onSaveContribution,
  onFinalizeContribution,
  onGenerateChapterDraft,
  onSaveChapterDraft,
  onFinalizeChapterDraft,
  onDeleteChapter,
  bookId,
  book,
  onUpdateBook,
  editionGalleryRequest = 0
}) => {
  const [user, setUser] = useState(null);
  const [editionLayout, setEditionLayout] = useState('gallery');

  const {
    selectedChapterId,
    editingChapter,
    deleteConfirm,
    setEditingChapter,
    setSelectedChapterId,
    handleSelectChapter,
    handleEdit,
    handleSaveEdit,
    handleDeleteClick,
    confirmDelete,
    cancelDelete
  } = useChapterActions(onUpdateChapter, onDeleteChapter);

  const selectedChapter = chapters.find((chapter) => chapter.id === selectedChapterId) || null;
  const selectedSpecialFace = selectedChapterId === COVER_CARD_ID
    ? 'front'
    : selectedChapterId === BACK_COVER_CARD_ID
      ? 'back'
      : null;
  const isSpecialWorkspace = Boolean(selectedSpecialFace);
  const selectedChapterTitle = selectedChapter
    ? (selectedChapter.order_index === 0 ? 'Introduction' : selectedChapter.title)
    : (selectedSpecialFace === 'front' ? 'Couverture' : selectedSpecialFace === 'back' ? '4e de couverture' : '');
  const isGalleryOnly = !selectedChapter && !isSpecialWorkspace;

  const {
    showContributions,
    setShowContributions,
    chapterContributions,
    loadingContributions,
    contributionText,
    setContributionText,
    photos,
    photoPreviews,
    submitting,
    loadContributions,
    approveContribution,
    deleteContribution,
    handlePhotoChange,
    removePhoto,
    submitContribution
  } = useContributions();

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user: authUser } }) => {
      setUser(authUser);
    });
  }, []);

  useEffect(() => {
    if (!chapters.length) {
      setSelectedChapterId(null);
      return;
    }

    if (
      selectedChapterId
      && !SPECIAL_VIEW_IDS.has(selectedChapterId)
      && !chapters.some((chapter) => chapter.id === selectedChapterId)
    ) {
      setSelectedChapterId(null);
    }
  }, [chapters, selectedChapterId, setSelectedChapterId]);

  useEffect(() => {
    setEditionLayout('gallery');
    setSelectedChapterId(null);
    setShowContributions(false);
    setEditingChapter(null);
  }, [
    editionGalleryRequest,
    setEditingChapter,
    setSelectedChapterId,
    setShowContributions
  ]);

  const handleBackToGallery = () => {
    setSelectedChapterId(null);
    setShowContributions(false);
    setEditingChapter(null);
  };

  const getStatusColor = (contributions) => {
    const count = Array.isArray(contributions) ? contributions.length : 0;
    if (count === 0) return '#b9c4cf';
    if (count < 3) return '#d89434';
    return '#2f6e78';
  };

  const getChapterProgressState = (chapter) => {
    const isDone = Boolean(chapter?.isChapterClosed || chapter?.chapterDraft?.status === 'validated');
    if (isDone) {
      return PROGRESSION_STATUS.done;
    }

    const hasStarted = Boolean(
      chapter?.amorce_validated
      || chapter?.questions_validated
      || chapter?.workflowState
      || chapter?.hasContributed
      || Number(chapter?.contributionsCount || 0) > 0
      || Number(chapter?.chapterDraft?.generationCount || 0) > 0
      || normalizeText(chapter?.chapterDraft?.html)
    );

    return hasStarted ? PROGRESSION_STATUS.inProgress : PROGRESSION_STATUS.notStarted;
  };

  const getCoverProgressState = (face) => {
    const coverConfig = (book?.cover_config && typeof book.cover_config === 'object')
      ? book.cover_config
      : {};
    const backCoverConfig = (book?.back_cover_config && typeof book.back_cover_config === 'object')
      ? book.back_cover_config
      : {};

    if (face === 'front') {
      const title = normalizeText(coverConfig.title || book?.title);
      const recipientLine = normalizeText(coverConfig.recipientLine);
      const eventLine = normalizeText(coverConfig.eventLine);
      const subtitle = normalizeText(coverConfig.subtitle);
      const hasStarted = Boolean(subtitle || recipientLine || eventLine);
      const isDone = Boolean(title && recipientLine && eventLine);
      if (isDone) return PROGRESSION_STATUS.done;
      return hasStarted ? PROGRESSION_STATUS.inProgress : PROGRESSION_STATUS.notStarted;
    }

    const blurb = normalizeText(backCoverConfig.blurb);
    const quote = normalizeText(backCoverConfig.quote);
    const signature = normalizeText(backCoverConfig.signature);
    const hasStarted = Boolean(blurb || quote || signature);
    const isDone = Boolean(blurb && signature);
    if (isDone) return PROGRESSION_STATUS.done;
    return hasStarted ? PROGRESSION_STATUS.inProgress : PROGRESSION_STATUS.notStarted;
  };

  const editionItems = [
    { id: COVER_CARD_ID, type: 'cover' },
    ...chapters.map((chapter, index) => ({
      id: chapter.id,
      type: 'chapter',
      chapter,
      index
    })),
    { id: BACK_COVER_CARD_ID, type: 'backCover' }
  ];

  const openEditionItem = (itemId) => {
    handleSelectChapter(itemId);
    setShowContributions(false);
    setEditingChapter(null);
  };

  return (
    <div className={`chapters-container ${isGalleryOnly ? 'gallery-only' : 'chapter-focus'}`}>
      {deleteConfirm && (
        <div className="delete-confirm" onClick={cancelDelete}>
          <div className="delete-confirm-card" onClick={(event) => event.stopPropagation()}>
            <div className="delete-confirm-icon">!</div>
            <h3 className="delete-confirm-title">Supprimer le chapitre ?</h3>
            <p className="delete-confirm-text">
              Etes-vous sur de vouloir supprimer le chapitre <strong>"{deleteConfirm.title}"</strong> ?
              <br />
              Cette action est irreversible. Toutes les contributions associees seront egalement supprimees.
            </p>
            <div className="delete-confirm-actions">
              <button
                onClick={cancelDelete}
                className="modal-btn modal-btn-secondary"
              >
                Annuler
              </button>
              <button
                onClick={confirmDelete}
                className="modal-btn modal-btn-danger"
              >
                Supprimer definitivement
              </button>
            </div>
          </div>
        </div>
      )}

      {isGalleryOnly ? (
        <div className="sidebar">
          <div className="sidebar-header sidebar-header-edition">
            <h3>Structure du livre</h3>
            <div className="edition-layout-toggle">
              <button
                type="button"
                data-layout="gallery"
                className={`edition-layout-btn ${editionLayout === 'gallery' ? 'is-active' : ''}`}
                onClick={() => setEditionLayout('gallery')}
              >
                Galerie
              </button>
              <button
                type="button"
                data-layout="summary"
                className={`edition-layout-btn ${editionLayout === 'summary' ? 'is-active' : ''}`}
                onClick={() => setEditionLayout('summary')}
              >
                Sommaire
              </button>
            </div>
          </div>

          <BookPromptInlineAdmin
            endpointBase={`/books/${bookId}/prompt-admin/chapter-titles`}
            panelTitle="Generation des titres de chapitres"
            panelSubtitle="Testez le prompt utilise pour proposer les titres du sommaire. Le resultat s affiche ici, sans quitter le livre."
            emptyResultLabel={'Cliquez sur "Tester" pour voir les propositions de titres ici.'}
            publishNotice="Cette version est maintenant active pour la generation des titres de chapitres."
            resultMode="titles"
            className="book-prompt-admin-inline"
          />

          {editionLayout === 'gallery' ? (
            <div className="sidebar-content">
              {editionItems.map((item) => {
                if (item.type !== 'chapter') {
                  const isFront = item.type === 'cover';
                  const coverProgress = getCoverProgressState(isFront ? 'front' : 'back');

                  return (
                    <div
                      key={item.id}
                      onClick={() => openEditionItem(item.id)}
                      className={`chapter-item chapter-special-card is-interactive ${selectedChapterId === item.id ? 'selected' : ''} ${isFront ? 'chapter-cover-card' : 'chapter-back-cover-card'}`}
                    >
                      <div className={`chapter-special-icon ${isFront ? 'is-front' : 'is-back'}`} aria-hidden="true">
                        <CoverFaceIcon side={isFront ? 'front' : 'back'} />
                      </div>
                      <div className="chapter-special-title">{isFront ? 'Couverture' : '4e de couverture'}</div>
                      <div className="chapter-special-subtitle">Configurer</div>
                      <div
                        className="chapter-state-badge chapter-state-badge-pinned"
                        style={{
                          color: coverProgress.color,
                          background: coverProgress.background
                        }}
                      >
                        {coverProgress.label}
                      </div>
                    </div>
                  );
                }

                const { chapter, index } = item;
                const chapterProgress = getChapterProgressState(chapter);
                const displayTitle = index === 0 ? 'Introduction' : chapter.title;
                const chapterAccent = chapterProgress.key === 'done'
                  ? '#2f8f58'
                  : chapterProgress.key === 'inProgress'
                    ? '#d89434'
                    : getStatusColor(chapter.contributions);

                return (
                  <div
                    key={chapter.id}
                    onClick={() => openEditionItem(chapter.id)}
                    className={`chapter-item chapter-card-sketch ${selectedChapterId === chapter.id ? 'selected' : ''}`}
                    style={{
                      opacity: deleteConfirm?.id === chapter.id ? 0.5 : 1
                    }}
                  >
                    <div className="chapter-actions chapter-actions-floating">
                      <Tooltip text="Modifier le chapitre" position="bottom">
                        <button
                          type="button"
                          className="chapter-action-btn"
                          aria-label={`Modifier ${displayTitle}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            openEditionItem(chapter.id);
                            handleEdit({
                              ...chapter,
                              title: displayTitle
                            });
                          }}
                        >
                          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                            <path d="M3 17.25V21h3.75L17.8 9.95l-3.75-3.75L3 17.25zm14.71-9.04a1 1 0 0 0 0-1.42l-2.5-2.5a1 1 0 0 0-1.42 0L12 6.08l3.75 3.75 1.96-1.62z" />
                          </svg>
                        </button>
                      </Tooltip>

                      <Tooltip text="Supprimer" position="bottom">
                        <button
                          type="button"
                          className="chapter-action-btn"
                          aria-label={`Supprimer ${displayTitle}`}
                          onClick={(event) => handleDeleteClick(chapter, event)}
                        >
                          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                            <path d="M9 3h6l1 2h4v2H4V5h4l1-2zm-1 6h2v9H8V9zm6 0h2v9h-2V9zM6 9h2v9H6V9zm2 12h8a2 2 0 0 0 2-2V9H6v10a2 2 0 0 0 2 2z" />
                          </svg>
                        </button>
                      </Tooltip>
                    </div>

                    <div
                      className="chapter-book-visual"
                      style={{ '--chapter-accent': chapterAccent }}
                    >
                      <div className="chapter-book-glyph" aria-hidden="true">
                        <ChapterCardIcon />
                      </div>
                    </div>

                    <div className="chapter-book-content">
                      <div className="chapter-book-heading">
                        <span className="chapter-book-number">{index + 1}</span>
                        <div className="chapter-book-title">{displayTitle}</div>
                      </div>

                      <div className="chapter-book-footer">
                        <div
                          className="chapter-state-badge chapter-state-badge-pinned"
                          style={{
                            color: chapterProgress.color,
                            background: chapterProgress.background
                          }}
                        >
                          {chapterProgress.label}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="edition-summary-list">
              {editionItems.map((item) => {
                if (item.type !== 'chapter') {
                  const isFront = item.type === 'cover';
                  const coverProgress = getCoverProgressState(isFront ? 'front' : 'back');
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={`edition-summary-row ${selectedChapterId === item.id ? 'selected' : ''}`}
                      onClick={() => openEditionItem(item.id)}
                    >
                      <div className="edition-summary-main">
                        <span className="edition-summary-index">{isFront ? 'C' : '4'}</span>
                        <span className="edition-summary-title">{isFront ? 'Couverture' : '4e de couverture'}</span>
                      </div>
                      <span
                        className="chapter-state-badge"
                        style={{
                          color: coverProgress.color,
                          background: coverProgress.background
                        }}
                      >
                        {coverProgress.label}
                      </span>
                    </button>
                  );
                }

                const { chapter, index } = item;
                const chapterProgress = getChapterProgressState(chapter);
                const displayTitle = index === 0 ? 'Introduction' : chapter.title;
                return (
                  <button
                    key={chapter.id}
                    type="button"
                    className={`edition-summary-row ${selectedChapterId === chapter.id ? 'selected' : ''}`}
                    onClick={() => openEditionItem(chapter.id)}
                  >
                    <div className="edition-summary-main">
                      <span className="edition-summary-index">{index + 1}</span>
                      <span className="edition-summary-title">{displayTitle}</span>
                    </div>
                    <span
                      className="chapter-state-badge"
                      style={{
                        color: chapterProgress.color,
                        background: chapterProgress.background
                      }}
                    >
                      {chapterProgress.label}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="right-panel right-panel-full">
          <div className="chapter-workspace-header">
            <button
              type="button"
              className="sidebar-gallery-btn"
              onClick={handleBackToGallery}
            >
              Retour structure
            </button>
            <h3 className="chapter-workspace-title">{selectedChapterTitle}</h3>
          </div>

          {isSpecialWorkspace ? (
            <BookCoverDesignerLuxe
              book={book}
              onUpdateBook={onUpdateBook}
              initialFace={selectedSpecialFace}
            />
          ) : editingChapter ? (
            <ChapterEditorLuxe
              editingChapter={editingChapter}
              setEditingChapter={setEditingChapter}
              onSave={handleSaveEdit}
              onCancel={() => setEditingChapter(null)}
            />
          ) : showContributions ? (
            <ContributionsModerationLuxe
              chapterTitle={selectedChapterTitle}
              contributions={chapterContributions}
              loading={loadingContributions}
              onApprove={approveContribution}
              onDelete={deleteContribution}
              onBack={() => setShowContributions(false)}
              userEmail={user?.email}
            />
          ) : (
            <ChapterDetailsLuxe
              chapter={selectedChapter}
              chaptersCount={chapters.length}
              onUpdateChapter={onUpdateChapter}
              onSaveContribution={onSaveContribution}
              onFinalizeContribution={onFinalizeContribution}
              onGenerateChapterDraft={onGenerateChapterDraft}
              onSaveChapterDraft={onSaveChapterDraft}
              onFinalizeChapterDraft={onFinalizeChapterDraft}
              contributionText={contributionText}
              setContributionText={setContributionText}
              photos={photos}
              photoPreviews={photoPreviews}
              onPhotoChange={handlePhotoChange}
              onRemovePhoto={removePhoto}
              onSubmitContribution={() => submitContribution(
                selectedChapter.id,
                user?.email,
                user?.user_metadata?.full_name || user?.email
              )}
              submitting={submitting}
              onLoadContributions={loadContributions}
              userEmail={user?.email}
              user={user}
              book={book}
              amorceValidated={Boolean(selectedChapter?.amorce_validated || selectedChapter?.questions_validated)}
            />
          )}
        </div>
      )}
    </div>
  );
};

export default ChapterListLuxe;
