// C:\Users\USER\bookfete\frontend\src\components\book\chapters\ChapterDetails.js
import React, { useState, useEffect } from 'react';
import QuestionsSection from './QuestionsSection';
import ContributionForm from './ContributionForm';
import ChapterInvitations from './ChapterInvitations';
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
      setContributionText(''); // ← IMPORTANT : vider le texte
      checkUserContribution();
    } else {
      console.log('⚠️ Pas de vérification - manque:', { 
        chapterId: !!chapter?.id, 
        userEmail: !!userEmail 
      });
    }
  }, [chapter?.id, userEmail]); // ← Se déclenche quand l'ID du chapitre change

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
        // Pré-remplir le texte pour le formulaire d'édition
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
        <p>Vérification de votre contribution pour ce chapitre...</p>
      </div>
    );
  }

  console.log('🎯 Rendu final - hasContributed =', hasContributed, 'isEditing =', isEditing);
  console.log('🎯 Message à afficher:', hasContributed ? existingContribution?.message : contributionText);

  return (
    <>
      {/* Titre du chapitre avec sous-titre */}
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <h2 style={{ margin: 0, color: '#333' }}>
            {chapter.title}
          </h2>
          <button
            onClick={() => onLoadContributions(chapter.id)}
            style={{
              padding: '0.6rem 1.2rem',
              background: '#17a2b8',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '0.9rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              transition: 'all 0.2s',
              fontWeight: '500'
            }}
            onMouseEnter={(e) => e.target.style.background = '#138496'}
            onMouseLeave={(e) => e.target.style.background = '#17a2b8'}
          >
            <span>👁️</span>
            Voir/Modérer ({chapter.contributions?.[0]?.count || 0})
          </button>
        </div>
        <p style={{ margin: '0.5rem 0 0', color: '#666', fontSize: '0.9rem' }}>
          ALBUM PRESTIGE • {chaptersCount} CHAPITRES
        </p>
      </div>

      {/* QUESTIONS IA - UNIQUEMENT si pas de contribution OU en mode édition */}
      {(!hasContributed || isEditing) && (
        <QuestionsSection
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
        console.log('📝 Rendu du formulaire pour le chapitre:', chapter.title) || (
          <ContributionForm
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
            chapterTitle={chapter.title} // ← Pour debug
          />
        )
      ) : (
        console.log('✅ Rendu du message de remerciement pour le chapitre:', chapter.title) || (
          <ContributionForm
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
            chapterTitle={chapter.title} // ← Pour debug
          />
        )
      )}

      {/* SECTION INVITATIONS */}
      <div style={{ marginTop: '2.5rem' }}>
        <ChapterInvitations chapterId={chapter.id} />
      </div>
    </>
  );
};

export default ChapterDetails;