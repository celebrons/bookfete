import React, { useEffect, useState } from 'react';
import { supabase } from '../../services/supabaseClient';
import Tooltip from '../ui/Tooltip';
import ChapterDetailsLuxe from './chapters/ChapterDetailsLuxe';
import ContributionsModerationLuxe from './chapters/ContributionsModerationLuxe';
import ChapterEditorLuxe from './chapters/ChapterEditorLuxe';
import QuestionsEditorLuxe from './chapters/QuestionsEditorLuxe';
import { useChapterActions } from './hooks/useChapterActions';
import { useContributions } from './hooks/useContributions';
import { useQuestions } from './hooks/useQuestions';
import './BookLuxe.css';

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
  book
}) => {
  const [user, setUser] = useState(null);

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
  const selectedChapterTitle = selectedChapter
    ? (selectedChapter.order_index === 0 ? 'Introduction' : selectedChapter.title)
    : '';
  const isGalleryOnly = !selectedChapter;

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

  const {
    editingQuestions,
    setEditingQuestions,
    newQuestion,
    setNewQuestion,
    generatingQuestions,
    handleEditQuestions,
    handleSaveQuestions,
    addQuestion,
    removeQuestion,
    generateAIQuestions
  } = useQuestions(onUpdateChapter);

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

    if (selectedChapterId && !chapters.some((chapter) => chapter.id === selectedChapterId)) {
      setSelectedChapterId(null);
    }
  }, [chapters, selectedChapterId, setSelectedChapterId]);

  const handleBackToGallery = () => {
    setSelectedChapterId(null);
    setShowContributions(false);
    setEditingChapter(null);
    setEditingQuestions(null);
  };

  const getStatusColor = (contributions) => {
    const count = Array.isArray(contributions) ? contributions.length : 0;
    if (count === 0) return '#b9c4cf';
    if (count < 3) return '#7f95a5';
    return '#2f6e78';
  };

  const getChapterState = (chapter) => {
    if (chapter?.isChapterClosed) {
      return {
        label: 'Cloture',
        color: '#2f6e78',
        background: '#edf7f8'
      };
    }

    if (chapter?.contributionsClosed) {
      return {
        label: 'Contributions fermees',
        color: '#5d7183',
        background: '#f1f5f8'
      };
    }

    return {
      label: 'En cours',
      color: '#5f6770',
      background: '#f4f6f8'
    };
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
          <div className="sidebar-header">
            <h3>Structure du livre</h3>
          </div>

          <div className="sidebar-content">
            {[
              { id: 'cover-card', type: 'cover' },
              ...chapters.map((chapter, index) => ({
                id: chapter.id,
                type: 'chapter',
                chapter,
                index
              })),
              { id: 'back-cover-card', type: 'backCover' }
            ].map((item) => {
              if (item.type !== 'chapter') {
                const isFront = item.type === 'cover';

                return (
                  <div
                    key={item.id}
                    className={`chapter-item chapter-special-card ${isFront ? 'chapter-cover-card' : 'chapter-back-cover-card'}`}
                  >
                    <div className="chapter-special-icon" aria-hidden="true">
                      <svg viewBox="0 0 24 24" focusable="false">
                        <path d="M5 4.5A2.5 2.5 0 0 1 7.5 2H20v18H7.5A2.5 2.5 0 0 0 5 22.5V4.5zm3 0H18v13H8a2.5 2.5 0 0 0-1 .21V5a.5.5 0 0 1 .5-.5z" />
                      </svg>
                    </div>
                    <div className="chapter-special-title">{isFront ? 'Couverture' : '4e de couverture'}</div>
                    <div className="chapter-special-subtitle">Vierge</div>
                  </div>
                );
              }

              const { chapter, index } = item;
              const chapterState = getChapterState(chapter);
              const displayTitle = index === 0 ? 'Introduction' : chapter.title;
              const chapterShapeClass = `chapter-shape-${(index % 5) + 1}`;
              const chapterAccent = chapter?.isChapterClosed
                ? '#2f6e78'
                : chapter?.contributionsClosed
                  ? '#7b8e9c'
                  : getStatusColor(chapter.contributions);

              return (
                <div
                  key={chapter.id}
                  onClick={() => {
                    handleSelectChapter(chapter.id);
                    setShowContributions(false);
                  }}
                  className={`chapter-item chapter-card-sketch ${chapterShapeClass} ${selectedChapterId === chapter.id ? 'selected' : ''}`}
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
                          handleSelectChapter(chapter.id);
                          setShowContributions(false);
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
                    <div className="chapter-book-stack" aria-hidden="true">
                      <span className="chapter-sheet chapter-sheet-back" />
                      <span className="chapter-sheet chapter-sheet-front">
                        <svg viewBox="0 0 24 24" focusable="false">
                          <path d="M6 6h12v2H6V6zm0 4h12v2H6v-2zm0 4h8v2H6v-2z" />
                        </svg>
                      </span>
                    </div>
                  </div>

                  <div className="chapter-book-content">
                    <div className="chapter-book-heading">
                      <span className="chapter-book-number">{index + 1}</span>
                      <div className="chapter-book-title">{displayTitle}</div>
                    </div>

                    <div className="chapter-book-footer">
                      <div
                        className="chapter-state-badge"
                        style={{
                          color: chapterState.color,
                          background: chapterState.background
                        }}
                      >
                        {chapterState.label}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="right-panel right-panel-full">
          <div className="chapter-workspace-header">
            <button
              type="button"
              className="sidebar-gallery-btn"
              onClick={handleBackToGallery}
            >
              Retour galerie
            </button>
            <h3 className="chapter-workspace-title">{selectedChapterTitle}</h3>
          </div>

          {editingChapter ? (
            <ChapterEditorLuxe
              editingChapter={editingChapter}
              setEditingChapter={setEditingChapter}
              onSave={handleSaveEdit}
              onCancel={() => setEditingChapter(null)}
            />
          ) : editingQuestions ? (
            <QuestionsEditorLuxe
              editingQuestions={editingQuestions}
              setEditingQuestions={setEditingQuestions}
              newQuestion={newQuestion}
              setNewQuestion={setNewQuestion}
              onAddQuestion={addQuestion}
              onRemoveQuestion={removeQuestion}
              onSave={handleSaveQuestions}
              onCancel={() => setEditingQuestions(null)}
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
              onGenerateQuestions={(chapterItem) => generateAIQuestions(chapterItem, bookId, selectedChapter)}
              generatingQuestions={generatingQuestions}
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
              onEditQuestions={() => handleEditQuestions(selectedChapter)}
              onValidateQuestions={() => {
                onUpdateChapter(selectedChapter.id, { questions_validated: true });
              }}
              questionsValidated={selectedChapter?.questions_validated || false}
              onEditContribution={() => {}}
              invitations={[]}
            />
          )}
        </div>
      )}
    </div>
  );
};

export default ChapterListLuxe;
