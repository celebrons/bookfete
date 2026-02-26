// C:\Users\USER\bookfete\frontend\src\components\book\chapters\ChapterWorkflow.js
import React, { useState, useEffect } from 'react';
import QuestionsSection from './QuestionsSection';
import ContributionForm from './ContributionForm';
import ChapterInvitations from './ChapterInvitations';

const ChapterWorkflow = ({
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
  onEditQuestions,
  onValidateQuestions,
  questionsValidated,
  hasContributed,
  onEditContribution,
  invitations,
  isFinalized,
  onFinalizeContribution,
  existingContribution
}) => {
  
  // État pour suivre l'étape courante
  const [currentStep, setCurrentStep] = useState(1);
  const [expandedSections, setExpandedSections] = useState({
    step1: true,
    step2: false,
    step3: false,
    step4: false
  });

  // Vérifier les étapes accomplies
  useEffect(() => {
    // Étape 1 : questions validées
    if (questionsValidated) {
      setExpandedSections(prev => ({ ...prev, step1: false, step2: true }));
      setCurrentStep(2);
    }

    // Étape 2 : organisateur a un brouillon (mais on ne ferme PAS l'étape)
    if (hasContributed && !isFinalized) {
      setCurrentStep(2);
      // On laisse l'étape 2 ouverte ou fermée selon le choix de l'utilisateur
    }

    // Étape 2 : organisateur a finalisé sa contribution
    if (isFinalized) {
      setExpandedSections(prev => ({ ...prev, step2: false, step3: true }));
      setCurrentStep(3);
    }

    // Étape 3 : invitations envoyées
    if (invitations && invitations.length > 0) {
      // On laisse l'étape 3 ouverte
    }
  }, [questionsValidated, hasContributed, isFinalized, invitations]);

  const toggleSection = (step) => {
    // On peut ouvrir/fermer n'importe quelle étape accessible
    if (step === 1 && questionsValidated) {
      setExpandedSections(prev => ({ ...prev, step1: !prev.step1 }));
    } else if (step === 2 && hasContributed && !isFinalized) {
      setExpandedSections(prev => ({ ...prev, step2: !prev.step2 }));
    } else if (step === 3) {
      setExpandedSections(prev => ({ ...prev, step3: !prev.step3 }));
    } else if (step === currentStep) {
      setExpandedSections(prev => ({
        ...prev,
        [`step${step}`]: !prev[`step${step}`]
      }));
    }
  };

  const isOrganizer = user && book && user.id === book.owner_id;

  return (
    <div style={{ marginBottom: '2rem' }}>
      {/* ÉTAPE 1 : Génération et validation des questions */}
      <div style={{
        border: '1px solid #e9ecef',
        borderRadius: '8px',
        marginBottom: '1rem',
        overflow: 'hidden'
      }}>
        <div
          onClick={() => questionsValidated && toggleSection(1)}
          style={{
            padding: '1rem',
            background: currentStep === 1 && expandedSections.step1 ? '#764ba2' : '#f8f9fa',
            color: currentStep === 1 && expandedSections.step1 ? 'white' : '#333',
            cursor: questionsValidated ? 'pointer' : 'default',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            borderBottom: expandedSections.step1 ? '1px solid #e9ecef' : 'none'
          }}
        >
          <span style={{
            width: '30px',
            height: '30px',
            borderRadius: '50%',
            background: questionsValidated ? '#28a745' : (currentStep === 1 ? '#764ba2' : '#6c757d'),
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 'bold'
          }}>
            {questionsValidated ? '✓' : '1'}
          </span>
          <span style={{ fontWeight: 'bold' }}>Étape 1 : Questions pour les contributeurs</span>
          <span style={{ marginLeft: 'auto', fontSize: '0.9rem' }}>
            {questionsValidated ? '✅ Validées' : (currentStep === 1 ? 'En cours' : 'À faire')}
          </span>
        </div>
        
        {expandedSections.step1 && (
          <div style={{ padding: '1.5rem' }}>
            <QuestionsSection
              questions={chapter.questions_ia}
              onGenerate={() => onGenerateQuestions(chapter)}
              generating={generatingQuestions}
              onEdit={() => onEditQuestions(chapter)}
              isOrganizer={isOrganizer}
              questionsValidated={questionsValidated}
              onValidate={onValidateQuestions}
              readOnly={questionsValidated}
            />
          </div>
        )}
      </div>

      {/* ÉTAPE 2 : Contribution de l'organisateur */}
      <div style={{
        border: '1px solid #e9ecef',
        borderRadius: '8px',
        marginBottom: '1rem',
        overflow: 'hidden',
        opacity: !questionsValidated ? 0.5 : 1,
        pointerEvents: !questionsValidated ? 'none' : 'auto'
      }}>
        <div
          onClick={() => questionsValidated && hasContributed && !isFinalized && toggleSection(2)}
          style={{
            padding: '1rem',
            background: currentStep === 2 && expandedSections.step2 ? '#764ba2' : '#f8f9fa',
            color: currentStep === 2 && expandedSections.step2 ? 'white' : '#333',
            cursor: (questionsValidated && hasContributed && !isFinalized) ? 'pointer' : 'default',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            borderBottom: expandedSections.step2 ? '1px solid #e9ecef' : 'none'
          }}
        >
          <span style={{
            width: '30px',
            height: '30px',
            borderRadius: '50%',
            background: isFinalized ? '#28a745' : (hasContributed ? '#ffc107' : (currentStep === 2 ? '#764ba2' : '#6c757d')),
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 'bold'
          }}>
            {isFinalized ? '✓' : (hasContributed ? '📝' : '2')}
          </span>
          <span style={{ fontWeight: 'bold' }}>Étape 2 : Votre contribution personnelle</span>
          <span style={{ marginLeft: 'auto', fontSize: '0.9rem' }}>
            {!questionsValidated ? '🔒 Attend étape 1' : 
             isFinalized ? '✅ Finalisée' : 
             hasContributed ? '📝 Brouillon' : 
             (currentStep === 2 ? 'En cours' : 'À faire')}
          </span>
        </div>
        
        {expandedSections.step2 && !isFinalized && (
          <div style={{ padding: '1.5rem' }}>
            <ContributionForm
			  contributionText={contributionText}
			  setContributionText={setContributionText}
			  photos={photos}
			  photoPreviews={photoPreviews}
			  onPhotoChange={onPhotoChange}
			  onRemovePhoto={onRemovePhoto}
			  onSubmit={onSubmitContribution}
			  submitting={submitting}
			  hasContributed={hasContributed}
			  onEdit={onEditContribution}
			  existingPhotos={existingContribution?.photo_urls || []}
			  chapterTitle={chapter.title}
			  isFinalized={isFinalized}
			  onFinalize={onFinalizeContribution}
			  contributionId={existingContribution?.id}
			/>
          </div>
        )}

        {expandedSections.step2 && isFinalized && (
          <div style={{ padding: '1.5rem' }}>
            <div style={{
              background: '#d4edda',
              padding: '2rem',
              borderRadius: '10px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✅</div>
              <h3 style={{ color: '#155724' }}>Contribution finalisée</h3>
              <p style={{ color: '#155724' }}>Vous ne pouvez plus la modifier.</p>
            </div>
          </div>
        )}
      </div>

      {/* ÉTAPE 3 : Invitations aux contributeurs */}
      <div style={{
        border: '1px solid #e9ecef',
        borderRadius: '8px',
        marginBottom: '1rem',
        overflow: 'hidden',
        opacity: !hasContributed ? 0.5 : 1,
        pointerEvents: !hasContributed ? 'none' : 'auto'
      }}>
        <div
          onClick={() => hasContributed && toggleSection(3)}
          style={{
            padding: '1rem',
            background: currentStep === 3 && expandedSections.step3 ? '#764ba2' : '#f8f9fa',
            color: currentStep === 3 && expandedSections.step3 ? 'white' : '#333',
            cursor: hasContributed ? 'pointer' : 'default',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem'
          }}
        >
          <span style={{
            width: '30px',
            height: '30px',
            borderRadius: '50%',
            background: invitations?.length > 0 ? '#28a745' : (currentStep === 3 ? '#764ba2' : '#6c757d'),
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 'bold'
          }}>
            {invitations?.length > 0 ? '✓' : '3'}
          </span>
          <span style={{ fontWeight: 'bold' }}>Étape 3 : Inviter des contributeurs</span>
          <span style={{ marginLeft: 'auto', fontSize: '0.9rem' }}>
            {!hasContributed ? '🔒 Attend étape 2' : (invitations?.length > 0 ? `${invitations.length} invité(s)` : 'À faire')}
          </span>
        </div>
        
        {expandedSections.step3 && (
          <div style={{ padding: '1.5rem' }}>
            <ChapterInvitations 
              chapterId={chapter.id} 
              onLoadContributions={onLoadContributions}
              onInviteClick={() => onCopyInviteLink(chapter)}
            />
          </div>
        )}
      </div>

      {/* ÉTAPE 4 : Validation et clôture (optionnelle) */}
      <div style={{
        border: '1px solid #e9ecef',
        borderRadius: '8px',
        overflow: 'hidden'
      }}>
        <div style={{
          padding: '1rem',
          background: '#f8f9fa',
          color: '#333',
          display: 'flex',
          alignItems: 'center',
          gap: '1rem'
        }}>
          <span style={{
            width: '30px',
            height: '30px',
            borderRadius: '50%',
            background: '#6c757d',
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 'bold'
          }}>
            4
          </span>
          <span style={{ fontWeight: 'bold' }}>Étape 4 : Valider et clôturer le chapitre</span>
          <span style={{ marginLeft: 'auto', fontSize: '0.9rem' }}>
            <button
              style={{
                padding: '0.3rem 1rem',
                background: '#dc3545',
                color: 'white',
                border: 'none',
                borderRadius: '5px',
                cursor: 'pointer'
              }}
            >
              Clôturer
            </button>
          </span>
        </div>
      </div>
    </div>
  );
};

export default ChapterWorkflow;