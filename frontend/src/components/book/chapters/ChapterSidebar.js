// C:\Users\USER\bookfete\frontend\src\components\book\chapters\ChapterSidebar.js
import React from 'react';

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
  
  // Fonction pour gérer le clic sur le bouton d'invitation
  const handleInviteClick = (chapter, e) => {
    e.stopPropagation(); // Empêche la sélection du chapitre
    console.log('📌 Chapitre cliqué pour invitation:', chapter);
    
    if (!chapter || !chapter.id) {
      console.error('❌ Erreur: chapitre invalide', chapter);
      return;
    }
    
    // Appeler la fonction du parent avec le chapitre complet
    onCopyInviteLink(chapter, e);
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
          
          {/* COUVERTURE */}
          <div
            onClick={() => onSelectItem('cover', 'cover')}
            style={{
              padding: '1rem',
              background: selectedType === 'cover' ? '#fff3e0' : '#f8f9fa',
              border: selectedType === 'cover' ? '2px solid #b8924a' : '1px solid #e9ecef',
              borderRadius: '8px',
              cursor: 'pointer',
              transition: 'all 0.2s',
              borderLeft: '4px solid #b8924a',
              position: 'relative'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '1.5rem' }}>📕</span>
              <div>
                <h4 style={{ margin: 0, fontSize: '1rem', color: '#b8924a' }}>
                  COUVERTURE
                </h4>
                <small style={{ color: '#666' }}>
                  {coverConfig?.title || book?.title || 'Titre personnalisable'}
                </small>
              </div>
            </div>
          </div>

          {/* CHAPITRES */}
          {chapters.map((chapter, index) => (
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem' }}>
                    <h4 style={{ margin: 0, fontSize: '1rem' }}>
                      {index + 1}. {chapter.title}
                    </h4>
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
                  <div style={{ display: 'flex', gap: '1rem', fontSize: '0.8rem', color: '#666' }}>
                    <span>💬 {chapter.contributions?.[0]?.count || 0}</span>
                    <span>📝 {chapter.questions_ia?.length || 0} questions</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.3rem' }}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onEditChapter(chapter);
                    }}
                    style={{
                      padding: '0.2rem 0.5rem',
                      background: 'none',
                      border: '1px solid #ddd',
                      borderRadius: '3px',
                      cursor: 'pointer',
                      fontSize: '0.8rem'
                    }}
                    title="Modifier le titre"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onEditQuestions(chapter);
                    }}
                    style={{
                      padding: '0.2rem 0.5rem',
                      background: 'none',
                      border: '1px solid #ddd',
                      borderRadius: '3px',
                      cursor: 'pointer',
                      fontSize: '0.8rem'
                    }}
                    title="Modifier les questions"
                  >
                    ❓
                  </button>
                  <button
                    onClick={(e) => handleInviteClick(chapter, e)}
                    style={{
                      padding: '0.2rem 0.5rem',
                      background: inviteSuccess === chapter.id ? '#28a745' : '#764ba2',
                      color: 'white',
                      border: 'none',
                      borderRadius: '3px',
                      cursor: 'pointer',
                      fontSize: '0.8rem'
                    }}
                    title="Inviter des contributeurs"
                  >
                    👥
                  </button>
                  <button
                    onClick={(e) => onDeleteClick(chapter, e)}
                    style={{
                      padding: '0.2rem 0.5rem',
                      background: '#dc3545',
                      color: 'white',
                      border: 'none',
                      borderRadius: '3px',
                      cursor: 'pointer',
                      fontSize: '0.8rem'
                    }}
                    title="Supprimer le chapitre"
                  >
                    🗑️
                  </button>
                </div>
              </div>
              {inviteSuccess === chapter.id && (
                <div style={{
                  position: 'absolute',
                  top: '-20px',
                  right: '0',
                  background: '#28a745',
                  color: 'white',
                  padding: '0.2rem 0.5rem',
                  borderRadius: '3px',
                  fontSize: '0.7rem'
                }}>
                  Invitation envoyée !
                </div>
              )}
            </div>
          ))}

          {/* 4ÈME COUVERTURE */}
          <div
            onClick={() => onSelectItem('backcover', 'backcover')}
            style={{
              padding: '1rem',
              background: selectedType === 'backcover' ? '#e8f4fd' : '#f8f9fa',
              border: selectedType === 'backcover' ? '2px solid #17a2b8' : '1px solid #e9ecef',
              borderRadius: '8px',
              cursor: 'pointer',
              transition: 'all 0.2s',
              borderLeft: '4px solid #17a2b8',
              position: 'relative',
              marginTop: '0.5rem'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '1.5rem' }}>📘</span>
              <div>
                <h4 style={{ margin: 0, fontSize: '1rem', color: '#17a2b8' }}>
                  4ÈME COUVERTURE
                </h4>
                <small style={{ color: '#666' }}>
                  {contributors.length} contributeur{contributors.length > 1 ? 's' : ''}
                </small>
              </div>
            </div>
          </div>
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
            <h4 style={{ margin: '0 0 0.5rem', color: '#764ba2' }}>✨ Guide rapide</h4>
            <ul style={{ margin: 0, paddingLeft: '1.2rem', color: '#666', fontSize: '0.9rem' }}>
              <li>📕 Cliquez sur COUVERTURE pour personnaliser</li>
              <li>📑 Cliquez sur un chapitre pour le gérer</li>
              <li>👥 Cliquez sur 👥 pour inviter des contributeurs</li>
              <li>📘 Cliquez sur 4ÈME COUVERTURE pour la fin</li>
              <li>✏️ Modifier les titres et questions</li>
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