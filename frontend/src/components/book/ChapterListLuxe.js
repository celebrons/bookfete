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

    if (!selectedChapterId || !chapters.some((chapter) => chapter.id === selectedChapterId)) {
      setSelectedChapterId(chapters[0].id);
    }
  }, [chapters, selectedChapterId, setSelectedChapterId]);

  const getStatusColor = (contributions) => {
    const count = Array.isArray(contributions) ? contributions.length : 0;
    if (count === 0) return '#b9c4cf';
    if (count < 3) return '#7f95a5';
    return '#2f6e78';
  };

  const getChapterState = (chapter) => {
    if (chapter?.isChapterClosed) {
      return {
        label: 'Clotur\u00e9',
        color: '#2f6e78',
        background: '#edf7f8'
      };
    }

    if (chapter?.contributionsClosed) {
      return {
        label: 'Contributions closes',
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
    <div className="chapters-container">
      <div className="sidebar">
        <div className="sidebar-header">
          <h3>Structure du livre</h3>
        </div>

        <div className="sidebar-content">
          {chapters.map((chapter, index) => {
            const chapterState = getChapterState(chapter);
            const displayTitle = index === 0 ? 'Introduction' : chapter.title;

            return (
              <div
                key={chapter.id}
                onClick={() => {
                  handleSelectChapter(chapter.id);
                  setShowContributions(false);
                }}
                className={`chapter-item ${selectedChapterId === chapter.id ? 'selected' : ''}`}
                style={{
                  opacity: deleteConfirm?.id === chapter.id ? 0.5 : 1
                }}
              >
                <div className="chapter-title-row">
                  <div className="chapter-title">
                    {index + 1}. {displayTitle}
                  </div>

                  <div className="chapter-actions">
                    <Tooltip text="Modifier le chapitre">
                      <button
                        className="chapter-action-btn"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleEdit({
                            ...chapter,
                            title: displayTitle
                          });
                        }}
                      >
                        ✎
                      </button>
                    </Tooltip>

                    <Tooltip text="Supprimer">
                      <button
                        className="chapter-action-btn"
                        onClick={(event) => handleDeleteClick(chapter, event)}
                      >
                        🗑
                      </button>
                    </Tooltip>
                  </div>
                </div>

                <div className="chapter-footer-row">
                  <div className="chapter-meta-row">
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

                <div
                  className="chapter-status"
                  style={{
                    background: chapter?.isChapterClosed
                      ? '#2f6e78'
                      : chapter?.contributionsClosed
                        ? '#7b8e9c'
                        : getStatusColor(chapter.contributions)
                  }}
                />
              </div>
            );
          })}
        </div>
      </div>

      <div className="right-panel">
        {deleteConfirm && (
          <div className="delete-confirm" onClick={cancelDelete}>
            <div className="delete-confirm-card" onClick={(event) => event.stopPropagation()}>
              <div className="delete-confirm-icon">⚠</div>
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

        {selectedChapter ? (
          editingChapter ? (
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
              chapterTitle={selectedChapter.order_index === 0 ? 'Introduction' : selectedChapter.title}
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
          )
        ) : (
          <div className="empty-state">
            <div className="empty-state-icon">📖</div>
            <h3>Selectionnez un chapitre</h3>
            <p>Cliquez sur un chapitre pour voir son contenu</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChapterListLuxe;
