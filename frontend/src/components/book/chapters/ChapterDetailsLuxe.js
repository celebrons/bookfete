// C:\Users\USER\bookfete\frontend\src\components\book\chapters\ChapterDetailsLuxe.js
import React, { useState, useEffect } from 'react';
import { supabase } from '../../../services/supabaseClient';
import ChapterWorkflowLuxe from './ChapterWorkflowLuxe';
import '../BookLuxe.css';

const CHAPTER_STATE_EMAIL = '__chapter_state__@system.local';

const ChapterDetailsLuxe = ({
  chapter,
  chaptersCount,
  onUpdateChapter,
  onSaveContribution,
  onFinalizeContribution,
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
  const [moderationCount, setModerationCount] = useState(chapter?.contributionsCount || 0);

  useEffect(() => {
    if (chapter?.id) {
      setLoading(false);
    }
  }, [chapter?.id]);

  useEffect(() => {
    const loadModerationCount = async () => {
      if (!chapter?.id) {
        setModerationCount(0);
        return;
      }

      const fallbackCount = chapter?.contributionsCount || 0;
      setModerationCount(fallbackCount);

      try {
        const [{ data: invitesData, error: invitesError }, { data: contributionsData, error: contributionsError }] = await Promise.all([
          supabase
            .from('chapter_invites')
            .select('accepted, contributed')
            .eq('chapter_id', chapter.id),
          supabase
            .from('contributions')
            .select('contributor_email, is_finalized')
            .eq('chapter_id', chapter.id)
        ]);

        if (invitesError) throw invitesError;
        if (contributionsError) throw contributionsError;

        const externalContributionsCount = (contributionsData || []).filter(
          (contribution) =>
            contribution.contributor_email !== user?.email &&
            contribution.contributor_email !== CHAPTER_STATE_EMAIL &&
            contribution.is_finalized !== false
        ).length;
        const respondedInvitesCount = (invitesData || []).filter(
          (invite) => invite.accepted || invite.contributed
        ).length;

        setModerationCount(
          Math.max(fallbackCount, externalContributionsCount, respondedInvitesCount)
        );
      } catch (countError) {
        console.error('Erreur chargement compteur contributions:', countError);
      }
    };

    loadModerationCount();
  }, [chapter?.id, chapter?.workflowState, chapter?.contributionsCount, user?.email]);

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 'var(--space-xxl)' }}>
        <div className="spinner" style={{
          border: '2px solid var(--mist)',
          borderTop: '2px solid var(--gold)',
          borderRadius: '50%',
          width: '40px',
          height: '40px',
          animation: 'spin 1s linear infinite',
          margin: '0 auto var(--space-md)'
        }} />
        <p className="body-text">Chargement...</p>
      </div>
    );
  }

  return (
    <>
      <div className="chapter-details-header">
        <h2>{chapter.title}</h2>
        <button
          onClick={() => onLoadContributions(chapter.id)}
          className="btn-moderate"
        >
          <span>👁️</span> Voir les contributions ({moderationCount})
        </button>
      </div>
      
      <p className="chapter-subtitle">
        ALBUM PRESTIGE • {chaptersCount} CHAPITRES
      </p>

      <ChapterWorkflowLuxe
        key={chapter.id}
        chapter={chapter}
        chaptersCount={chaptersCount}
        onUpdateChapter={onUpdateChapter}
        onSaveContribution={onSaveContribution}
        onFinalizeContribution={onFinalizeContribution}
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
