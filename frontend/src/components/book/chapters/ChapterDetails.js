// C:\Users\USER\bookfete\frontend\src\components\book\chapters\ChapterDetails.js
import React, { useState, useEffect } from 'react';
import ChapterWorkflow from './ChapterWorkflow';
import { supabase } from '../../../services/supabaseClient';

const ChapterDetails = ({
  chapter,
  chaptersCount,
  onGenerateQuestions,
  generatingQuestions,
  contributionText,
  setContributionText,
  photos,
  photoPreviews,
  onPhotoChange,
  onRemovePhoto,
  onSubmitContribution,
  submitting,
  onLoadContributions,
  onCopyInviteLink,
  inviteSuccess,
  userEmail,
  user,
  book,
  onEditQuestions
}) => {
  const [hasContributed, setHasContributed] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [existingContribution, setExistingContribution] = useState(null);
  const [questionsValidated, setQuestionsValidated] = useState(false);
  const [isFinalized, setIsFinalized] = useState(false);
  const [invitations, setInvitations] = useState([]);

  // Charger les invitations
  useEffect(() => {
    loadInvitations();
  }, [chapter.id]);

  const loadInvitations = async () => {
    try {
      const { data } = await supabase
        .from('chapter_invites')
        .select('*')
        .eq('chapter_id', chapter.id);
      setInvitations(data || []);
    } catch (error) {
      console.error('❌ Erreur chargement invitations:', error);
    }
  };

  // Vérifier si l'utilisateur est l'organisateur
  const isOrganizer = user && book && user.id === book.owner_id;

  useEffect(() => {
    console.log('🔍 ===== NOUVEAU CHAPITRE =====');
    console.log('🔍 ChapterDetails - userEmail reçu:', userEmail);
    console.log('🔍 ChapterDetails - chapter ID:', chapter?.id);
    console.log('🔍 ChapterDetails - chapter title:', chapter?.title);
    console.log('🔍 ChapterDetails - isOrganizer:', isOrganizer);
  }, [chapter, userEmail, isOrganizer]);

  // Vérifier si l'utilisateur a déjà contribué
  useEffect(() => {
    if (chapter?.id && userEmail) {
      checkUserContribution();
    }
  }, [chapter?.id, userEmail]);

  // Vérifier si les questions sont validées
  useEffect(() => {
    if (chapter?.id) {
      checkQuestionsValidation();
    }
  }, [chapter?.id]);

  const checkQuestionsValidation = async () => {
    try {
      const { data, error } = await supabase
        .from('chapters')
        .select('questions_validated')
        .eq('id', chapter.id)
        .single();

      if (error) throw error;
      setQuestionsValidated(data?.questions_validated || false);
    } catch (error) {
      console.error('❌ Erreur vérification validation:', error);
    }
  };

  const validateQuestions = async () => {
    try {
      const { error } = await supabase
        .from('chapters')
        .update({ questions_validated: true })
        .eq('id', chapter.id);

      if (error) throw error;
      setQuestionsValidated(true);
      alert('✅ Questions validées avec succès !');
    } catch (error) {
      console.error('❌ Erreur validation:', error);
      alert('Erreur lors de la validation');
    }
  };

  const checkUserContribution = async () => {
    try {
      setLoading(true);
      
      const { data, error } = await supabase
        .from('contributions')
        .select('id, message, photo_urls, created_at, is_finalized')
        .eq('chapter_id', chapter.id)
        .eq('contributor_email', userEmail)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      if (data && data.length > 0) {
        setHasContributed(true);
        setExistingContribution(data[0]);
        setContributionText(data[0].message || '');
        setIsFinalized(data[0].is_finalized || false);
      } else {
        setHasContributed(false);
        setExistingContribution(null);
        setContributionText('');
        setIsFinalized(false);
      }
      
    } catch (error) {
      console.error('❌ Erreur:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = () => {
    setIsEditing(true);
  };

  const handleSubmit = async () => {
    await onSubmitContribution();
    setTimeout(async () => {
      await checkUserContribution();
      setIsEditing(false);
    }, 1000);
  };

  const handleFinalizeContribution = async () => {
    try {
      if (!existingContribution) return;
      
      const { error } = await supabase
        .from('contributions')
        .update({ is_finalized: true })
        .eq('id', existingContribution.id);

      if (error) throw error;
      
      setIsFinalized(true);
      await checkUserContribution();
      
      alert('✅ Contribution finalisée avec succès !');
      
    } catch (error) {
      console.error('❌ Erreur finalisation:', error);
      alert('Erreur lors de la finalisation');
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '2rem' }}>
        <div className="spinner" style={{
          border: '3px solid #f3f3f3',
          borderTop: '3px solid #764ba2',
          borderRadius: '50%',
          width: '30px',
          height: '30px',
          animation: 'spin 1s linear infinite',
          margin: '0 auto 1rem'
        }} />
        <p>Vérification de votre contribution...</p>
      </div>
    );
  }

  return (
    <>
      <div style={{ marginBottom: '2rem' }}>
        <h2 style={{ margin: 0, color: '#333' }}>{chapter.title}</h2>
        <p style={{ margin: '0.5rem 0 0', color: '#666', fontSize: '0.9rem' }}>
          ALBUM PRESTIGE • {chaptersCount} CHAPITRES
        </p>
      </div>

      <ChapterWorkflow
        chapter={chapter}
        chaptersCount={chaptersCount}
        onGenerateQuestions={onGenerateQuestions}
        generatingQuestions={generatingQuestions}
        contributionText={contributionText}
        setContributionText={setContributionText}
        photos={photos}
        photoPreviews={photoPreviews}
        onPhotoChange={onPhotoChange}
        onRemovePhoto={onRemovePhoto}
        onSubmitContribution={handleSubmit}
        submitting={submitting}
        onLoadContributions={onLoadContributions}
        onCopyInviteLink={onCopyInviteLink}
        inviteSuccess={inviteSuccess}
        userEmail={userEmail}
        user={user}
        book={book}
        onEditQuestions={onEditQuestions}
        onValidateQuestions={validateQuestions}
        questionsValidated={questionsValidated}
        hasContributed={hasContributed}
        onEditContribution={handleEdit}
        invitations={invitations}
        isFinalized={isFinalized}
        onFinalizeContribution={handleFinalizeContribution}
        existingContribution={existingContribution}
      />
    </>
  );
};

export default ChapterDetails;