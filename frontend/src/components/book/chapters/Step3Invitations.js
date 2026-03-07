import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../../services/supabaseClient';
import ChapterInvitationsLuxe from './ChapterInvitationsLuxe';
import InviteSelectorLuxe from '../contributors/InviteSelectorLuxe';
import '../BookLuxe.css';

const CHAPTER_STATE_EMAIL = '__chapter_state__@system.local';
const CHAPTER_DRAFT_EMAIL = '__chapter_draft__@system.local';

const Step3Invitations = ({
  chapter,
  user,
  book,
  onLoadContributions,
  hasContributed,
  onUpdateChapter
}) => {
  const [invitations, setInvitations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [closing, setClosing] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [showInviteSelector, setShowInviteSelector] = useState(false);
  const [inviteRefreshToken, setInviteRefreshToken] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [forceClosed, setForceClosed] = useState(false);
  const [liveSummary, setLiveSummary] = useState({
    invitationsCount: 0,
    respondedInvitesCount: 0,
    contributionsReceivedCount: 0,
    pendingValidationCount: 0,
    nonRespondedCount: 0,
    contributionsClosed: false
  });
  const [summaryLoaded, setSummaryLoaded] = useState(false);
  const [checkingInviteList, setCheckingInviteList] = useState(false);

  const isOrganizer = user && book && user.id === book.owner_id;
  const contributionsClosed = (chapter?.contributionsClosed || false) || liveSummary.contributionsClosed || forceClosed;
  const chapterLocked = chapter?.isChapterClosed || false;

  useEffect(() => {
    setError('');
    setNotice('');

    if (!chapter?.id) {
      setInvitations([]);
      setLoading(false);
      setSummaryLoaded(false);
      setForceClosed(false);
      setLiveSummary({
        invitationsCount: 0,
        respondedInvitesCount: 0,
        contributionsReceivedCount: 0,
        pendingValidationCount: 0,
        nonRespondedCount: 0,
        contributionsClosed: false
      });
      return;
    }

    const chapterInvites = Array.isArray(chapter?.chapter_invites) ? chapter.chapter_invites : [];
    const respondedInvitesCount = chapterInvites.filter(
      (invite) => invite.accepted || invite.contributed
    ).length;

    setSummaryLoaded(false);
    setForceClosed(false);
    setInvitations(chapterInvites);
    setLiveSummary({
      invitationsCount: chapterInvites.length,
      respondedInvitesCount,
      contributionsReceivedCount: typeof chapter?.contributionsCount === 'number'
        ? chapter.contributionsCount
        : Math.max(respondedInvitesCount, 0),
      pendingValidationCount: 0,
      nonRespondedCount: Math.max(chapterInvites.length - respondedInvitesCount, 0),
      contributionsClosed: Boolean(chapter?.contributionsClosed)
    });
    setLoading(false);
  }, [chapter?.id, chapter?.chapter_invites, chapter?.contributionsCount, chapter?.contributionsClosed]);

  useEffect(() => {
    if (!forceClosed || !chapter?.contributionsClosed) {
      return;
    }

    setForceClosed(false);
  }, [forceClosed, chapter?.contributionsClosed]);

  const loadSnapshot = useCallback(async () => {
    if (!chapter?.id) {
      return;
    }

    try {
      const [{ data: invitesData, error: invitesError }, { data: contributionsData, error: contributionsError }] = await Promise.all([
        supabase
          .from('chapter_invites')
          .select('*')
          .eq('chapter_id', chapter.id),
        supabase
          .from('contributions')
          .select('contributor_email, approved, needs_revision, is_finalized, message, created_at')
          .eq('chapter_id', chapter.id)
      ]);

      if (invitesError) throw invitesError;
      if (contributionsError) throw contributionsError;

      const invites = invitesData || [];
      setInvitations(invites);

      const respondedInvitesCount = invites.filter(
        (invite) => invite.accepted || invite.contributed
      ).length;
      const nonRespondedCount = invites.filter(
        (invite) => !invite.accepted && !invite.contributed
      ).length;
      const visibleContributions = (contributionsData || []).filter(
        (contribution) =>
          contribution.contributor_email !== user?.email &&
          contribution.contributor_email !== CHAPTER_STATE_EMAIL &&
          contribution.contributor_email !== CHAPTER_DRAFT_EMAIL &&
          contribution.is_finalized !== false
      );
      const latestStateContribution = (contributionsData || [])
        .filter((contribution) => contribution.contributor_email === CHAPTER_STATE_EMAIL)
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0] || null;
      const workflowState = String(latestStateContribution?.message || '').trim().toLowerCase();
      const isClosedByWorkflow = workflowState === 'contributions_closed' || workflowState === 'closed';

      setLiveSummary({
        invitationsCount: invites.length,
        respondedInvitesCount,
        contributionsReceivedCount: Math.max(visibleContributions.length, respondedInvitesCount),
        pendingValidationCount: visibleContributions.filter(
          (contribution) => !contribution.approved && !contribution.needs_revision
        ).length,
        nonRespondedCount,
        contributionsClosed: isClosedByWorkflow
      });
      setSummaryLoaded(true);
    } catch (loadError) {
      console.error('Error loading invitations summary:', loadError);
    }
  }, [chapter?.id, user?.email]);

  useEffect(() => {
    if (!chapter?.id) {
      return undefined;
    }

    loadSnapshot();

    const realtimeChannel = supabase
      .channel(`step3-live-${chapter.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chapter_invites', filter: `chapter_id=eq.${chapter.id}` },
        () => {
          loadSnapshot();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'contributions', filter: `chapter_id=eq.${chapter.id}` },
        () => {
          loadSnapshot();
        }
      )
      .subscribe();

    const intervalId = setInterval(() => {
      loadSnapshot();
    }, 4000);

    return () => {
      clearInterval(intervalId);
      supabase.removeChannel(realtimeChannel);
    };
  }, [chapter?.id, loadSnapshot]);

  useEffect(() => {
    if (!chapterLocked) {
      return;
    }

    setShowInviteSelector(false);
    setShowCloseModal(false);
  }, [chapterLocked]);

  const loadInvitations = async () => {
    try {
      setLoading(true);
      const { data } = await supabase
        .from('chapter_invites')
        .select('*')
        .eq('chapter_id', chapter.id);
      setInvitations(data || []);
      setError('');
    } catch (loadError) {
      console.error('Error loading invitations:', loadError);
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  };

  const finalizedContributions = Array.isArray(chapter?.contributions)
    ? chapter.contributions.filter(
        (contribution) =>
          contribution.contributor_email !== user?.email &&
          contribution.contributor_email !== CHAPTER_STATE_EMAIL &&
          contribution.contributor_email !== CHAPTER_DRAFT_EMAIL &&
          contribution.is_finalized !== false
      )
    : [];

  const pendingValidationCount = summaryLoaded
    ? liveSummary.pendingValidationCount
    : finalizedContributions.filter(
        (contribution) => !contribution.approved && !contribution.needs_revision
      ).length;

  const respondedInvitesCount = summaryLoaded
    ? liveSummary.respondedInvitesCount
    : invitations.filter(
        (invite) => invite.accepted || invite.contributed
      ).length;

  const contributionsReceivedCount = summaryLoaded
    ? liveSummary.contributionsReceivedCount
    : (
        typeof chapter?.contributionsCount === 'number'
          ? chapter.contributionsCount
          : Math.max(finalizedContributions.length, respondedInvitesCount)
      );

  const nonRespondedCount = summaryLoaded
    ? liveSummary.nonRespondedCount
    : invitations.filter(
        (invite) => !invite.accepted && !invite.contributed
      ).length;

  const openCloseModal = () => {
    if (chapterLocked || contributionsClosed || typeof onUpdateChapter !== 'function') {
      return;
    }

    setShowCloseModal(true);
  };

  const handleCloseContributions = async () => {
    if (chapterLocked || contributionsClosed || typeof onUpdateChapter !== 'function') {
      return;
    }

    setClosing(true);
    setError('');
    setNotice('');

    try {
      await onUpdateChapter(chapter.id, { status: 'contributions_closed' });
      setForceClosed(true);
      setLiveSummary((previous) => ({
        ...previous,
        contributionsClosed: true
      }));
      await loadSnapshot();
      setShowCloseModal(false);
      setNotice('Contributions cloturees pour ce chapitre.');
    } catch (loadError) {
      console.error('Error closing contributions:', loadError);
      setError(loadError.message);
    } finally {
      setClosing(false);
    }
  };

  const handleInvitesSent = async () => {
    setInviteRefreshToken((prev) => prev + 1);
    await Promise.all([loadInvitations(), loadSnapshot()]);
  };

  const handleOpenInviteSelector = async () => {
    if (chapterLocked || contributionsClosed || !book?.id) {
      return;
    }

    setError('');
    setNotice('');
    setCheckingInviteList(true);

    try {
      const { count, error: countError } = await supabase
        .from('book_contributors')
        .select('id', { count: 'exact', head: true })
        .eq('book_id', book.id);

      if (countError) {
        throw countError;
      }

      if (!count || count < 1) {
        setNotice("Merci d'ajouter des contributeurs dans l'onglet contributeurs, ils apparaitront ensuite ici.");
        return;
      }

      setShowInviteSelector(true);
    } catch (loadError) {
      console.error('Error checking contributors list:', loadError);
      setError('Impossible de charger la liste des contributeurs.');
    } finally {
      setCheckingInviteList(false);
    }
  };

  if (!hasContributed) {
    return (
      <div className="workflow-content" style={{ textAlign: 'center', padding: '20px', color: '#999' }}>
        <p>Completez d'abord votre contribution personnelle</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="workflow-content" style={{ textAlign: 'center', padding: '20px', color: '#999' }}>
        <p>Chargement des invitations...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="workflow-content">
        <div className="luxe-feedback-banner is-error">{error}</div>
      </div>
    );
  }

  return (
    <div className="workflow-content">
      {notice && (
        <div className="luxe-feedback-banner is-success">{notice}</div>
      )}

      {chapterLocked && (
        <div className="luxe-feedback-banner is-info">
          Chapitre verrouille: les invitations et contributions ne sont plus modifiables.
        </div>
      )}

      {isOrganizer && (
        <div style={{ display: 'flex', gap: 'var(--space-sm)', marginBottom: '15px', flexWrap: 'wrap' }}>
          <button
            onClick={handleOpenInviteSelector}
            disabled={chapterLocked || contributionsClosed || !book?.id || checkingInviteList}
            className="btn btn-outline"
            style={{ flex: 1, minWidth: '190px' }}
          >
            {checkingInviteList ? 'Verification...' : 'Inviter des contributeurs'}
          </button>
          <button
            onClick={async () => {
              await loadSnapshot();
              onLoadContributions(chapter.id);
            }}
            className="btn btn-outline"
            style={{ flex: 1, minWidth: '170px' }}
          >
            Voir les contributions ({contributionsReceivedCount})
          </button>
          <button
            onClick={openCloseModal}
            disabled={chapterLocked || closing || contributionsClosed}
            className="btn btn-primary"
            style={{
              flex: 1,
              minWidth: '190px',
              background: contributionsClosed ? '#1f7a3d' : '#dc3545',
              opacity: (chapterLocked || closing || contributionsClosed) ? 0.8 : 1
            }}
          >
            {closing ? 'Cloture...' : (contributionsClosed ? 'Contributions cloturees' : 'Clore les contributions')}
          </button>
        </div>
      )}

      <ChapterInvitationsLuxe
        chapterId={chapter.id}
        bookId={book?.id}
        isClosed={contributionsClosed}
        refreshToken={inviteRefreshToken}
      />

      {showCloseModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '520px' }}>
            <h3 className="modal-title">Clore les contributions</h3>
            <p className="modal-text" style={{ marginBottom: 'var(--space-lg)' }}>
              Voici le recapitulatif avant fermeture des contributions de ce chapitre.
            </p>

            <div
              className="card"
              style={{
                marginBottom: 'var(--space-lg)',
                background: '#fcfbf8',
                borderColor: 'var(--mist)',
                boxShadow: 'none'
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginBottom: '10px',
                  color: 'var(--ink)'
                }}
              >
                <span>En attente de validation</span>
                <strong>{pendingValidationCount}</strong>
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginBottom: '10px',
                  color: 'var(--ink)'
                }}
              >
                <span>Non repondues</span>
                <strong>{nonRespondedCount}</strong>
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  color: 'var(--ink)'
                }}
              >
                <span>Contributions recues</span>
                <strong>{contributionsReceivedCount}</strong>
              </div>
            </div>

            <div
              className="card"
              style={{
                marginBottom: 'var(--space-lg)',
                background: '#fff8e1',
                borderColor: '#ffe08a',
                boxShadow: 'none'
              }}
            >
              <p style={{ margin: 0, color: '#8a6d00' }}>
                Voulez-vous valider quand meme ?
              </p>
            </div>

            <div className="modal-actions">
              <button
                onClick={() => setShowCloseModal(false)}
                className="modal-btn modal-btn-secondary"
                disabled={closing}
              >
                Annuler
              </button>
              <button
                onClick={handleCloseContributions}
                className="modal-btn modal-btn-primary"
                disabled={closing}
              >
                {closing ? 'Cloture...' : 'Confirmer la cloture'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showInviteSelector && book?.id && (
        <InviteSelectorLuxe
          chapterId={chapter.id}
          bookId={book.id}
          onClose={() => setShowInviteSelector(false)}
          onInvitesSent={handleInvitesSent}
        />
      )}
    </div>
  );
};

export default Step3Invitations;
