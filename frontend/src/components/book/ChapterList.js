// C:\Users\USER\bookfete\frontend\src\components\book\ChapterList.js
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const ChapterList = ({ chapters, bookId, onUpdateChapter, onDeleteChapter, onAddChapter }) => {
  const navigate = useNavigate();
  const [editingChapter, setEditingChapter] = useState(null);
  const [showQuestions, setShowQuestions] = useState({});
  const [inviteSuccess, setInviteSuccess] = useState(null);
  const [selectedChapter, setSelectedChapter] = useState(null);
  const [showGuide, setShowGuide] = useState(true);

  const toggleQuestions = (chapterId) => {
    setShowQuestions(prev => ({
      ...prev,
      [chapterId]: !prev[chapterId]
    }));
  };

  const handleEdit = (chapter) => {
    setEditingChapter({
      id: chapter.id,
      title: chapter.title,
      description: chapter.description || ''
    });
  };

  const handleSaveEdit = async () => {
    if (editingChapter) {
      await onUpdateChapter(editingChapter.id, {
        title: editingChapter.title,
        description: editingChapter.description
      });
      setEditingChapter(null);
    }
  };

  const copyInviteLink = async (chapterId) => {
    try {
      const inviteLink = `${window.location.origin}/invite/${chapterId}`;
      await navigator.clipboard.writeText(inviteLink);
      setInviteSuccess(chapterId);
      setTimeout(() => setInviteSuccess(null), 2000);
    } catch (err) {
      alert('Erreur lors de la copie du lien');
    }
  };

  const getStatusColor = (contributions) => {
    const count = contributions?.[0]?.count || 0;
    if (count === 0) return '#ffc107';
    if (count < 3) return '#17a2b8';
    return '#28a745';
  };

  const getStatusText = (contributions) => {
    const count = contributions?.[0]?.count || 0;
    if (count === 0) return 'En attente';
    if (count === 1) return '1 contribution';
    return `${count} contributions`;
  };

  return (
    <div style={{ display: 'flex', gap: '2rem', minHeight: '600px' }}>
      {/* Colonne de gauche : Liste des chapitres */}
      <div style={{ 
        flex: 1,
        maxWidth: '400px',
        background: 'white',
        borderRadius: '10px',
        padding: '1.5rem',
        boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
        overflowY: 'auto',
        height: 'fit-content',
        maxHeight: 'calc(100vh - 200px)'
      }}>
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          marginBottom: '1.5rem',
          paddingBottom: '1rem',
          borderBottom: '2px solid #eee'
        }}>
          <h3 style={{ margin: 0 }}>📖 Chapitres</h3>
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
            + Nouveau
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
          {chapters.map((chapter, index) => (
            <div
              key={chapter.id}
              onClick={() => setSelectedChapter(chapter)}
              style={{
                padding: '1rem',
                background: selectedChapter?.id === chapter.id ? '#f3e8ff' : '#f8f9fa',
                border: selectedChapter?.id === chapter.id ? '2px solid #764ba2' : '1px solid #e9ecef',
                borderRadius: '8px',
                cursor: 'pointer',
                transition: 'all 0.2s',
                borderLeft: `4px solid ${getStatusColor(chapter.contributions)}`,
                position: 'relative'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h4 style={{ margin: '0 0 0.3rem', fontSize: '1rem' }}>
                    Chapitre {index + 1} : {chapter.title}
                  </h4>
                  <div style={{ display: 'flex', gap: '1rem', fontSize: '0.8rem', color: '#666' }}>
                    <span>💬 {chapter.contributions?.[0]?.count || 0}</span>
                    <span>📸 {chapter.questions_ia?.length || 0}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.3rem' }}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleEdit(chapter);
                    }}
                    style={{
                      padding: '0.2rem 0.5rem',
                      background: 'none',
                      border: '1px solid #ddd',
                      borderRadius: '3px',
                      cursor: 'pointer',
                      fontSize: '0.8rem'
                    }}
                  >
                    ✏️
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      copyInviteLink(chapter.id);
                    }}
                    style={{
                      padding: '0.2rem 0.5rem',
                      background: inviteSuccess === chapter.id ? '#28a745' : '#764ba2',
                      color: 'white',
                      border: 'none',
                      borderRadius: '3px',
                      cursor: 'pointer',
                      fontSize: '0.8rem'
                    }}
                  >
                    🔗
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
                  Lien copié !
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Colonne de droite : Espace d'instructions / guide */}
      <div style={{ 
        flex: 2,
        background: 'white',
        borderRadius: '10px',
        padding: '2rem',
        boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
      }}>
        {selectedChapter ? (
          <div>
            <h2 style={{ marginTop: 0, color: '#333' }}>{selectedChapter.title}</h2>
            
            {/* Zone d'instructions pour ce chapitre */}
            <div style={{
              background: '#f8f9fa',
              padding: '1.5rem',
              borderRadius: '8px',
              marginBottom: '2rem',
              border: '1px solid #e9ecef'
            }}>
              <h3 style={{ margin: '0 0 1rem', color: '#764ba2' }}>📋 Instructions pour ce chapitre</h3>
              
              <div style={{ marginBottom: '1rem' }}>
                <p style={{ margin: '0 0 0.5rem', fontWeight: 'bold' }}>Questions suggérées :</p>
                <ul style={{ margin: 0, paddingLeft: '1.5rem', color: '#666' }}>
                  {selectedChapter.questions_ia?.map((q, idx) => (
                    <li key={idx} style={{ marginBottom: '0.3rem' }}>{q}</li>
                  )) || (
                    <li style={{ fontStyle: 'italic', color: '#999' }}>
                      Aucune question pour l'instant
                    </li>
                  )}
                </ul>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <p style={{ margin: '0 0 0.5rem', fontWeight: 'bold' }}>Consignes pour les contributeurs :</p>
                <p style={{ margin: 0, color: '#666', fontSize: '0.95rem' }}>
                  • Maximum 2 photos par contribution<br/>
                  • Format JPG ou PNG (5MB max)<br/>
                  • Vous pouvez modifier votre contribution après envoi
                </p>
              </div>

              <button
                onClick={() => navigate(`/book/${bookId}/chapter/${selectedChapter.id}`)}
                style={{
                  padding: '0.8rem 1.5rem',
                  background: '#764ba2',
                  color: 'white',
                  border: 'none',
                  borderRadius: '5px',
                  cursor: 'pointer',
                  fontSize: '1rem',
                  width: '100%'
                }}
              >
                Voir le chapitre complet
              </button>
            </div>

            {/* Mini aperçu des dernières contributions */}
            <div>
              <h3 style={{ margin: '0 0 1rem', fontSize: '1.1rem' }}>Dernières contributions</h3>
              <div style={{
                background: '#f8f9fa',
                padding: '1rem',
                borderRadius: '8px',
                border: '1px solid #e9ecef'
              }}>
                <p style={{ margin: 0, color: '#999', fontStyle: 'italic', textAlign: 'center' }}>
                  Les contributions apparaîtront ici
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '400px',
            color: '#999'
          }}>
            <span style={{ fontSize: '4rem', marginBottom: '1rem' }}>📖</span>
            <h3>Sélectionnez un chapitre</h3>
            <p style={{ textAlign: 'center', maxWidth: '400px' }}>
              Cliquez sur un chapitre à gauche pour voir les instructions et gérer les contributions
            </p>
          </div>
        )}

        {/* Guide général toujours visible */}
        <div style={{
          marginTop: '2rem',
          padding: '1rem',
          background: '#f3e8ff',
          borderRadius: '8px',
          border: '1px solid #764ba2'
        }}>
          <h4 style={{ margin: '0 0 0.5rem', color: '#764ba2' }}>✨ Guide rapide</h4>
          <ul style={{ margin: 0, paddingLeft: '1.2rem', color: '#666', fontSize: '0.9rem' }}>
            <li>Cliquez sur un chapitre pour voir les détails</li>
            <li>Utilisez le bouton 🔗 pour inviter des contributeurs</li>
            <li>✏️ pour modifier le titre du chapitre</li>
            <li>Les contributions apparaîtront dans l'espace de droite</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default ChapterList;