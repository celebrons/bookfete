import React, { useEffect, useState } from 'react';
import { supabase } from '../../../services/supabaseClient';
import ChapterInvitationsLuxe from './ChapterInvitationsLuxe';
import InviteSelectorLuxe from '../contributors/InviteSelectorLuxe';
import '../BookLuxe.css';

const CHAPTER_STATE_EMAIL = '__chapter_state__@system.local';

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

  const isOrganizer = user && book && user.id === book.owner_id;
  const contributionsClosed = chapter?.contributionsClosed || false;

  useEffect(() => {
    loadInvitations();
  }, [chapter.id]);

  const loadInvitations = async () => {
    try {
      setLoading(true);
      const { data } = await supabase
        .from('chapter_invites')
        .select('*')
        .eq('chapter_id', chapter.id);
      setInvitations(data || []);
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
          contribution.is_finalized !== false
      )
    : [];

  const pendingValidationCount = finalizedContributions.filter(
    (contribution) => !contribution.approved && !contribution.needs_revision
  ).length;

  const respondedCount = invitations.filter(
    (invite) => invite.accepted || invite.contributed
  ).length;

  const nonRespondedCount = invitations.filter(
    (invite) => !invite.accepted && !invite.contributed
  ).length;

  const openCloseModal = () => {
    if (contributionsClosed || typeof onUpdateChapter !== 'function') {
      return;
    }

    setShowCloseModal(true);
  };

  const handleCloseContributions = async () => {
    if (contributionsClosed || typeof onUpdateChapter !== 'function') {
      return;
    }

    setClosing(true);
    setError('');

    try {
      await onUpdateChapter(chapter.id, { status: 'contributions_closed' });
      setShowCloseModal(false);
      alert('Contributions cloturees');
    } catch (loadError) {
      console.error('Error closing contributions:', loadError);
      setError(loadError.message);
    } finally {
      setClosing(false);
    }
  };

  const handleInvitesSent = async () => {
    setInviteRefreshToken((prev) => prev + 1);
    await loadInvitations();
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
      <div className="workflow-content" style={{ color: '#dc3545' }}>
        {error}
      </div>
    );
  }

  return (
    <div className="workflow-content">
      {isOrganizer && (
        <div style={{ display: 'flex', gap: 'var(--space-sm)', marginBottom: '15px', flexWrap: 'wrap' }}>
          <button
            onClick={() => setShowInviteSelector(true)}
            disabled={contributionsClosed || !book?.id}
            className="btn btn-outline"
            style={{ flex: 1, minWidth: '190px' }}
          >
            Inviter des contributeurs
          </button>
          <button
            onClick={() => onLoadContributions(chapter.id)}
            className="btn btn-outline"
            style={{ flex: 1, minWidth: '170px' }}
          >
            Voir les contributions ({respondedCount})
          </button>
          <button
            onClick={openCloseModal}
            disabled={closing || contributionsClosed}
            className="btn btn-primary"
            style={{
              flex: 1,
              minWidth: '190px',
              background: contributionsClosed ? '#1f7a3d' : '#dc3545',
              opacity: (closing || contributionsClosed) ? 0.8 : 1
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
                <strong>{respondedCount}</strong>
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
