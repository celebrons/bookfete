// C:\Users\USER\bookfete\frontend\src\components\book\chapters\ChapterDetails.js
import React from 'react';
import QuestionsSection from './QuestionsSection';
import ContributionForm from './ContributionForm';
import InviteSection from './InviteSection';

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
  inviteSuccess
}) => {
  return (
    <>
      {/* Titre du chapitre avec sous-titre */}
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
              borderRadius: '5px',
              cursor: 'pointer',
              fontSize: '0.9rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
          >
            👁️ Voir/Modérer ({chapter.contributions?.[0]?.count || 0})
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
      />

      {/* MA CONTRIBUTION PERSONNELLE */}
      <ContributionForm
        contributionText={contributionText}
        setContributionText={setContributionText}
        photos={photos}
        photoPreviews={photoPreviews}
        onPhotoChange={onPhotoChange}
        onRemovePhoto={onRemovePhoto}
        onSubmit={onSubmitContribution}
        submitting={submitting}
      />

      {/* Inviter des proches */}
      <InviteSection
        chapterId={chapter.id}
        onCopyInviteLink={onCopyInviteLink}
        inviteSuccess={inviteSuccess}
      />
    </>
  );
};

export default ChapterDetails;