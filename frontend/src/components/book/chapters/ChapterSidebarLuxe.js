// C:\Users\USER\bookfete\frontend\src\components\book\chapters\ChapterSidebarLuxe.js
import React from 'react';
import Tooltip from '../../ui/Tooltip';
import '../BookLuxe.css';

const ChapterSidebarLuxe = ({
  chapters,
  book,
  selectedType,
  selectedItem,
  onSelectItem,
  onAddChapter,
  onEditChapter,
  onEditQuestions,
  onDeleteClick,
  onCopyInviteLink,
  inviteSuccess,
  deleteConfirm,
  getStatusColor,
  coverConfig,
  contributors,
  showGuide,
  setShowGuide
}) => {
  
  const handleInviteClick = (chapter, e) => {
    e.stopPropagation();
    console.log('📌 Chapitre cliqué pour invitation:', chapter);
    
    if (!chapter || !chapter.id) {
      console.error('❌ Erreur: chapitre invalide', chapter);
      return;
    }
    
    onCopyInviteLink(chapter, e);
  };

  return (
    <div className="sidebar">
      {/* En-tête */}
      <div className="sidebar-header">
        <h3>📖 Structure du livre</h3>
        <button onClick={onAddChapter} className="btn-add-chapter">
          <span>+</span>
          Chapitre
        </button>
      </div>

      {/* Zone scrollable */}
      <div className="sidebar-content">
        {/* CHAPITRES */}
        {chapters.map((chapter, index) => (
          <div
            key={chapter.id}
            onClick={() => onSelectItem(chapter, 'chapter')}
            className={`chapter-item ${selectedType === 'chapter' && selectedItem?.id === chapter.id ? 'selected' : ''}`}
            style={{
              opacity: deleteConfirm?.id === chapter.id ? 0.5 : 1
            }}
          >
            <div className="chapter-header">
              <div className="chapter-title">
                {index + 1}. {chapter.title}
              </div>
              
              {/* Actions */}
              <div className="chapter-actions">
                <Tooltip text="Modifier le titre">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onEditChapter(chapter);
                    }}
                    className="chapter-action-btn"
                  >
                    ✎
                  </button>
                </Tooltip>
                
                <Tooltip text="Modifier les questions">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onEditQuestions(chapter);
                    }}
                    className="chapter-action-btn"
                  >
                    ?
                  </button>
                </Tooltip>
                
                <Tooltip text="Inviter des contributeurs">
                  <button
                    onClick={(e) => handleInviteClick(chapter, e)}
                    className="chapter-action-btn"
                    style={{
                      color: inviteSuccess === chapter.id ? 'var(--gold)' : 'var(--text-light)'
                    }}
                  >
                    👥
                  </button>
                </Tooltip>
                
                <Tooltip text="Supprimer">
                  <button
                    onClick={(e) => onDeleteClick(chapter, e)}
                    className="chapter-action-btn"
                  >
                    🗑
                  </button>
                </Tooltip>
              </div>
            </div>

            {/* Stats */}
            <div className="chapter-stats">
              <span>💬 {chapter.contributions?.[0]?.count || 0}</span>
              <span>📝 {chapter.questions_ia?.length || 0} questions</span>
            </div>

            {/* Badge de statut */}
            {chapter.is_default && (
              <span style={{
                position: 'absolute',
                top: 'var(--space-xs)',
                right: 'var(--space-xs)',
                background: 'var(--gold-light)',
                color: 'var(--gold)',
                padding: '2px 6px',
                borderRadius: 'var(--radius)',
                fontSize: '10px',
                fontWeight: '600'
              }}>
                Suggestion
              </span>
            )}

            {/* Barre de statut latérale */}
            <div
              className="chapter-status"
              style={{ background: getStatusColor(chapter.contributions) }}
            />

            {/* Message de succès d'invitation */}
            {inviteSuccess === chapter.id && (
              <div style={{
                position: 'absolute',
                top: '-8px',
                right: '0',
                background: 'var(--gold)',
                color: 'white',
                padding: '2px 8px',
                borderRadius: 'var(--radius)',
                fontSize: '10px',
                fontWeight: '600'
              }}>
                Invitation envoyée !
              </div>
            )}
          </div>
        ))}

        {/* COUVERTURE (optionnelle) */}
        <div
          onClick={() => onSelectItem({ type: 'cover' }, 'cover')}
          className={`chapter-item ${selectedType === 'cover' ? 'selected' : ''}`}
        >
          <div className="chapter-header">
            <div className="chapter-title">
              📕 Couverture
            </div>
          </div>
          <div className="chapter-stats">
            <span>{coverConfig?.template || 'Classique'}</span>
          </div>
        </div>

        {/* 4ÈME COUVERTURE (optionnelle) */}
        <div
          onClick={() => onSelectItem({ type: 'backcover' }, 'backcover')}
          className={`chapter-item ${selectedType === 'backcover' ? 'selected' : ''}`}
        >
          <div className="chapter-header">
            <div className="chapter-title">
              📘 4ème couverture
            </div>
          </div>
          <div className="chapter-stats">
            <span>{contributors.length} contributeurs</span>
          </div>
        </div>
      </div>

      {/* Guide rapide */}
      {showGuide && (
        <div className="guide-card">
          <button onClick={() => setShowGuide(false)} className="guide-close">✕</button>
          <div className="guide-title">✨ Comment ça marche ?</div>
          <ul className="guide-steps">
            <li><strong>1. Ajoutez des contributeurs</strong> dans l'onglet "Contributeurs"</li>
            <li><strong>2. Invitez-les</strong> chapitre par chapitre</li>
            <li><strong>3. Collectez</strong> les témoignages</li>
            <li><strong>4. Lancez la rédaction IA</strong> quand tout est prêt</li>
          </ul>
          <button
            onClick={() => setShowGuide(false)}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--gold)',
              cursor: 'pointer',
              fontSize: '12px',
              textDecoration: 'underline',
              width: '100%',
              textAlign: 'center'
            }}
          >
            Masquer le guide
          </button>
        </div>
      )}
      
      {!showGuide && (
        <button
          onClick={() => setShowGuide(true)}
          style={{
            marginTop: 'var(--space-md)',
            background: 'none',
            border: 'none',
            color: 'var(--gold)',
            cursor: 'pointer',
            fontSize: '12px',
            textDecoration: 'underline',
            width: '100%',
            textAlign: 'center'
          }}
        >
          Afficher le guide
        </button>
      )}
    </div>
  );
};

export default ChapterSidebarLuxe;