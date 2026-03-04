import React, { useEffect, useState } from 'react';
import ChapterWorkflowLuxe from './ChapterWorkflowLuxe';
import '../BookLuxe.css';

const ChapterDetailsLuxe = ({
  chapter,
  chaptersCount,
  onUpdateChapter,
  onSaveContribution,
  onFinalizeContribution,
  onGenerateChapterDraft,
  onSaveChapterDraft,
  onFinalizeChapterDraft,
  onGenerateQuestions,
  generatingQuestions,
  contributionText,
  setContributionText,
  photos,
  photoPreviews,
  onPhotoChange,
  onRemovePhoto,
  onSubmitContribution,
  submitting,
  onLoadContributions,
  userEmail,
  user,
  book,
  onEditQuestions,
  onValidateQuestions,
  questionsValidated,
  isEditing,
  onEditContribution,
  invitations
}) => {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (chapter?.id) {
      setLoading(false);
    }
  }, [chapter?.id]);

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 'var(--space-xxl)' }}>
        <div
          className="spinner"
          style={{
            border: '2px solid var(--mist)',
            borderTop: '2px solid var(--gold)',
            borderRadius: '50%',
            width: '40px',
            height: '40px',
            animation: 'spin 1s linear infinite',
            margin: '0 auto var(--space-md)'
          }}
        />
        <p className="body-text">Chargement...</p>
      </div>
    );
  }

  const displayTitle = chapter?.order_index === 0 ? 'Introduction' : chapter?.title;

  return (
    <>
      <div className="chapter-details-header">
        <h2>{displayTitle}</h2>
      </div>

      <p className="chapter-subtitle">
        ALBUM PRESTIGE | {chaptersCount} CHAPITRES
      </p>

      <ChapterWorkflowLuxe
        key={chapter.id}
        chapter={chapter}
        chaptersCount={chaptersCount}
        onUpdateChapter={onUpdateChapter}
        onSaveContribution={onSaveContribution}
        onFinalizeContribution={onFinalizeContribution}
        onGenerateChapterDraft={onGenerateChapterDraft}
        onSaveChapterDraft={onSaveChapterDraft}
        onFinalizeChapterDraft={onFinalizeChapterDraft}
        onGenerateQuestions={onGenerateQuestions}
        generatingQuestions={generatingQuestions}
        contributionText={contributionText}
        setContributionText={setContributionText}
        photos={photos}
        photoPreviews={photoPreviews}
        onPhotoChange={onPhotoChange}
        onRemovePhoto={onRemovePhoto}
        onSubmitContribution={onSubmitContribution}
        submitting={submitting}
        onLoadContributions={onLoadContributions}
        userEmail={userEmail}
        user={user}
        book={book}
        onEditQuestions={onEditQuestions}
        onValidateQuestions={onValidateQuestions}
        questionsValidated={questionsValidated}
        isEditing={isEditing}
        onEditContribution={onEditContribution}
        invitations={invitations}
      />
    </>
  );
};

export default ChapterDetailsLuxe;
