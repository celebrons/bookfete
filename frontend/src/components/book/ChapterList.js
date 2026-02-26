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
import { useChapterActions } from './chapters/hooks/useChapterActions';

const ChapterList = ({ chapters, bookId, onUpdateChapter, onDeleteChapter, onAddChapter, book, onUpdateBook }) => {
  const [selectedItem, setSelectedItem] = useState(null);
  const [selectedType, setSelectedType] = useState('chapter');
  const [showGuide, setShowGuide] = useState(true);
  const [newQuestion, setNewQuestion] = useState('');
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

  // Hooks personnalisés pour les actions des chapitres
  const {
    editingChapter,
    editingQuestions,
    generatingQuestions,
    deleteConfirm,
    setEditingChapter,
    setEditingQuestions,
    setDeleteConfirm,
    handleEdit,
    handleEditQuestions,
    handleDeleteClick,
    handleSaveEdit,
    handleSaveQuestions,
    generateAIQuestions
  } = useChapterActions(bookId, onUpdateChapter, setSelectedItem);

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

  // Fonctions pour les questions
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

  // Fonctions pour les contributions
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
  
  const requestRevision = async (contributionId, feedback) => {
  try {
    const { error } = await supabase
      .from('contributions')
      .update({ 
        needs_revision: true,
        moderation_feedback: feedback,
        approved: false 
      })
      .eq('id', contributionId);

    if (error) throw error;

    // Mettre à jour l'état local
    setChapterContributions(prev =>
      prev.map(c => 
        c.id === contributionId 
          ? { ...c, needs_revision: true, moderation_feedback: feedback } 
          : c
      )
    );

    alert('✅ Demande de modification envoyée au contributeur');
  } catch (error) {
    console.error('❌ Erreur:', error);
    alert('Erreur lors de la demande de modification');
  }
};

  // Fonctions d'invitation
  const handleOpenInviteSelector = (chapter, e) => {
    e.stopPropagation();
    if (!chapter || !chapter.id) {
      alert('Erreur: impossible d\'identifier le chapitre');
      return;
    }
    setSelectedChapterForInvite(chapter);
    setShowInviteSelector(true);
  };

  // Fonctions photos
  const handlePhotoChange = (e) => {
    const files = Array.from(e.target.files);
    if (photos.length + files.length > 2) {
      alert('Maximum 2 photos');
      return;
    }

    const validFiles = files.filter(file => {
      const isValid = file.type.startsWith('image/') && file.size <= 5 * 1024 * 1024;
      if (!isValid) alert(`${file.name} : format invalide ou trop volumineux (max 5MB)`);
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

        if (uploadError) continue;

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

  // Fonctions couverture
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
        inviteSuccess={false}
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
        {/* Modals et contenu */}
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
              <h3>Supprimer le chapitre ?</h3>
              <p>{deleteConfirm.title}</p>
              <div style={{ display: 'flex', gap: '1rem' }}>
                <button onClick={() => setDeleteConfirm(null)}>Annuler</button>
                <button onClick={() => onDeleteChapter(deleteConfirm.id)}>Supprimer</button>
              </div>
            </div>
          </div>
        )}

        {/* Éditeurs */}
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

        {selectedType === 'chapter' && editingChapter && (
          <ChapterEditor
            editingChapter={editingChapter}
            setEditingChapter={setEditingChapter}
            onSave={handleSaveEdit}
            onCancel={() => setEditingChapter(null)}
          />
        )}

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

        {selectedType === 'chapter' && showContributions && !editingChapter && !editingQuestions && (
          <ContributionsModeration
            chapterTitle={selectedItem?.title}
            contributions={chapterContributions}
            loading={loadingContributions}
            onApprove={approveContribution}
            onDelete={deleteContribution}
            onBack={() => setShowContributions(false)}
            organizerEmail={user?.email}
			onRequestRevision={requestRevision} 
          />
        )}

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
            inviteSuccess={false}
            userEmail={user?.email}
            user={user}
            book={book}
			onEditQuestions={handleEditQuestions}
          />
        )}

        {!selectedItem && (
          <div style={{ textAlign: 'center', padding: '2rem', color: '#999' }}>
            <span style={{ fontSize: '4rem' }}>📖</span>
            <h3>Sélectionnez un chapitre</h3>
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
        />
      )}
    </div>
  );
};

export default ChapterList;