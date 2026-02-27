// C:\Users\USER\bookfete\frontend\src\components\book\ChapterListLuxe.js
import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabaseClient';
import ChapterSidebarLuxe from './chapters/ChapterSidebarLuxe';
import ChapterDetailsLuxe from './chapters/ChapterDetailsLuxe';
import ChapterEditorLuxe from './chapters/ChapterEditorLuxe';
import QuestionsEditorLuxe from './chapters/QuestionsEditorLuxe';
import ContributionsModerationLuxe from './chapters/ContributionsModerationLuxe';
import InviteSelectorLuxe from './contributors/InviteSelectorLuxe';
import './BookLuxe.css';

const ChapterListLuxe = ({ chapters, bookId, onUpdateChapter, onDeleteChapter, onAddChapter, book, onUpdateBook }) => {
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

  // États pour la couverture (optionnels, à garder pour l'instant)
  const [coverConfig] = useState(
    book?.cover_config || {
      title: book?.title || '',
      subtitle: '',
      template: 'classic',
      color: '#8B4513',
      font: 'Playfair Display'
    }
  );

  // États pour la 4ème couverture (optionnels, à garder pour l'instant)
  const [backCoverConfig] = useState(
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

  // ==================== FONCTION IA ====================
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

  const getStatusColor = (contributions) => {
    const count = contributions?.[0]?.count || 0;
    if (count === 0) return 'var(--gold)';
    if (count < 3) return 'var(--ink)';
    return 'var(--gold)';
  };

  const handleSelectItem = (item, type) => {
    setSelectedItem(item);
    setSelectedType(type);
    setShowContributions(false);
    setEditingChapter(null);
    setEditingQuestions(null);
  };

  return (
    <div className="chapters-container">
      {/* Sidebar gauche */}
      <ChapterSidebarLuxe
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
      <div className="right-panel">
        {/* Modal de confirmation de suppression */}
        {deleteConfirm && (
          <div className="delete-confirm">
            <div className="delete-confirm-card">
              <div className="delete-confirm-icon">⚠️</div>
              <h3 className="delete-confirm-title">Supprimer le chapitre ?</h3>
              <p className="delete-confirm-text">
                Êtes-vous sûr de vouloir supprimer le chapitre <strong>"{deleteConfirm.title}"</strong> ?
                <br />
                Cette action est irréversible. Toutes les contributions associées seront également supprimées.
              </p>
              <div className="delete-confirm-actions">
                <button
                  onClick={cancelDelete}
                  className="modal-btn modal-btn-secondary"
                >
                  Annuler
                </button>
                <button
                  onClick={confirmDelete}
                  className="modal-btn modal-btn-danger"
                >
                  Supprimer définitivement
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ========== CHAPITRES - MODE ÉDITION TITRE ========== */}
        {selectedType === 'chapter' && editingChapter && (
          <ChapterEditorLuxe
            editingChapter={editingChapter}
            setEditingChapter={setEditingChapter}
            onSave={handleSaveEdit}
            onCancel={() => setEditingChapter(null)}
          />
        )}

        {/* ========== CHAPITRES - MODE ÉDITION QUESTIONS ========== */}
        {selectedType === 'chapter' && editingQuestions && !editingChapter && (
          <QuestionsEditorLuxe
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
          <ContributionsModerationLuxe
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
          <ChapterDetailsLuxe
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
          <div className="empty-state">
            <div className="empty-state-icon">📖</div>
            <h3>Sélectionnez un élément</h3>
            <p>Cliquez sur un chapitre pour commencer</p>
          </div>
        )}
      </div>

      {/* Modal d'invitation */}
      {showInviteSelector && selectedChapterForInvite && (
        <InviteSelectorLuxe
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
    </div>
  );
};

export default ChapterListLuxe;