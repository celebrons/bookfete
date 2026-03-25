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

  const isSoloMode = Boolean(book?.cover_config?.soloMode);
  const totalSteps = isSoloMode ? 3 : 4;
  const amorceValidated = Boolean(chapter?.amorce_validated || chapter?.questions_validated || questionsValidated);
  const baseCompletedSteps = [
    amorceValidated,
    Boolean(chapter?.isFinalized),
    ...(isSoloMode ? [] : [Boolean(chapter?.contributionsClosed)]),
    Boolean(chapter?.isChapterClosed)
  ].filter(Boolean).length;
  const completedSteps = chapter?.isChapterClosed ? totalSteps : baseCompletedSteps;
  const progressPercent = Math.round((completedSteps / totalSteps) * 100);

  return (
    <>
      <div className="chapter-progress-wrap" role="status" aria-live="polite">
        <div className="chapter-progress-row">
          <span className="chapter-progress-label">Progression du chapitre</span>
          <span className="chapter-progress-value">{progressPercent}%</span>
        </div>
        <div className="chapter-progress-track" aria-hidden="true">
          <span
            className="chapter-progress-fill"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      <p className="chapter-subtitle">
        ALBUM PRESTIGE | {chaptersCount} CHAPITRES | {completedSteps}/{totalSteps} ETAPES
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
        amorceValidated={amorceValidated}
      />
    </>
  );
};

export default ChapterDetailsLuxe;
