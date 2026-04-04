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
  bookTitle,
  chapterTitle,
  onBackToStructure,
  onOpenContributors,
  onOpenConfig,
  questionsValidated,
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

  const amorceValidated = Boolean(chapter?.amorce_validated || chapter?.questions_validated || questionsValidated);

  return (
    <>
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
        bookTitle={bookTitle}
        chapterTitle={chapterTitle}
        onBackToStructure={onBackToStructure}
        onOpenContributors={onOpenContributors}
        onOpenConfig={onOpenConfig}
        amorceValidated={amorceValidated}
      />
    </>
  );
};

export default ChapterDetailsLuxe;
