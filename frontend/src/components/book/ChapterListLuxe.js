// C:\Users\USER\bookfete\frontend\src\components\book\ChapterListLuxe.js
import React, { useEffect, useState } from 'react';
import { supabase } from '../../services/supabaseClient';
import Tooltip from '../ui/Tooltip';
import ChapterDetailsLuxe from './chapters/ChapterDetailsLuxe';
import ContributionsModerationLuxe from './chapters/ContributionsModerationLuxe';
import ChapterEditorLuxe from './chapters/ChapterEditorLuxe';
import QuestionsEditorLuxe from './chapters/QuestionsEditorLuxe';
import InviteSelectorLuxe from './contributors/InviteSelectorLuxe';
import { useChapterActions } from './hooks/useChapterActions';
import { useContributions } from './hooks/useContributions';
import { useInvitations } from './hooks/useInvitations';
import { useQuestions } from './hooks/useQuestions';
import './BookLuxe.css';

const ChapterListLuxe = ({
  chapters,
  onUpdateChapter,
  onSaveContribution,
  onFinalizeContribution,
  onDeleteChapter,
  onAddChapter,
  bookId,
  book
}) => {
  // ==================== HOOKS ====================
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
    showInviteSelector,
    selectedChapterForInvite,
    inviteSuccess,
    handleOpenInviteSelector,
    handleInvitesSent,
    closeInviteSelector
  } = useInvitations();

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

  // Récupérer l'utilisateur connecté
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
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
    if (count === 0) return 'var(--gold)';
    if (count < 3) return 'var(--ink)';
    return 'var(--gold)';
  };

  const getChapterState = (chapter) => {
    if (chapter?.isChapterClosed) {
      return {
        label: 'Cloture',
        color: '#1f7a3d',
        background: '#e9f7ef'
      };
    }

    if (chapter?.contributionsClosed) {
      return {
        label: 'Contributions closes',
        color: '#8a6d00',
        background: '#fff8e1'
      };
    }

    return {
      label: 'En cours',
      color: '#8b6f47',
      background: '#f7f1e7'
    };
  };

  // ==================== RENDU ====================
  return (
    <div className="chapters-container">
      {/* Sidebar gauche */}
      <div className="sidebar">
        <div className="sidebar-header">
          <h3>📖 Structure du livre</h3>
          <Tooltip text="Ajouter un chapitre">
            <button
              type="button"
              className="sidebar-add-btn"
              onClick={async () => {
                if (typeof onAddChapter !== 'function') {
                  return;
                }

                const createdChapter = await onAddChapter();

                if (createdChapter?.id) {
                  handleSelectChapter(createdChapter.id);
                  setShowContributions(false);
                }
              }}
            >
              +
            </button>
          </Tooltip>
        </div>
        <div className="sidebar-content">
          {chapters.map((chapter, index) => {
            const chapterState = getChapterState(chapter);

            return (
              <div
                key={chapter.id}
                onClick={() => {
                  handleSelectChapter(chapter.id);
                  setShowContributions(false); // ← ICI on utilise la fonction du hook
                }}
                className={`chapter-item ${selectedChapterId === chapter.id ? 'selected' : ''}`}
                style={{
                  opacity: deleteConfirm?.id === chapter.id ? 0.5 : 1
                }}
              >
                <div className="chapter-title-row">
                  <div className="chapter-title">
                    {index + 1}. {chapter.title}
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

                    <div className="chapter-stats">
                      <span>💬 {chapter.contributionsCount || 0}</span>
                    </div>
                  </div>

                  <div className="chapter-actions">
                    <Tooltip text="Modifier le titre">
                      <button 
                        className="chapter-action-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEdit(chapter);
                        }}
                      >
                        ✎
                      </button>
                    </Tooltip>
                    
                    <Tooltip text="Modifier les questions">
                      <button 
                        className="chapter-action-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEditQuestions(chapter);
                        }}
                      >
                        ?
                      </button>
                    </Tooltip>
                    
                    <Tooltip text="Inviter des contributeurs">
                      <button 
                        className="chapter-action-btn"
                        onClick={(e) => handleOpenInviteSelector(chapter, e)}
                        style={{
                          color: inviteSuccess === chapter.id ? 'var(--gold)' : 'var(--text-light)'
                        }}
                      >
                        👥
                      </button>
                    </Tooltip>
                    
                    <Tooltip text="Supprimer">
                      <button 
                        className="chapter-action-btn"
                        onClick={(e) => handleDeleteClick(chapter, e)}
                      >
                        🗑
                      </button>
                    </Tooltip>
                  </div>
                </div>

                <div
                  className="chapter-status"
                  style={{
                    background: chapter?.isChapterClosed
                      ? '#1f7a3d'
                      : chapter?.contributionsClosed
                        ? '#b88a1f'
                        : getStatusColor(chapter.contributions)
                  }}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Colonne droite */}
      <div className="right-panel">
        {/* Modal de confirmation de suppression */}
        {deleteConfirm && (
          <div className="delete-confirm" onClick={cancelDelete}>
            <div className="delete-confirm-card" onClick={(e) => e.stopPropagation()}>
              <div className="delete-confirm-icon">⚠️</div>
              <h3 className="delete-confirm-title">Supprimer le chapitre ?</h3>
              <p className="delete-confirm-text">
                Êtes-vous sûr de vouloir supprimer le chapitre <strong>"{deleteConfirm.title}"</strong> ?
                <br />
                Cette action est irréversible. Toutes les contributions associées seront également supprimées.
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
                  Supprimer définitivement
                </button>
              </div>
            </div>
          </div>
        )}

        {selectedChapter ? (
          editingChapter ? (
            // Mode édition du titre
            <ChapterEditorLuxe
              editingChapter={editingChapter}
              setEditingChapter={setEditingChapter}
              onSave={handleSaveEdit}
              onCancel={() => setEditingChapter(null)}
            />
          ) : editingQuestions ? (
            // Mode édition des questions
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
            // Mode modération
            <ContributionsModerationLuxe
              chapterTitle={selectedChapter.title}
              contributions={chapterContributions}
              loading={loadingContributions}
              onApprove={approveContribution}
              onDelete={deleteContribution}
              onBack={() => setShowContributions(false)}
              userEmail={user?.email}
            />
          ) : (
            // Mode détails du chapitre
            <ChapterDetailsLuxe
              chapter={selectedChapter}
              chaptersCount={chapters.length}
              onUpdateChapter={onUpdateChapter}
              onSaveContribution={onSaveContribution}
              onFinalizeContribution={onFinalizeContribution}
              onGenerateQuestions={(chapter) => generateAIQuestions(chapter, bookId, selectedChapter)}
              generatingQuestions={generatingQuestions}
              contributionText={contributionText}
              setContributionText={setContributionText}
              photos={photos}
              photoPreviews={photoPreviews}
              onPhotoChange={handlePhotoChange}
              onRemovePhoto={removePhoto}
              onSubmitContribution={() => submitContribution(selectedChapter.id, user?.email, user?.user_metadata?.full_name || user?.email)}
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
            <h3>Sélectionnez un chapitre</h3>
            <p>Cliquez sur un chapitre pour voir son contenu</p>
          </div>
        )}
      </div>

      {/* Modal d'invitation */}
      {showInviteSelector && selectedChapterForInvite && (
        <InviteSelectorLuxe
          chapterId={selectedChapterForInvite.id}
          bookId={bookId}
          onClose={closeInviteSelector}
          onInvitesSent={() => handleInvitesSent(selectedChapterForInvite.id)}
        />
      )}
    </div>
  );
};

export default ChapterListLuxe;
