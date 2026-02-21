// C:\Users\USER\bookfete\frontend\src\components\book\ChapterList.js
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const ChapterList = ({ chapters, bookId, onUpdateChapter, onDeleteChapter, onAddChapter }) => {
  const navigate = useNavigate();
  const [editingChapter, setEditingChapter] = useState(null);
  const [editingQuestions, setEditingQuestions] = useState(null);
  const [showQuestions, setShowQuestions] = useState({});
  const [inviteSuccess, setInviteSuccess] = useState(null);
  const [selectedChapter, setSelectedChapter] = useState(null);
  const [showGuide, setShowGuide] = useState(true);
  const [newQuestion, setNewQuestion] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(null);

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

  const handleEditQuestions = (chapter) => {
    setEditingQuestions({
      id: chapter.id,
      questions: chapter.questions_ia || []
    });
  };

  const handleDeleteClick = (chapter, e) => {
    e.stopPropagation();
    setDeleteConfirm(chapter);
  };

  const confirmDelete = async () => {
    if (deleteConfirm) {
      await onDeleteChapter(deleteConfirm.id);
      setDeleteConfirm(null);
      if (selectedChapter?.id === deleteConfirm.id) {
        setSelectedChapter(null);
      }
    }
  };

  const cancelDelete = () => {
    setDeleteConfirm(null);
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

  const handleSaveQuestions = async () => {
    if (editingQuestions) {
      await onUpdateChapter(editingQuestions.id, {
        questions_ia: editingQuestions.questions
      });
      setEditingQuestions(null);
    }
  };

  const addQuestion = () => {
    if (newQuestion.trim() && editingQuestions) {
      setEditingQuestions({
        ...editingQuestions,
        questions: [...editingQuestions.questions, newQuestion.trim()]
      });
      setNewQuestion('');
    }
  };

  const removeQuestion = (index) => {
    if (editingQuestions) {
      const newQuestions = editingQuestions.questions.filter((_, i) => i !== index);
      setEditingQuestions({
        ...editingQuestions,
        questions: newQuestions
      });
    }
  };

  const copyInviteLink = async (chapterId, e) => {
    e.stopPropagation();
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
          <h3 style={{ margin: 0 }}>📖 Chapitres ({chapters.length})</h3>
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
                    title="Modifier le titre"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleEditQuestions(chapter);
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
                    onClick={(e) => copyInviteLink(chapter.id, e)}
                    style={{
                      padding: '0.2rem 0.5rem',
                      background: inviteSuccess === chapter.id ? '#28a745' : '#764ba2',
                      color: 'white',
                      border: 'none',
                      borderRadius: '3px',
                      cursor: 'pointer',
                      fontSize: '0.8rem'
                    }}
                    title="Copier le lien d'invitation"
                  >
                    🔗
                  </button>
                  <button
                    onClick={(e) => handleDeleteClick(chapter, e)}
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
                  Lien copié !
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Guide rapide */}
        {showGuide && (
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
              <li>✏️ Modifier le titre</li>
              <li>❓ Modifier les questions</li>
              <li>🔗 Copier le lien d'invitation</li>
              <li>🗑️ Supprimer le chapitre</li>
              <li>Les suggestions sont marquées en bleu</li>
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
              textAlign: 'center'
            }}
          >
            Afficher le guide
          </button>
        )}
      </div>

      {/* Colonne de droite : Espace d'instructions */}
      <div style={{ 
        flex: 2,
        background: 'white',
        borderRadius: '10px',
        padding: '2rem',
        boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
        position: 'relative'
      }}>
        {/* Modal de confirmation de suppression */}
        {deleteConfirm && (
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.5)',
            borderRadius: '10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}>
            <div style={{
              background: 'white',
              padding: '2rem',
              borderRadius: '10px',
              maxWidth: '400px',
              textAlign: 'center'
            }}>
              <span style={{ fontSize: '3rem', marginBottom: '1rem', display: 'block' }}>⚠️</span>
              <h3 style={{ marginBottom: '1rem' }}>Supprimer le chapitre ?</h3>
              <p style={{ marginBottom: '1rem', color: '#666' }}>
                Êtes-vous sûr de vouloir supprimer le chapitre <strong>"{deleteConfirm.title}"</strong> ?
              </p>
              <p style={{ marginBottom: '2rem', color: '#dc3545', fontSize: '0.9rem' }}>
                Cette action est irréversible. Toutes les contributions associées seront également supprimées.
              </p>
              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                <button
                  onClick={cancelDelete}
                  style={{
                    padding: '0.8rem 1.5rem',
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
                  onClick={confirmDelete}
                  style={{
                    padding: '0.8rem 1.5rem',
                    background: '#dc3545',
                    color: 'white',
                    border: 'none',
                    borderRadius: '5px',
                    cursor: 'pointer'
                  }}
                >
                  Supprimer définitivement
                </button>
              </div>
            </div>
          </div>
        )}

        {selectedChapter ? (
          <div>
            {/* Mode édition du titre */}
            {editingChapter?.id === selectedChapter.id ? (
              <div style={{ marginBottom: '2rem' }}>
                <h3 style={{ margin: '0 0 1rem' }}>Modifier le chapitre</h3>
                <input
                  type="text"
                  value={editingChapter.title}
                  onChange={(e) => setEditingChapter({ ...editingChapter, title: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '0.8rem',
                    border: '1px solid #764ba2',
                    borderRadius: '5px',
                    fontSize: '1rem',
                    marginBottom: '1rem'
                  }}
                  placeholder="Titre du chapitre"
                />
                <textarea
                  value={editingChapter.description}
                  onChange={(e) => setEditingChapter({ ...editingChapter, description: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '0.8rem',
                    border: '1px solid #ddd',
                    borderRadius: '5px',
                    fontSize: '1rem',
                    minHeight: '80px',
                    marginBottom: '1rem'
                  }}
                  placeholder="Description du chapitre (optionnelle)"
                />
                <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => setEditingChapter(null)}
                    style={{
                      padding: '0.5rem 1rem',
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
                      padding: '0.5rem 1rem',
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
            ) : editingQuestions?.id === selectedChapter.id ? (
              // Mode édition des questions
              <div style={{ marginBottom: '2rem' }}>
                <h3 style={{ margin: '0 0 1rem' }}>Modifier les questions</h3>
                <div style={{ marginBottom: '1rem' }}>
                  {editingQuestions.questions.map((q, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        marginBottom: '0.5rem',
                        padding: '0.5rem',
                        background: '#f8f9fa',
                        borderRadius: '5px'
                      }}
                    >
                      <span style={{ flex: 1 }}>{q}</span>
                      <button
                        onClick={() => removeQuestion(idx)}
                        style={{
                          padding: '0.2rem 0.5rem',
                          background: '#dc3545',
                          color: 'white',
                          border: 'none',
                          borderRadius: '3px',
                          cursor: 'pointer'
                        }}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                  <input
                    type="text"
                    value={newQuestion}
                    onChange={(e) => setNewQuestion(e.target.value)}
                    placeholder="Nouvelle question"
                    style={{
                      flex: 1,
                      padding: '0.5rem',
                      border: '1px solid #ddd',
                      borderRadius: '5px'
                    }}
                  />
                  <button
                    onClick={addQuestion}
                    style={{
                      padding: '0.5rem 1rem',
                      background: '#28a745',
                      color: 'white',
                      border: 'none',
                      borderRadius: '5px',
                      cursor: 'pointer'
                    }}
                  >
                    Ajouter
                  </button>
                </div>
                <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => setEditingQuestions(null)}
                    style={{
                      padding: '0.5rem 1rem',
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
                    onClick={handleSaveQuestions}
                    style={{
                      padding: '0.5rem 1rem',
                      background: '#28a745',
                      color: 'white',
                      border: 'none',
                      borderRadius: '5px',
                      cursor: 'pointer'
                    }}
                  >
                    Enregistrer les questions
                  </button>
                </div>
              </div>
            ) : (
              // Mode normal
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                  <h2 style={{ margin: 0, color: '#333' }}>
                    {selectedChapter.title}
                    {selectedChapter.is_default && (
                      <span style={{
                        background: '#e8f4fd',
                        color: '#0c5460',
                        padding: '0.2rem 0.5rem',
                        borderRadius: '3px',
                        fontSize: '0.8rem',
                        marginLeft: '1rem'
                      }}>
                        Suggestion
                      </span>
                    )}
                  </h2>
                  <div>
                    <button
                      onClick={() => navigate(`/book/${bookId}/chapter/${selectedChapter.id}`)}
                      style={{
                        padding: '0.6rem 1.2rem',
                        background: '#764ba2',
                        color: 'white',
                        border: 'none',
                        borderRadius: '5px',
                        cursor: 'pointer'
                      }}
                    >
                      Voir le chapitre
                    </button>
                  </div>
                </div>

                {selectedChapter.description && (
                  <div style={{
                    background: '#f8f9fa',
                    padding: '1rem',
                    borderRadius: '8px',
                    marginBottom: '2rem',
                    border: '1px solid #e9ecef'
                  }}>
                    <p style={{ margin: 0, color: '#666' }}>{selectedChapter.description}</p>
                  </div>
                )}

                {/* Zone d'instructions */}
                <div style={{
                  background: '#f8f9fa',
                  padding: '1.5rem',
                  borderRadius: '8px',
                  marginBottom: '2rem',
                  border: '1px solid #e9ecef'
                }}>
                  <h3 style={{ margin: '0 0 1rem', color: '#764ba2' }}>📋 Questions suggérées</h3>
                  
                  <div style={{ marginBottom: '1rem' }}>
                    {selectedChapter.questions_ia && selectedChapter.questions_ia.length > 0 ? (
                      <ul style={{ margin: 0, paddingLeft: '1.5rem', color: '#666' }}>
                        {selectedChapter.questions_ia.map((q, idx) => (
                          <li key={idx} style={{ marginBottom: '0.5rem' }}>{q}</li>
                        ))}
                      </ul>
                    ) : (
                      <p style={{ color: '#999', fontStyle: 'italic' }}>Aucune question pour l'instant</p>
                    )}
                  </div>

                  <div style={{ marginTop: '1rem' }}>
                    <p style={{ margin: '0 0 0.5rem', fontWeight: 'bold' }}>Consignes pour les contributeurs :</p>
                    <p style={{ margin: 0, color: '#666', fontSize: '0.95rem' }}>
                      • Maximum 2 photos par contribution<br/>
                      • Format JPG ou PNG (5MB max)<br/>
                      • Vous pouvez modifier votre contribution après envoi
                    </p>
                  </div>

                  <div style={{
                    marginTop: '1rem',
                    padding: '0.5rem',
                    background: '#e8f4fd',
                    borderRadius: '5px',
                    fontSize: '0.9rem',
                    color: '#0c5460'
                  }}>
                    <strong>💡 Astuce :</strong> Cliquez sur ❓ pour modifier les questions
                  </div>
                </div>

                {/* Statistiques du chapitre */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr 1fr',
                  gap: '1rem',
                  marginBottom: '2rem'
                }}>
                  <div style={{
                    background: '#f8f9fa',
                    padding: '1rem',
                    borderRadius: '8px',
                    textAlign: 'center'
                  }}>
                    <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#ffc107' }}>
                      {selectedChapter.contributions?.[0]?.count || 0}
                    </div>
                    <div style={{ color: '#666', fontSize: '0.9rem' }}>contributions</div>
                  </div>
                  <div style={{
                    background: '#f8f9fa',
                    padding: '1rem',
                    borderRadius: '8px',
                    textAlign: 'center'
                  }}>
                    <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#17a2b8' }}>
                      {selectedChapter.questions_ia?.length || 0}
                    </div>
                    <div style={{ color: '#666', fontSize: '0.9rem' }}>questions</div>
                  </div>
                  <div style={{
                    background: '#f8f9fa',
                    padding: '1rem',
                    borderRadius: '8px',
                    textAlign: 'center'
                  }}>
                    <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#28a745' }}>
                      {selectedChapter.invites_count || 0}
                    </div>
                    <div style={{ color: '#666', fontSize: '0.9rem' }}>invités</div>
                  </div>
                </div>
              </>
            )}
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
              Cliquez sur un chapitre à gauche pour voir les instructions, gérer les questions et les contributions
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChapterList;