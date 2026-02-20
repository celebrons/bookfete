// C:\Users\USER\bookfete\frontend\src\components\book\ChapterList.js
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const ChapterList = ({ chapters, bookId, onUpdateChapter, onDeleteChapter, onAddChapter }) => {
  const navigate = useNavigate();
  const [editingChapter, setEditingChapter] = useState(null);
  const [showQuestions, setShowQuestions] = useState({});
  const [inviteSuccess, setInviteSuccess] = useState(null);

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
      // Créer un token unique pour ce chapitre
      // Dans une vraie implémentation, vous généreriez un token côté backend
      const inviteLink = `${window.location.origin}/contribute/${bookId}/${chapterId}`;
      await navigator.clipboard.writeText(inviteLink);
      setInviteSuccess(chapterId);
      setTimeout(() => setInviteSuccess(null), 2000);
    } catch (err) {
      alert('Erreur lors de la copie du lien');
    }
  };

  const getStatusColor = (contributions) => {
    const count = contributions?.[0]?.count || 0;
    if (count === 0) return '#ffc107'; // jaune - pas de contribution
    if (count < 3) return '#17a2b8';   // bleu - quelques contributions
    return '#28a745';                   // vert - bien contribué
  };

  const getStatusText = (contributions) => {
    const count = contributions?.[0]?.count || 0;
    if (count === 0) return 'En attente de contributions';
    if (count === 1) return '1 contribution';
    return `${count} contributions`;
  };

  return (
    <div>
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        marginBottom: '2rem' 
      }}>
        <h2 style={{ margin: 0 }}>📖 Chapitres du livre</h2>
        <button
          onClick={onAddChapter}
          style={{
            padding: '0.8rem 1.5rem',
            background: '#28a745',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            fontSize: '1rem'
          }}
        >
          + Nouveau chapitre
        </button>
      </div>

      {chapters.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '4rem',
          background: 'white',
          borderRadius: '10px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
        }}>
          <span style={{ fontSize: '4rem', display: 'block', marginBottom: '1rem' }}>📘</span>
          <h3 style={{ marginBottom: '1rem' }}>Aucun chapitre pour le moment</h3>
          <p style={{ color: '#666', marginBottom: '2rem' }}>
            Commencez par créer votre premier chapitre
          </p>
          <button
            onClick={onAddChapter}
            style={{
              padding: '1rem 2rem',
              background: '#764ba2',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              cursor: 'pointer',
              fontSize: '1rem'
            }}
          >
            Créer le premier chapitre
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {chapters.map((chapter, index) => (
            <div
              key={chapter.id}
              style={{
                background: 'white',
                borderRadius: '10px',
                padding: '1.5rem',
                boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
                borderLeft: `5px solid ${getStatusColor(chapter.contributions)}`,
                transition: 'transform 0.2s',
                cursor: 'pointer'
              }}
              onClick={() => navigate(`/book/${bookId}/chapter/${chapter.id}`)}
              onMouseEnter={(e) => e.currentTarget.style.transform = 'translateX(5px)'}
              onMouseLeave={(e) => e.currentTarget.style.transform = 'translateX(0)'}
            >
              {editingChapter?.id === chapter.id ? (
                // Mode édition
                <div onClick={(e) => e.stopPropagation()}>
                  <input
                    type="text"
                    value={editingChapter.title}
                    onChange={(e) => setEditingChapter(prev => ({ ...prev, title: e.target.value }))}
                    style={{
                      width: '100%',
                      padding: '0.8rem',
                      marginBottom: '1rem',
                      border: '2px solid #764ba2',
                      borderRadius: '5px',
                      fontSize: '1.1rem'
                    }}
                    placeholder="Titre du chapitre"
                    autoFocus
                  />
                  <textarea
                    value={editingChapter.description}
                    onChange={(e) => setEditingChapter(prev => ({ ...prev, description: e.target.value }))}
                    style={{
                      width: '100%',
                      padding: '0.8rem',
                      marginBottom: '1rem',
                      border: '1px solid #ddd',
                      borderRadius: '5px',
                      minHeight: '80px',
                      fontSize: '1rem'
                    }}
                    placeholder="Description du chapitre (optionnelle)"
                  />
                  <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                    <button
                      onClick={() => setEditingChapter(null)}
                      style={{
                        padding: '0.6rem 1.2rem',
                        background: '#6c757d',
                        color: 'white',
                        border: 'none',
                        borderRadius: '5px',
                        cursor: 'pointer'
                      }}
                    >
                      Annuler
                    </button>
                    <button
                      onClick={handleSaveEdit}
                      style={{
                        padding: '0.6rem 1.2rem',
                        background: '#28a745',
                        color: 'white',
                        border: 'none',
                        borderRadius: '5px',
                        cursor: 'pointer'
                      }}
                    >
                      Enregistrer
                    </button>
                  </div>
                </div>
              ) : (
                // Mode visualisation
                <>
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'flex-start',
                    marginBottom: '1rem'
                  }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <span style={{
                          background: '#764ba2',
                          color: 'white',
                          width: '30px',
                          height: '30px',
                          borderRadius: '50%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 'bold'
                        }}>
                          {index + 1}
                        </span>
                        <h3 style={{ margin: 0, fontSize: '1.3rem' }}>
                          {chapter.title}
                        </h3>
                      </div>
                      {chapter.description && (
                        <p style={{ 
                          margin: '0.5rem 0 0 2.5rem', 
                          color: '#666',
                          fontSize: '0.95rem'
                        }}>
                          {chapter.description}
                        </p>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEdit(chapter);
                        }}
                        style={{
                          padding: '0.4rem 0.8rem',
                          background: 'none',
                          border: '1px solid #ddd',
                          borderRadius: '5px',
                          cursor: 'pointer',
                          fontSize: '0.9rem'
                        }}
                        title="Modifier"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteChapter(chapter.id);
                        }}
                        style={{
                          padding: '0.4rem 0.8rem',
                          background: 'none',
                          border: '1px solid #dc3545',
                          color: '#dc3545',
                          borderRadius: '5px',
                          cursor: 'pointer',
                          fontSize: '0.9rem'
                        }}
                        title="Supprimer"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>

                  {/* Stats du chapitre */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '2rem',
                    marginTop: '1rem',
                    padding: '1rem 0',
                    borderTop: '1px solid #eee',
                    borderBottom: '1px solid #eee'
                  }}>
                    <div>
                      <span style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#ffc107' }}>
                        {chapter.contributions?.[0]?.count || 0}
                      </span>
                      <span style={{ marginLeft: '0.5rem', color: '#666' }}>
                        contribution{(chapter.contributions?.[0]?.count || 0) > 1 ? 's' : ''}
                      </span>
                    </div>
                    <div>
                      <span style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#17a2b8' }}>
                        {chapter.questions_ia?.length || 0}
                      </span>
                      <span style={{ marginLeft: '0.5rem', color: '#666' }}>
                        question{(chapter.questions_ia?.length || 0) > 1 ? 's' : ''}
                      </span>
                    </div>
                    <div style={{ marginLeft: 'auto' }}>
                      <span style={{
                        padding: '0.3rem 0.8rem',
                        borderRadius: '20px',
                        fontSize: '0.85rem',
                        background: getStatusColor(chapter.contributions) + '20',
                        color: getStatusColor(chapter.contributions)
                      }}>
                        {getStatusText(chapter.contributions)}
                      </span>
                    </div>
                  </div>

                  {/* Questions IA */}
                  {chapter.questions_ia && chapter.questions_ia.length > 0 && (
                    <div style={{ marginTop: '1rem' }}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleQuestions(chapter.id);
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#764ba2',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                          padding: '0.5rem 0',
                          fontSize: '0.95rem'
                        }}
                      >
                        {showQuestions[chapter.id] ? '▼' : '▶'} Questions suggérées par l'IA
                      </button>
                      
                      {showQuestions[chapter.id] && (
                        <ul style={{
                          marginTop: '1rem',
                          paddingLeft: '1.5rem',
                          color: '#666',
                          background: '#f8f9fa',
                          padding: '1rem 1.5rem',
                          borderRadius: '8px'
                        }}>
                          {chapter.questions_ia.map((question, idx) => (
                            <li key={idx} style={{ marginBottom: '0.5rem' }}>{question}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}

                  {/* Boutons d'action */}
                  <div style={{
                    display: 'flex',
                    gap: '1rem',
                    marginTop: '1.5rem'
                  }}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/book/${bookId}/chapter/${chapter.id}`);
                      }}
                      style={{
                        padding: '0.6rem 1.2rem',
                        background: '#764ba2',
                        color: 'white',
                        border: 'none',
                        borderRadius: '5px',
                        cursor: 'pointer',
                        fontSize: '0.95rem'
                      }}
                    >
                      Voir le chapitre
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        copyInviteLink(chapter.id);
                      }}
                      style={{
                        padding: '0.6rem 1.2rem',
                        background: 'white',
                        color: '#764ba2',
                        border: '2px solid #764ba2',
                        borderRadius: '5px',
                        cursor: 'pointer',
                        fontSize: '0.95rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.3rem'
                      }}
                    >
                      🔗 Inviter
                      {inviteSuccess === chapter.id && (
                        <span style={{ color: '#28a745', marginLeft: '0.5rem' }}>✓ Copié !</span>
                      )}
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ChapterList;