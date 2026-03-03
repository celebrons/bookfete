// C:\Users\USER\bookfete\frontend\src\components\book\chapters\Step4Cloture.js
import React, { useEffect, useState } from 'react';
import { supabase } from '../../../services/supabaseClient';
import '../BookLuxe.css';

const CHAPTER_STATE_EMAIL = '__chapter_state__@system.local';

const Step4Cloture = ({
  chapter,
  user,
  book,
  questionsValidated,
  hasContributed,
  invitations,
  onUpdateChapter
}) => {
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState(null);

  const isOrganizer = user && book && user.id === book.owner_id;
  const contributionsClosed = chapter?.contributionsClosed || false;
  const questionsReady = Boolean(chapter?.questions_validated ?? questionsValidated);
  const contributionReady = Boolean(chapter?.hasContributed ?? hasContributed);
  const fallbackVisibleContributions = Array.isArray(chapter?.contributions)
    ? chapter.contributions.filter(
        (contribution) =>
          contribution.contributor_email !== user?.email &&
          contribution.contributor_email !== CHAPTER_STATE_EMAIL &&
          contribution.is_finalized !== false
      )
    : [];
  const fallbackInvitationsCount = typeof chapter?.invitationsCount === 'number'
    ? chapter.invitationsCount
    : (
        Array.isArray(chapter?.chapter_invites)
          ? chapter.chapter_invites.length
          : (Array.isArray(invitations) ? invitations.length : 0)
      );
  const invitationsCount = typeof summary?.invitationsCount === 'number'
    ? summary.invitationsCount
    : fallbackInvitationsCount;
  const invitationsReady = invitationsCount > 0;
  const isClosed = chapter?.isChapterClosed || false;
  const visibleContributionsCount = typeof summary?.receivedCount === 'number'
    ? summary.receivedCount
    : fallbackVisibleContributions.length;
  const visibleContributions = Array.from({ length: visibleContributionsCount });
  const pendingValidationCount = typeof summary?.pendingValidationCount === 'number'
    ? summary.pendingValidationCount
    : fallbackVisibleContributions.filter(
        (contribution) => !contribution.approved && !contribution.needs_revision
      ).length;

  useEffect(() => {
    const loadSummary = async () => {
      if (!chapter?.id) {
        setSummary(null);
        return;
      }

      try {
        const [{ data: invitesData, error: invitesError }, { data: contributionsData, error: contributionsError }] = await Promise.all([
          supabase
            .from('chapter_invites')
            .select('accepted, contributed')
            .eq('chapter_id', chapter.id),
          supabase
            .from('contributions')
            .select('contributor_email, approved, needs_revision, is_finalized')
            .eq('chapter_id', chapter.id)
        ]);

        if (invitesError) throw invitesError;
        if (contributionsError) throw contributionsError;

        const externalContributions = (contributionsData || []).filter(
          (contribution) =>
            contribution.contributor_email !== user?.email &&
            contribution.contributor_email !== CHAPTER_STATE_EMAIL &&
            contribution.is_finalized !== false
        );
        const respondedInvitesCount = (invitesData || []).filter(
          (invite) => invite.accepted || invite.contributed
        ).length;

        setSummary({
          invitationsCount: (invitesData || []).length,
          receivedCount: Math.max(externalContributions.length, respondedInvitesCount),
          pendingValidationCount: externalContributions.filter(
            (contribution) => !contribution.approved && !contribution.needs_revision
          ).length
        });
      } catch (loadError) {
        console.error('Erreur chargement recap chapitre:', loadError);
        setSummary(null);
      }
    };

    loadSummary();
  }, [chapter?.id, chapter?.workflowState, user?.email]);

  const handleClose = async () => {
    if (isClosed) {
      return;
    }

    if (!window.confirm('Voulez-vous vraiment clôturer ce chapitre ?')) return;

    setClosing(true);
    setError('');

    try {
      if (typeof onUpdateChapter !== 'function') {
        throw new Error('Mise a jour du chapitre indisponible');
      }

      await onUpdateChapter(chapter.id, { status: 'closed' });
      
      alert('✅ Chapitre clôturé');
      
    } catch (error) {
      console.error('❌ Erreur clôture:', error);
      setError(error.message);
    } finally {
      setClosing(false);
    }
  };

  if (!isOrganizer) {
    return (
      <div className="workflow-content" style={{ textAlign: 'center', color: '#999' }}>
        Seul l'organisateur peut clôturer le chapitre
      </div>
    );
  }

  return (
    <div className="workflow-content">
      {error && (
        <div style={{ color: '#dc3545', marginBottom: '15px' }}>❌ {error}</div>
      )}

      <div
        className="card"
        style={{
          marginBottom: 'var(--space-lg)',
          background: isClosed ? '#e9f7ef' : '#fcfbf8',
          borderColor: isClosed ? '#d9eadf' : 'var(--mist)'
        }}
      >
        <p style={{ margin: 0, color: 'var(--ink)' }}>
          {isClosed
            ? 'Le chapitre est clôturé.'
            : 'Vérifiez le récapitulatif ci-dessous avant de clore définitivement le chapitre.'}
        </p>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <h4>Récapitulatif du chapitre</h4>
        <ul style={{ listStyle: 'none', padding: 0 }}>
          <li style={{ marginBottom: '8px' }}>
            {questionsReady ? '✅' : '❌'} Questions validées
          </li>
          <li style={{ marginBottom: '8px' }}>
            {contributionReady ? '✅' : '❌'} Contribution personnelle
          </li>
          <li style={{ marginBottom: '8px' }}>
            {invitationsReady ? '✅' : '❌'} Invitations envoyées ({invitationsCount})
          </li>
          <li style={{ marginBottom: '8px' }}>
            {visibleContributions.length > 0 ? '✅' : '❌'} Contributions reçues ({visibleContributions.length})
          </li>
          <li style={{ marginBottom: '8px' }}>
            {pendingValidationCount === 0 ? '✅' : '❌'} En attente de validation ({pendingValidationCount})
          </li>
          <li style={{ marginBottom: '8px' }}>
            {contributionsClosed ? '✅' : '❌'} Contributions closes
          </li>
        </ul>
      </div>

      <button
        onClick={handleClose}
        disabled={!isOrganizer || closing || isClosed}
        className="btn btn-primary"
        style={{
          width: '100%',
          background: isClosed ? '#1f7a3d' : '#dc3545',
          cursor: (!isOrganizer || isClosed) ? 'not-allowed' : 'pointer',
          opacity: (!isOrganizer || closing || isClosed) ? 0.8 : 1
        }}
      >
        {closing ? 'Clôture...' : (isClosed ? 'Chapitre clôturé' : 'Clore le chapitre')}
      </button>
    </div>
  );
};

export default Step4Cloture;
