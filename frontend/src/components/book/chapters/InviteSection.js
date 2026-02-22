// C:\Users\USER\bookfete\frontend\src\components\book\chapters\InviteSection.js
import React from 'react';

const InviteSection = ({ chapterId, onCopyInviteLink, inviteSuccess }) => {
  return (
    <div style={{
      background: '#f3e8ff',
      padding: '1.5rem',
      borderRadius: '10px',
      border: '1px solid #764ba2',
      textAlign: 'center'
    }}>
      <h3 style={{ margin: '0 0 0.5rem', color: '#764ba2' }}>Inviter des proches à contribuer</h3>
      <p style={{ marginBottom: '1rem', color: '#666' }}>
        Générez un lien d'invitation unique à partager avec vos proches.
      </p>
      
      <button
        onClick={(e) => onCopyInviteLink(chapterId, e)}
        style={{
          padding: '1rem 2rem',
          background: '#764ba2',
          color: 'white',
          border: 'none',
          borderRadius: '5px',
          fontSize: '1rem',
          fontWeight: 'bold',
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.5rem'
        }}
      >
        🔗 Générer un lien d'invitation
      </button>
      
      {inviteSuccess === chapterId && (
        <p style={{ color: '#28a745', marginTop: '1rem' }}>
          ✅ Lien copié dans le presse-papier !
        </p>
      )}
    </div>
  );
};

export default InviteSection;