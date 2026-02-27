// C:\Users\USER\bookfete\frontend\src\components\book\chapters\ChapterDetailsLuxe.js
import React, { useState, useEffect } from 'react';
import QuestionsSectionLuxe from './QuestionsSectionLuxe';
import ContributionFormLuxe from './ContributionFormLuxe';
import ChapterInvitationsLuxe from './ChapterInvitationsLuxe';
import { supabase } from '../../../services/supabaseClient';
import '../BookLuxe.css';

const ChapterDetailsLuxe = ({
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
  userEmail
}) => {
  const [hasContributed, setHasContributed] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [existingContribution, setExistingContribution] = useState(null);

  console.log('🔍 ===== NOUVEAU CHAPITRE =====');
  console.log('🔍 ChapterDetails - userEmail reçu:', userEmail);
  console.log('🔍 ChapterDetails - chapter ID:', chapter?.id);
  console.log('🔍 ChapterDetails - chapter title:', chapter?.title);

  // Vérifier si l'utilisateur a déjà contribué à CE chapitre précis
  useEffect(() => {
    if (chapter?.id && userEmail) {
      console.log('🔄 Lancement vérification contribution pour le chapitre:', chapter.id);
      // Réinitialiser les états quand on change de chapitre
      setHasContributed(false);
      setIsEditing(false);
      setExistingContribution(null);
      setContributionText('');
      checkUserContribution();
    } else {
      console.log('⚠️ Pas de vérification - manque:', { 
        chapterId: !!chapter?.id, 
        userEmail: !!userEmail 
      });
    }
  }, [chapter?.id, userEmail]);

  const checkUserContribution = async () => {
    try {
      setLoading(true);
      console.log('🔍 Vérification contribution pour le chapitre:', { 
        chapterId: chapter.id, 
        chapterTitle: chapter.title,
        userEmail,
        timestamp: new Date().toISOString()
      });
      
      const { data, error } = await supabase
        .from('contributions')
        .select('id, message, photo_urls, created_at')
        .eq('chapter_id', chapter.id)
        .eq('contributor_email', userEmail)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('❌ Erreur vérification:', error);
        return;
      }

      console.log('📦 Données trouvées pour ce chapitre:', data);
      console.log('📦 Nombre de contributions pour ce chapitre:', data?.length || 0);
      
      if (data && data.length > 0) {
        console.log('✅ Contribution existante trouvée pour ce chapitre - hasContributed = true');
        console.log('💬 Message:', data[0].message);
        console.log('📸 Photos:', data[0].photo_urls);
        
        setHasContributed(true);
        setExistingContribution(data[0]);
        setContributionText(data[0].message || '');
      } else {
        console.log('❌ Aucune contribution trouvée pour ce chapitre - hasContributed = false');
        setHasContributed(false);
        setExistingContribution(null);
        setContributionText('');
      }
      
    } catch (error) {
      console.error('❌ Erreur:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = () => {
    console.log('✏️ Mode édition activé pour le chapitre:', chapter.title);
    setIsEditing(true);
  };

  const handleSubmit = async () => {
    console.log('📤 Début soumission contribution pour le chapitre:', chapter.title);
    await onSubmitContribution();
    console.log('✅ Contribution soumise, re-vérification dans 1 seconde...');
    
    setTimeout(async () => {
      await checkUserContribution();
      setIsEditing(false);
    }, 1000);
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 'var(--space-xxl)' }}>
        <div className="spinner" style={{
          border: '2px solid var(--mist)',
          borderTop: '2px solid var(--gold)',
          borderRadius: '50%',
          width: '40px',
          height: '40px',
          animation: 'spin 1s linear infinite',
          margin: '0 auto var(--space-md)'
        }} />
        <p className="body-text" style={{ color: 'var(--text-light)' }}>
          Vérification de votre contribution...
        </p>
      </div>
    );
  }

  return (
    <>
      {/* Titre du chapitre */}
      <div className="chapter-details-header">
        <h2>{chapter.title}</h2>
        <button
          onClick={() => onLoadContributions(chapter.id)}
          className="btn-moderate"
        >
          <span>👁️</span>
          Voir/Modérer ({chapter.contributions?.[0]?.count || 0})
        </button>
      </div>
      
      <p className="chapter-subtitle">
        ALBUM PRESTIGE • {chaptersCount} CHAPITRES
      </p>

      {/* QUESTIONS IA - UNIQUEMENT si pas de contribution OU en mode édition */}
      {(!hasContributed || isEditing) && (
        <QuestionsSectionLuxe
          questions={chapter.questions_ia}
          onGenerate={() => onGenerateQuestions(chapter)}
          generating={generatingQuestions}
          chapterTitle={chapter.title}
          eventType={chapter.event_type}
          style={chapter.style_narratif}
        />
      )}

      {/* MA CONTRIBUTION PERSONNELLE */}
      {(!hasContributed || isEditing) ? (
        <ContributionFormLuxe
          contributionText={contributionText}
          setContributionText={setContributionText}
          photos={photos}
          photoPreviews={photoPreviews}
          onPhotoChange={onPhotoChange}
          onRemovePhoto={onRemovePhoto}
          onSubmit={handleSubmit}
          submitting={submitting}
          hasContributed={false}
          onEdit={handleEdit}
          existingPhotos={existingContribution?.photo_urls || []}
          chapterTitle={chapter.title}
        />
      ) : (
        <ContributionFormLuxe
          contributionText={existingContribution?.message || ''}
          setContributionText={setContributionText}
          photos={photos}
          photoPreviews={photoPreviews}
          onPhotoChange={onPhotoChange}
          onRemovePhoto={onRemovePhoto}
          onSubmit={handleSubmit}
          submitting={submitting}
          hasContributed={true}
          onEdit={handleEdit}
          existingPhotos={existingContribution?.photo_urls || []}
          chapterTitle={chapter.title}
        />
      )}

      {/* SECTION INVITATIONS */}
      <div className="invitations-section">
        <ChapterInvitationsLuxe chapterId={chapter.id} />
      </div>
    </>
  );
};

export default ChapterDetailsLuxe;