// C:\Users\USER\bookfete\frontend\src\components\book\chapters\InviteSectionLuxe.js
import React from 'react';
import '../BookLuxe.css';

const InviteSectionLuxe = ({ chapterId, onCopyInviteLink, inviteSuccess }) => {
  return (
    <div className="card" style={{
      background: 'linear-gradient(135deg, var(--gold-light) 0%, var(--silk) 100%)',
      borderColor: 'var(--gold)',
      textAlign: 'center'
    }}>
      <h3 style={{ margin: '0 0 var(--space-sm)', color: 'var(--gold)' }}>
        Inviter des proches à contribuer
      </h3>
      <p style={{ marginBottom: 'var(--space-lg)', color: 'var(--text-light)' }}>
        Générez un lien d'invitation unique à partager avec vos proches.
      </p>
      
      <button
        onClick={(e) => onCopyInviteLink(chapterId, e)}
        className="btn btn-primary"
        style={{ padding: '12px 24px' }}
      >
        🔗 Générer un lien d'invitation
      </button>
      
      {inviteSuccess === chapterId && (
        <p style={{ color: 'var(--gold)', marginTop: 'var(--space-md)' }}>
          ✅ Lien copié dans le presse-papier !
        </p>
      )}
    </div>
  );
};

export default InviteSectionLuxe;