// C:\Users\USER\bookfete\frontend\src\components\book\ChapterList.js
import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabaseClient';
import ChapterSidebar from './chapters/ChapterSidebar';
import CoverEditor from './cover/CoverEditor';
import BackCoverEditor from './backcover/BackCoverEditor';
import ChapterDetails from './chapters/ChapterDetails';
import ChapterEditor from './chapters/ChapterEditor';
import QuestionsEditor from './chapters/QuestionsEditor';
import ContributionsModeration from './chapters/ContributionsModeration';
import InviteSelector from './contributors/InviteSelector';

const ChapterList = ({ chapters, bookId, onUpdateChapter, onDeleteChapter, onAddChapter, book, onUpdateBook }) => {
  const [editingChapter, setEditingChapter] = useState(null);
  const [editingQuestions, setEditingQuestions] = useState(null);
  const [inviteSuccess, setInviteSuccess] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [selectedType, setSelectedType] = useState('chapter');
  const [showGuide, setShowGuide] = useState(true);
  const [newQuestion, setNewQuestion] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [generatingQuestions, setGeneratingQuestions] = useState(false);
  const [user, setUser] = useState(null);
  
  // États pour la contribution
  const [contributionText, setContributionText] = useState('');
  const [photos, setPhotos] = useState([]);
  const [photoPreviews, setPhotoPreviews] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  // États pour les contributions (modération)
  const [showContributions, setShowContributions] = useState(false);
  const [chapterContributions, setChapterContributions] = useState([]);
  const [loadingContributions, setLoadingContributions] = useState(false);

  // États pour le sélecteur d'invitations
  const [showInviteSelector, setShowInviteSelector] = useState(false);
  const [selectedChapterForInvite, setSelectedChapterForInvite] = useState(null);

  // États pour la couverture
  const [editingCover, setEditingCover] = useState(false);
  const [coverConfig, setCoverConfig] = useState(
    book?.cover_config || {
      title: book?.title || '',
      subtitle: '',
      template: 'classic',
      color: '#8B4513',
      font: 'Playfair Display'
    }
  );

  // États pour la 4ème couverture
  const [editingBackCover, setEditingBackCover] = useState(false);
  const [backCoverConfig, setBackCoverConfig] = useState(
    book?.back_cover_config || {
      template: 'classic',
      show_contributors: true,
      custom_text: '',
      color: '#f5f5f5'
    }
  );
  const [contributors, setContributors] = useState([]);

  // Récupérer l'utilisateur connecté
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
    });
  }, []);

  // Charger les contributeurs
  useEffect(() => {
    if (chapters.length > 0) {
      loadContributors();
    }
  }, [chapters]);

  const loadContributors = async () => {
    try {
      const chapterIds = chapters.map(ch => ch.id);
      if (chapterIds.length === 0) return;

      const { data, error } = await supabase
        .from('contributions')
        .select('contributor_name')
        .in('chapter_id', chapterIds)
        .eq('approved', true)
        .order('created_at', { ascending: true });

      if (error) throw error;

      const uniqueNames = [...new Set(data.map(c => c.contributor_name))];
      setContributors(uniqueNames);
    } catch (error) {
      console.error('❌ Erreur chargement contributeurs:', error);
    }
  };

  // ==================== FONCTIONS DES CHAPITRES ====================
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
      if (selectedItem?.id === deleteConfirm.id) {
        setSelectedItem(null);
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

  // ==================== FONCTION IA MODIFIÉE ====================
  const generateAIQuestions = async (chapter) => {
    try {
      setGeneratingQuestions(true);
      
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      
      if (!token) {
        alert('Vous devez être connecté');
        return;
      }

      console.log('🤖 Génération IA avec:', {
        chapterTitle: chapter.title,
        bookTitle: book?.title,
        eventType: book?.event_type,
        style: book?.style_narratif
      });

      const response = await fetch(`${process.env.REACT_APP_API_URL}/ai/generate-questions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          chapterTitle: chapter.title,
          bookTitle: book?.title,
          eventType: book?.event_type || 'default',
          style: book?.style_narratif || 'factuel'
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erreur génération IA');
      }

      await onUpdateChapter(chapter.id, {
        questions_ia: data.questions
      });

      setSelectedItem(prev => ({
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

  // ==================== FONCTIONS CONTRIBUTIONS ====================
  const loadContributions = async (chapterId) => {
    setLoadingContributions(true);
    try {
      const { data, error } = await supabase
        .from('contributions')
        .select('*')
        .eq('chapter_id', chapterId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setChapterContributions(data || []);
      setShowContributions(true);
    } catch (error) {
      console.error('❌ Erreur chargement contributions:', error);
      alert('Erreur lors du chargement des contributions');
    } finally {
      setLoadingContributions(false);
    }
  };

  const approveContribution = async (contributionId) => {
    try {
      const { error } = await supabase
        .from('contributions')
        .update({ approved: true })
        .eq('id', contributionId);

      if (error) throw error;

      setChapterContributions(prev =>
        prev.map(c => c.id === contributionId ? { ...c, approved: true } : c)
      );
    } catch (error) {
      console.error('❌ Erreur approbation:', error);
      alert('Erreur lors de l\'approbation');
    }
  };

  const deleteContribution = async (contributionId) => {
    if (!window.confirm('Supprimer cette contribution ?')) return;

    try {
      const { error } = await supabase
        .from('contributions')
        .delete()
        .eq('id', contributionId);

      if (error) throw error;

      setChapterContributions(prev => prev.filter(c => c.id !== contributionId));
    } catch (error) {
      console.error('❌ Erreur suppression:', error);
      alert('Erreur lors de la suppression');
    }
  };

  // ==================== FONCTIONS INVITATION ====================
  const handleOpenInviteSelector = (chapter, e) => {
    e.stopPropagation();
    console.log('📌 handleOpenInviteSelector appelé avec:', chapter);
    
    if (!chapter || !chapter.id) {
      console.error('❌ Erreur: chapter ou chapter.id manquant');
      alert('Erreur: impossible d\'identifier le chapitre');
      return;
    }
    
    setSelectedChapterForInvite(chapter);
    setShowInviteSelector(true);
  };

  // ==================== FONCTIONS PHOTOS ====================
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
    if (!selectedItem || selectedType !== 'chapter') return;
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
        const fileName = `${selectedItem.id}/${Date.now()}.${fileExt}`;
        
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
          chapter_id: selectedItem.id,
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

  // ==================== FONCTIONS COUVERTURE ====================
  const handleSaveCover = async () => {
    await onUpdateBook({ cover_config: coverConfig });
    setEditingCover(false);
  };

  const handleSaveBackCover = async () => {
    await onUpdateBook({ back_cover_config: backCoverConfig });
    setEditingBackCover(false);
  };

  const getStatusColor = (contributions) => {
    const count = contributions?.[0]?.count || 0;
    if (count === 0) return '#ffc107';
    if (count < 3) return '#17a2b8';
    return '#28a745';
  };

  const handleSelectItem = (item, type) => {
    setSelectedItem(item);
    setSelectedType(type);
    setShowContributions(false);
    setEditingChapter(null);
    setEditingQuestions(null);
    if (type === 'cover') setEditingCover(false);
    if (type === 'backcover') setEditingBackCover(false);
  };

  return (
    <div style={{ 
      display: 'flex', 
      gap: '2rem',
      height: '100%',
      minHeight: '600px',
      alignItems: 'stretch'
    }}>
      {/* Sidebar gauche */}
      <ChapterSidebar
        chapters={chapters}
        book={book}
        selectedType={selectedType}
        selectedItem={selectedItem}
        onSelectItem={handleSelectItem}
        onAddChapter={onAddChapter}
        onEditChapter={handleEdit}
        onEditQuestions={handleEditQuestions}
        onDeleteClick={handleDeleteClick}
        onCopyInviteLink={handleOpenInviteSelector}
        inviteSuccess={inviteSuccess}
        deleteConfirm={deleteConfirm}
        getStatusColor={getStatusColor}
        coverConfig={coverConfig}
        contributors={contributors}
        showGuide={showGuide}
        setShowGuide={setShowGuide}
      />

      {/* Colonne droite */}
      <div style={{ 
        flex: 2,
        background: 'white',
        borderRadius: '10px',
        padding: '2rem',
        boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
        height: '100%',
        overflowY: 'auto',
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

        {/* ========== COUVERTURE ========== */}
        {selectedType === 'cover' && (
          <CoverEditor
            coverConfig={coverConfig}
            setCoverConfig={setCoverConfig}
            book={book}
            onSave={editingCover ? handleSaveCover : () => setEditingCover(true)}
            onCancel={() => setEditingCover(false)}
            isEditing={editingCover}
          />
        )}

        {/* ========== 4ÈME COUVERTURE ========== */}
        {selectedType === 'backcover' && (
          <BackCoverEditor
            backCoverConfig={backCoverConfig}
            setBackCoverConfig={setBackCoverConfig}
            contributors={contributors}
            onSave={editingBackCover ? handleSaveBackCover : () => setEditingBackCover(true)}
            onCancel={() => setEditingBackCover(false)}
            isEditing={editingBackCover}
          />
        )}

        {/* ========== CHAPITRES - MODE ÉDITION TITRE ========== */}
        {selectedType === 'chapter' && editingChapter && (
          <ChapterEditor
            editingChapter={editingChapter}
            setEditingChapter={setEditingChapter}
            onSave={handleSaveEdit}
            onCancel={() => setEditingChapter(null)}
          />
        )}

        {/* ========== CHAPITRES - MODE ÉDITION QUESTIONS ========== */}
        {selectedType === 'chapter' && editingQuestions && !editingChapter && (
          <QuestionsEditor
            editingQuestions={editingQuestions}
            setEditingQuestions={setEditingQuestions}
            newQuestion={newQuestion}
            setNewQuestion={setNewQuestion}
            onAddQuestion={addQuestion}
            onRemoveQuestion={removeQuestion}
            onSave={handleSaveQuestions}
            onCancel={() => setEditingQuestions(null)}
          />
        )}

        {/* ========== CHAPITRES - MODE MODÉRATION ========== */}
        {selectedType === 'chapter' && showContributions && !editingChapter && !editingQuestions && (
          <ContributionsModeration
            chapterTitle={selectedItem?.title}
            contributions={chapterContributions}
            loading={loadingContributions}
            onApprove={approveContribution}
            onDelete={deleteContribution}
            onBack={() => setShowContributions(false)}
          />
        )}

        {/* ========== CHAPITRES - MODE NORMAL ========== */}
        {selectedType === 'chapter' && selectedItem && !editingChapter && !editingQuestions && !showContributions && (
          <ChapterDetails
            chapter={selectedItem}
            chaptersCount={chapters.length}
            onGenerateQuestions={generateAIQuestions}
            generatingQuestions={generatingQuestions}
            contributionText={contributionText}
            setContributionText={setContributionText}
            photos={photos}
            photoPreviews={photoPreviews}
            onPhotoChange={handlePhotoChange}
            onRemovePhoto={removePhoto}
            onSubmitContribution={handleSubmitContribution}
            submitting={submitting}
            onLoadContributions={loadContributions}
            onCopyInviteLink={handleOpenInviteSelector}
            inviteSuccess={inviteSuccess}
            userEmail={user?.email}
          />
        )}

        {/* ========== AUCUNE SÉLECTION ========== */}
        {!selectedItem && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '400px',
            color: '#999',
            height: '100%'
          }}>
            <span style={{ fontSize: '4rem', marginBottom: '1rem' }}>📖</span>
            <h3>Sélectionnez un élément</h3>
            <p style={{ textAlign: 'center', maxWidth: '400px' }}>
              Cliquez sur un chapitre pour commencer
            </p>
          </div>
        )}
      </div>

      {/* Modal d'invitation */}
      {showInviteSelector && selectedChapterForInvite && (
        <InviteSelector
          chapterId={selectedChapterForInvite.id}
          bookId={bookId}
          onClose={() => {
            setShowInviteSelector(false);
            setSelectedChapterForInvite(null);
          }}
          onInvitesSent={() => {
            // Optionnel: rafraîchir quelque chose
          }}
        />
      )}

      {/* Style pour l'animation du spinner */}
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default ChapterList;