// C:\Users\USER\bookfete\frontend\src\components\book\chapters\ChapterSidebar.js
import React from 'react';
import Tooltip from '../../ui/Tooltip';

const ChapterSidebar = ({
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

  // Calculer la progression d'un chapitre
  const calculateProgress = (chapter) => {
    // Étape 1: Questions validées ? (25%)
    // Étape 2: Organisateur a contribué ? (25%)
    // Étape 3: Invitations envoyées ? (25%)
    // Étape 4: Contributions reçues/validées ? (25%)

    let progress = 0;
    
    // Étape 1: Questions validées
    if (chapter.questions_validated) progress += 25;
    
    // Étape 2: Organisateur a contribué
    if (chapter.hasOrganizerContributed) progress += 25;
    
    // Étape 3: Au moins une invitation envoyée
    if (chapter.invitationCount && chapter.invitationCount > 0) progress += 25;
    
    // Étape 4: Au moins une contribution validée
    if (chapter.validatedContributionsCount && chapter.validatedContributionsCount > 0) progress += 25;
    
    return progress;
  };

  return (
    <div style={{ 
      flex: 1,
      maxWidth: '400px',
      background: 'white',
      borderRadius: '10px',
      padding: '1.5rem',
      boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      overflow: 'hidden'
    }}>
      {/* En-tête */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        marginBottom: '1.5rem',
        paddingBottom: '1rem',
        borderBottom: '2px solid #eee',
        flexShrink: 0
      }}>
        <h3 style={{ margin: 0 }}>📖 Structure du livre</h3>
        <button
          onClick={onAddChapter}
          style={{
            padding: '0.5rem 1rem',
            background: '#28a745',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer',
            fontSize: '0.9rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.3rem'
          }}
        >
          + Chapitre
        </button>
      </div>

      {/* Zone scrollable */}
      <div style={{ 
        flex: 1,
        overflowY: 'auto',
        paddingRight: '0.5rem',
        marginRight: '-0.5rem'
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
          
          {/* CHAPITRES */}
          {chapters.map((chapter, index) => {
            const progress = calculateProgress(chapter);
            
            return (
              <div
                key={chapter.id}
                onClick={() => onSelectItem(chapter, 'chapter')}
                style={{
                  padding: '1rem',
                  background: selectedType === 'chapter' && selectedItem?.id === chapter.id ? '#f3e8ff' : '#f8f9fa',
                  border: selectedType === 'chapter' && selectedItem?.id === chapter.id ? '2px solid #764ba2' : '1px solid #e9ecef',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  borderLeft: `4px solid ${getStatusColor(chapter.contributions)}`,
                  position: 'relative',
                  opacity: deleteConfirm?.id === chapter.id ? 0.5 : 1
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    {/* Titre avec pourcentage intégré */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem', flexWrap: 'wrap' }}>
                      <h4 style={{ margin: 0, fontSize: '1rem' }}>
                        {index + 1}. {chapter.title}
                      </h4>
                      
                      {/* Pourcentage à côté du titre */}
                      {progress > 0 && progress < 100 && (
                        <span style={{
                          fontSize: '0.65rem',
                          color: '#764ba2',
                          background: '#f3e8ff',
                          padding: '0.1rem 0.3rem',
                          borderRadius: '3px',
                          fontWeight: '600',
                          lineHeight: '1.2'
                        }}>
                          {progress}%
                        </span>
                      )}
                      {progress === 100 && (
                        <span style={{
                          fontSize: '0.65rem',
                          color: '#28a745',
                          background: '#d4edda',
                          padding: '0.1rem 0.3rem',
                          borderRadius: '3px',
                          fontWeight: '600',
                          lineHeight: '1.2'
                        }}>
                          ✓
                        </span>
                      )}
                      
                      {chapter.is_default && (
                        <span style={{
                          background: '#e8f4fd',
                          color: '#0c5460',
                          padding: '0.2rem 0.5rem',
                          borderRadius: '3px',
                          fontSize: '0.7rem'
                        }}>
                          Suggestion
                        </span>
                      )}
                    </div>
                    
                    {/* Stats compactes */}
                    <div style={{ display: 'flex', gap: '1rem', fontSize: '0.8rem', color: '#666', marginBottom: '0.5rem' }}>
                      <span>💬 {chapter.contributions?.[0]?.count || 0}</span>
                      <span>📝 {chapter.questions_ia?.length || 0} questions</span>
                      {chapter.questions_validated && (
                        <span style={{ color: '#28a745' }}>✓</span>
                      )}
                    </div>

                    {/* Barre de progression discrète */}
                    <div style={{
                      width: '100%',
                      height: '3px',
                      background: '#e9ecef',
                      borderRadius: '2px',
                      overflow: 'hidden',
                      marginTop: '0.3rem'
                    }}>
                      <div style={{
                        width: `${progress}%`,
                        height: '100%',
                        background: progress === 100 ? '#28a745' : '#764ba2',
                        borderRadius: '2px',
                        transition: 'width 0.3s ease'
                      }} />
                    </div>
                  </div>
                  
                  {/* Icônes d'action */}
                  <div style={{ display: 'flex', gap: '0.2rem' }}>
                    <Tooltip text="Modifier le titre">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onEditChapter(chapter);
                        }}
                        style={{
                          padding: '0.2rem 0.4rem',
                          background: 'none',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '0.9rem',
                          color: '#666',
                          opacity: 0.7,
                          transition: 'all 0.2s'
                        }}
                        onMouseEnter={(e) => {
                          e.target.style.opacity = 1;
                          e.target.style.color = '#764ba2';
                        }}
                        onMouseLeave={(e) => {
                          e.target.style.opacity = 0.7;
                          e.target.style.color = '#666';
                        }}
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
                        style={{
                          padding: '0.2rem 0.4rem',
                          background: 'none',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '0.9rem',
                          color: '#666',
                          opacity: 0.7,
                          transition: 'all 0.2s'
                        }}
                        onMouseEnter={(e) => {
                          e.target.style.opacity = 1;
                          e.target.style.color = '#17a2b8';
                        }}
                        onMouseLeave={(e) => {
                          e.target.style.opacity = 0.7;
                          e.target.style.color = '#666';
                        }}
                      >
                        ?
                      </button>
                    </Tooltip>
                    
                    <Tooltip text="Inviter des contributeurs">
                      <button
                        onClick={(e) => handleInviteClick(chapter, e)}
                        style={{
                          padding: '0.2rem 0.4rem',
                          background: 'none',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '0.9rem',
                          color: inviteSuccess === chapter.id ? '#28a745' : '#666',
                          opacity: inviteSuccess === chapter.id ? 1 : 0.7,
                          transition: 'all 0.2s'
                        }}
                        onMouseEnter={(e) => {
                          if (!inviteSuccess === chapter.id) {
                            e.target.style.opacity = 1;
                            e.target.style.color = '#28a745';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!inviteSuccess === chapter.id) {
                            e.target.style.opacity = 0.7;
                            e.target.style.color = '#666';
                          }
                        }}
                      >
                        👥
                      </button>
                    </Tooltip>
                    
                    <Tooltip text="Supprimer">
                      <button
                        onClick={(e) => onDeleteClick(chapter, e)}
                        style={{
                          padding: '0.2rem 0.4rem',
                          background: 'none',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '0.9rem',
                          color: '#666',
                          opacity: 0.7,
                          transition: 'all 0.2s'
                        }}
                        onMouseEnter={(e) => {
                          e.target.style.opacity = 1;
                          e.target.style.color = '#dc3545';
                        }}
                        onMouseLeave={(e) => {
                          e.target.style.opacity = 0.7;
                          e.target.style.color = '#666';
                        }}
                      >
                        🗑
                      </button>
                    </Tooltip>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Guide rapide */}
      {showGuide && (
        <div style={{
          marginTop: '1rem',
          paddingTop: '1rem',
          borderTop: '1px solid #eee',
          flexShrink: 0
        }}>
          <div style={{
            padding: '1rem',
            background: '#f3e8ff',
            borderRadius: '8px',
            border: '1px solid #764ba2'
          }}>
            <h4 style={{ margin: '0 0 0.5rem', color: '#764ba2' }}>✨ Comment ça marche ?</h4>
            <ul style={{ margin: 0, paddingLeft: '1.2rem', color: '#666', fontSize: '0.9rem' }}>
              <li style={{ marginBottom: '0.5rem' }}>
                <strong>1. Ajoutez des contributeurs</strong> dans l'onglet "Contributeurs"
                <Tooltip text="Remplissez votre liste de personnes à inviter">
                  <span style={{ marginLeft: '0.3rem', cursor: 'help', fontSize: '0.9rem' }}>ⓘ</span>
                </Tooltip>
              </li>
              <li style={{ marginBottom: '0.5rem' }}>
                <strong>2. Invitez-les</strong> chapitre par chapitre
                <Tooltip text="Cliquez sur 👥 pour sélectionner qui contribue à ce chapitre">
                  <span style={{ marginLeft: '0.3rem', cursor: 'help', fontSize: '0.9rem' }}>ⓘ</span>
                </Tooltip>
              </li>
              <li style={{ marginBottom: '0.5rem' }}>
                <strong>3. Collectez</strong> les témoignages
              </li>
              <li style={{ marginBottom: '0.5rem' }}>
                <strong>4. Lancez la rédaction IA</strong> quand tout est prêt
              </li>
            </ul>
            <button
              onClick={() => setShowGuide(false)}
              style={{
                marginTop: '0.5rem',
                background: 'none',
                border: 'none',
                color: '#764ba2',
                cursor: 'pointer',
                fontSize: '0.8rem',
                textDecoration: 'underline'
              }}
            >
              Masquer le guide
            </button>
          </div>
        </div>
      )}
      {!showGuide && (
        <button
          onClick={() => setShowGuide(true)}
          style={{
            marginTop: '1rem',
            background: 'none',
            border: 'none',
            color: '#764ba2',
            cursor: 'pointer',
            fontSize: '0.9rem',
            textDecoration: 'underline',
            width: '100%',
            textAlign: 'center',
            flexShrink: 0
          }}
        >
          Afficher le guide
        </button>
      )}
    </div>
  );
};

export default ChapterSidebar;