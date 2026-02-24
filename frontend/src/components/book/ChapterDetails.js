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

  // Vérifier si l'utilisateur a déjà contribué
  useEffect(() => {
    if (chapter?.id && userEmail) {
      checkUserContribution();
    }
  }, [chapter?.id, userEmail]);

  const checkUserContribution = async () => {
    try {
      setLoading(true);
      console.log('🔍 Vérification contribution pour:', { chapterId: chapter.id, userEmail });
      
      const { data, error } = await supabase
        .from('contributions')
        .select('id, message, photo_urls')
        .eq('chapter_id', chapter.id)
        .eq('contributor_email', userEmail)
        .maybeSingle();

      if (error) {
        console.error('❌ Erreur vérification:', error);
        return;
      }

      console.log('📦 Données trouvées:', data);
      
      if (data) {
        setHasContributed(true);
        // Optionnel: pré-remplir avec l'ancienne contribution si on veut éditer
        // setContributionText(data.message || '');
      } else {
        setHasContributed(false);
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
    // Re-vérifier après soumission
    await checkUserContribution();
    setIsEditing(false);
  };

  // Pendant le chargement, on peut afficher un loader
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
      {/* Titre du chapitre avec sous-titre */}
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <h2 style={{ margin: 0, color: '#333' }}>
            {chapter.title}
          </h2>
          {/* BOUTON VOIR/MODÉRER LES CONTRIBUTIONS */}
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

      {/* QUESTIONS SUGGÉRÉES PAR L'IA */}
      <QuestionsSection
        questions={chapter.questions_ia}
        onGenerate={() => onGenerateQuestions(chapter)}
        generating={generatingQuestions}
        chapterTitle={chapter.title}
        eventType={chapter.event_type}
        style={chapter.style_narratif}
      />

      {/* MA CONTRIBUTION PERSONNELLE */}
      {(!hasContributed || isEditing) ? (
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
        />
      ) : (
        <ContributionForm
          contributionText={contributionText}
          setContributionText={setContributionText}
          photos={photos}
          photoPreviews={photoPreviews}
          onPhotoChange={onPhotoChange}
          onRemovePhoto={onRemovePhoto}
          onSubmit={handleSubmit}
          submitting={submitting}
          hasContributed={true}
          onEdit={handleEdit}
        />
      )}

      {/* SECTION INVITATIONS */}
      <div style={{ marginTop: '2.5rem' }}>
        <ChapterInvitations chapterId={chapter.id} />
      </div>
    </>
  );
};

export default ChapterDetails;