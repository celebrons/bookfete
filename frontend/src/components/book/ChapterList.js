// C:\Users\USER\bookfete\frontend\src\components\book\ChapterList.js
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';

const ChapterList = ({ chapters, bookId, onUpdateChapter, onDeleteChapter, onAddChapter }) => {
  const navigate = useNavigate();
  const [editingChapter, setEditingChapter] = useState(null);
  const [editingQuestions, setEditingQuestions] = useState(null);
  const [inviteSuccess, setInviteSuccess] = useState(null);
  const [selectedChapter, setSelectedChapter] = useState(null);
  const [showGuide, setShowGuide] = useState(true);
  const [newQuestion, setNewQuestion] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [generatingQuestions, setGeneratingQuestions] = useState(false);
  
  // État pour la contribution
  const [contributionText, setContributionText] = useState('');
  const [photos, setPhotos] = useState([]);
  const [photoPreviews, setPhotoPreviews] = useState([]);
  const [submitting, setSubmitting] = useState(false);

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

  const generateAIQuestions = async (chapter) => {
    try {
      setGeneratingQuestions(true);
      
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      
      if (!token) {
        alert('Vous devez être connecté');
        return;
      }

      const response = await fetch(`${process.env.REACT_APP_API_URL}/ai/generate-questions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          chapterTitle: chapter.title,
          eventType: 'default',
          style: 'factuel'
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erreur génération IA');
      }

      await onUpdateChapter(chapter.id, {
        questions_ia: data.questions
      });

      // Mettre à jour le chapitre sélectionné
      setSelectedChapter(prev => ({
        ...prev,
        questions_ia: data.questions
      }));

    } catch (error) {
      console.error('❌ Erreur:', error);
      alert('Erreur lors de la génération des questions');
    } finally {
      setGeneratingQuestions(false);
    }
  };

  // ✅ FONCTION D'INVITATION CORRIGÉE
  const copyInviteLink = async (chapterId, e) => {
    e.stopPropagation();
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      
      if (!token) {
        alert('Vous devez être connecté');
        return;
      }

      // 1. Créer l'invitation en base
      const response = await fetch(`${process.env.REACT_APP_API_URL}/invites/chapter`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          chapterId: chapterId,
          emails: ['invite@example.com'],
          customMessage: ''
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erreur création invitation');
      }

      // 2. Construire l'URL complète du lien d'invitation avec le VRAI token
      const baseUrl = process.env.NODE_ENV === 'production' 
        ? 'https://bookfete-front.onrender.com' 
        : window.location.origin;
      
      const inviteLink = `${baseUrl}/invite/${data.invites[0].token}`;
      
      // 3. Copier dans le presse-papier
      await navigator.clipboard.writeText(inviteLink);

      // 4. Feedback visuel
      setInviteSuccess(chapterId);
      setTimeout(() => setInviteSuccess(null), 2000);
      
      console.log('✅ Lien copié:', inviteLink);
      
    } catch (err) {
      console.error('❌ Erreur:', err);
      alert(`Erreur: ${err.message}`);
    }
  };

  const handlePhotoChange = (e) => {
    const files = Array.from(e.target.files);
    
    if (photos.length + files.length > 2) {
      alert('Maximum 2 photos');
      return;
    }

    const validFiles = files.filter(file => {
      const isValid = file.type.startsWith('image/') && file.size <= 5 * 1024 * 1024;
      if (!isValid) {
        alert(`${file.name} : format invalide ou trop volumineux (max 5MB)`);
      }
      return isValid;
    });

    setPhotos(prev => [...prev, ...validFiles]);

    validFiles.forEach(file => {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoPreviews(prev => [...prev, reader.result]);
      };
      reader.readAsDataURL(file);
    });
  };

  const removePhoto = (index) => {
    setPhotos(prev => prev.filter((_, i) => i !== index));
    setPhotoPreviews(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmitContribution = async () => {
    if (!selectedChapter) return;
    if (!contributionText.trim()) {
      alert('Veuillez écrire un message');
      return;
    }

    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const photoUrls = [];
      for (const photo of photos) {
        const fileExt = photo.name.split('.').pop();
        const fileName = `${selectedChapter.id}/${Date.now()}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
          .from('contribution-photos')
          .upload(fileName, photo);

        if (uploadError) {
          console.error('❌ Erreur upload:', uploadError);
          continue;
        }

        const { data: { publicUrl } } = supabase.storage
          .from('contribution-photos')
          .getPublicUrl(fileName);

        photoUrls.push(publicUrl);
      }

      const { error } = await supabase
        .from('contributions')
        .insert([{
          chapter_id: selectedChapter.id,
          contributor_name: user.user_metadata?.full_name || user.email,
          contributor_email: user.email,
          message: contributionText,
          photo_urls: photoUrls,
          approved: false
        }]);

      if (error) throw error;

      setContributionText('');
      setPhotos([]);
      setPhotoPreviews([]);
      alert('✅ Contribution envoyée !');
      
    } catch (error) {
      console.error('❌ Erreur:', error);
      alert('Erreur lors de l\'envoi');
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusColor = (contributions) => {
    const count = contributions?.[0]?.count || 0;
    if (count === 0) return '#ffc107';
    if (count < 3) return '#17a2b8';
    return '#28a745';
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
              <li>🔗 Copier le lien d'invitation (génère un vrai token)</li>
              <li>🗑️ Supprimer le chapitre</li>
              <li>🤖 Générer des questions avec l'IA</li>
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

      {/* Colonne de droite : Détails du chapitre sélectionné */}
      <div style={{ 
        flex: 2,
        background: 'white',
        borderRadius: '10px',
        padding: '2rem',
        boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
        position: 'relative',
        overflowY: 'auto',
        maxHeight: 'calc(100vh - 200px)'
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
              // Mode normal - AFFICHAGE COMPLET DU CHAPITRE
              <>
                {/* Titre du chapitre avec sous-titre */}
                <div style={{ marginBottom: '2rem' }}>
                  <h2 style={{ margin: '0 0 0.5rem', color: '#333' }}>
                    {selectedChapter.title}
                  </h2>
                  <p style={{ margin: 0, color: '#666', fontSize: '0.9rem' }}>
                    ALBUM PRESTIGE • {chapters.length} CHAPITRES
                  </p>
                </div>

                {/* QUESTIONS SUGGÉRÉES PAR L'IA */}
                <div style={{
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  padding: '1.5rem',
                  borderRadius: '10px',
                  marginBottom: '2rem',
                  color: 'white'
                }}>
                  <h3 style={{ margin: '0 0 1rem', color: 'white', fontSize: '1.1rem' }}>
                    ✨ QUESTIONS SUGGÉRÉES PAR L'IA
                  </h3>
                  
                  <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
                    {selectedChapter.questions_ia && selectedChapter.questions_ia.length > 0 ? (
                      selectedChapter.questions_ia.map((q, idx) => (
                        <li key={idx} style={{ marginBottom: '0.8rem', lineHeight: '1.5' }}>{q}</li>
                      ))
                    ) : (
                      <li style={{ fontStyle: 'italic' }}>Aucune question pour l'instant</li>
                    )}
                  </ul>

                  <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'center' }}>
                    <button
                      onClick={() => generateAIQuestions(selectedChapter)}
                      disabled={generatingQuestions}
                      style={{
                        padding: '0.6rem 1.2rem',
                        background: 'white',
                        color: '#764ba2',
                        border: 'none',
                        borderRadius: '5px',
                        fontSize: '0.9rem',
                        fontWeight: 'bold',
                        cursor: generatingQuestions ? 'not-allowed' : 'pointer',
                        opacity: generatingQuestions ? 0.7 : 1
                      }}
                    >
                      {generatingQuestions ? '✨ Génération...' : '🎲 Générer de nouvelles questions'}
                    </button>
                  </div>
                </div>

                {/* MA CONTRIBUTION PERSONNELLE */}
                <div style={{
                  background: '#f8f9fa',
                  padding: '1.5rem',
                  borderRadius: '10px',
                  marginBottom: '2rem',
                  border: '1px solid #e9ecef'
                }}>
                  <h3 style={{ margin: '0 0 1rem', color: '#333' }}>MA CONTRIBUTION PERSONNELLE</h3>
                  
                  <textarea
                    value={contributionText}
                    onChange={(e) => setContributionText(e.target.value)}
                    placeholder="Rédigez ici votre texte pour ce chapitre..."
                    rows="6"
                    style={{
                      width: '100%',
                      padding: '1rem',
                      border: '1px solid #ddd',
                      borderRadius: '5px',
                      fontSize: '1rem',
                      marginBottom: '1.5rem',
                      resize: 'vertical'
                    }}
                  />

                  <div style={{ marginBottom: '1.5rem' }}>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handlePhotoChange}
                      id="photo-upload"
                      style={{ display: 'none' }}
                      disabled={photos.length >= 2}
                    />
                    
                    <label
                      htmlFor="photo-upload"
                      style={{
                        display: 'inline-block',
                        padding: '0.8rem 2rem',
                        background: 'white',
                        border: '2px dashed #ccc',
                        borderRadius: '5px',
                        cursor: photos.length >= 2 ? 'not-allowed' : 'pointer',
                        color: photos.length >= 2 ? '#999' : '#333',
                        marginBottom: '1rem'
                      }}
                    >
                      📷 Ajouter mes photos (max 2)
                    </label>
                    
                    <p style={{ margin: 0, color: '#666', fontSize: '0.9rem' }}>
                      {photos.length}/2 photos
                    </p>
                  </div>

                  {/* Aperçu des photos */}
                  {photoPreviews.length > 0 && (
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))',
                      gap: '1rem',
                      marginBottom: '1.5rem'
                    }}>
                      {photoPreviews.map((preview, index) => (
                        <div key={index} style={{ position: 'relative' }}>
                          <img
                            src={preview}
                            alt={`Aperçu ${index + 1}`}
                            style={{
                              width: '100%',
                              height: '100px',
                              objectFit: 'cover',
                              borderRadius: '5px'
                            }}
                          />
                          <button
                            onClick={() => removePhoto(index)}
                            style={{
                              position: 'absolute',
                              top: '-5px',
                              right: '-5px',
                              width: '25px',
                              height: '25px',
                              borderRadius: '50%',
                              background: '#dc3545',
                              color: 'white',
                              border: 'none',
                              cursor: 'pointer'
                            }}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <button
                    onClick={handleSubmitContribution}
                    disabled={submitting || !contributionText.trim()}
                    style={{
                      width: '100%',
                      padding: '1rem',
                      background: submitting || !contributionText.trim() ? '#ccc' : '#28a745',
                      color: 'white',
                      border: 'none',
                      borderRadius: '5px',
                      fontSize: '1rem',
                      fontWeight: 'bold',
                      cursor: submitting || !contributionText.trim() ? 'not-allowed' : 'pointer'
                    }}
                  >
                    {submitting ? 'Envoi en cours...' : 'ENREGISTRER MA CONTRIBUTION'}
                  </button>
                </div>

                {/* Inviter des proches - VERSION CORRIGÉE */}
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
                    onClick={(e) => copyInviteLink(selectedChapter.id, e)}
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
                  
                  {inviteSuccess === selectedChapter.id && (
                    <p style={{ color: '#28a745', marginTop: '1rem' }}>
                      ✅ Lien copié dans le presse-papier !
                    </p>
                  )}
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
              Cliquez sur un chapitre à gauche pour voir les questions, ajouter votre contribution et inviter des proches
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChapterList;