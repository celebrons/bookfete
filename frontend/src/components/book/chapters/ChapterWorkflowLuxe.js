import React, { useEffect, useRef, useState } from 'react';
import Step1Questions from './Step1Questions';
import Step2Contribution from './Step2Contribution';
import Step3Invitations from './Step3Invitations';
import Step4Cloture from './Step4Cloture';
import '../BookLuxe.css';

const getDefaultExpandedSections = ({
  questionsValidated,
  hasContributed,
  contributionsClosed,
  isClosed,
  isSoloMode
}) => {
  if (!questionsValidated) {
    return {
      step1: true,
      step2: false,
      step3: false,
      step4: false
    };
  }

  if (!hasContributed) {
    return {
      step1: false,
      step2: true,
      step3: false,
      step4: false
    };
  }

  if (isSoloMode) {
    return {
      step1: false,
      step2: false,
      step3: false,
      step4: !isClosed
    };
  }

  if (!contributionsClosed) {
    return {
      step1: false,
      step2: false,
      step3: true,
      step4: false
    };
  }

  if (!isClosed) {
    return {
      step1: false,
      step2: false,
      step3: false,
      step4: true
    };
  }

  return {
    step1: false,
    step2: false,
    step3: false,
    step4: false
  };
};

const ChapterWorkflowLuxe = (props) => {
  const {
    chapter,
    user,
    book,
    onUpdateChapter,
    onSaveContribution,
    onFinalizeContribution
  } = props;

  const questionsValidated = chapter?.questions_validated || false;
  const hasContributed = chapter?.hasContributed || false;
  const isFinalized = chapter?.isFinalized || false;
  const invitationsCount = chapter?.invitationsCount || 0;
  const contributionsClosed = chapter?.contributionsClosed || false;
  const isClosed = chapter?.isChapterClosed || false;
  const chapterDraftStatus = chapter?.chapterDraft?.status || null;
  const isSoloMode = Boolean(book?.cover_config?.soloMode);
  const completedMarker = '\u2713';
  const [expandedSections, setExpandedSections] = useState(() =>
    getDefaultExpandedSections({
      questionsValidated,
      hasContributed,
      contributionsClosed,
      isClosed,
      isSoloMode
    })
  );
  const previousStateRef = useRef({
    questionsValidated,
    hasContributed,
    isFinalized,
    contributionsClosed,
    isClosed,
    isSoloMode
  });

  const toggleSection = (step) => {
    setExpandedSections((prev) => ({ ...prev, [step]: !prev[step] }));
  };

  useEffect(() => {
    const previousState = previousStateRef.current;
    const progressed =
      (!previousState.questionsValidated && questionsValidated) ||
      (!previousState.hasContributed && hasContributed) ||
      (!previousState.isFinalized && isFinalized) ||
      (!previousState.contributionsClosed && contributionsClosed) ||
      (!previousState.isClosed && isClosed) ||
      previousState.isSoloMode !== isSoloMode;

    if (progressed) {
      setExpandedSections(
        getDefaultExpandedSections({
          questionsValidated,
          hasContributed,
          contributionsClosed,
          isClosed,
          isSoloMode
        })
      );
    }

    previousStateRef.current = {
      questionsValidated,
      hasContributed,
      isFinalized,
      contributionsClosed,
      isClosed,
      isSoloMode
    };
  }, [questionsValidated, hasContributed, isFinalized, contributionsClosed, isClosed, isSoloMode]);

  return (
    <div className="workflow-container" style={{ marginBottom: 'var(--space-xl)' }}>
      <div className={`workflow-step ${questionsValidated ? 'completed' : ''}`}>
        <div
          className={`workflow-header ${expandedSections.step1 ? 'expanded' : ''}`}
          onClick={() => toggleSection('step1')}
        >
          <span className="workflow-step-number">{questionsValidated ? completedMarker : '1'}</span>
          <span className="workflow-step-title">Questions pour vous aider</span>
          <span className={`workflow-step-status ${questionsValidated ? 'is-complete' : 'is-todo'}`}>
            {questionsValidated ? 'Valide' : 'A faire'}
          </span>
        </div>
        {expandedSections.step1 && (
          <Step1Questions
            chapter={chapter}
            user={user}
            book={book}
            onUpdateChapter={onUpdateChapter}
          />
        )}
      </div>

      <div className={`workflow-step ${isFinalized ? 'completed' : ''} ${!questionsValidated ? 'locked' : ''}`}>
        <div
          className={`workflow-header ${expandedSections.step2 ? 'expanded' : ''}`}
          onClick={() => questionsValidated && toggleSection('step2')}
          style={{ cursor: questionsValidated ? 'pointer' : 'default' }}
        >
          <span className="workflow-step-number">
            {isFinalized ? completedMarker : (hasContributed ? 'B' : '2')}
          </span>
          <span className="workflow-step-title">Votre contribution</span>
          <span
            className={`workflow-step-status ${
              !questionsValidated ? 'is-locked' :
              isFinalized ? 'is-complete' :
              hasContributed ? 'is-draft' : 'is-todo'
            }`}
          >
            {!questionsValidated ? 'Verrouille' :
             isFinalized ? 'Validee' :
             hasContributed ? 'Brouillon' : 'A faire'}
          </span>
        </div>
        {expandedSections.step2 && questionsValidated && (
          <Step2Contribution
            chapter={chapter}
            user={user}
            book={book}
            onSaveContribution={onSaveContribution}
            onFinalizeContribution={onFinalizeContribution}
          />
        )}
      </div>

      {!isSoloMode && (
        <div className={`workflow-step ${contributionsClosed ? 'completed' : ''} ${!hasContributed ? 'locked' : ''}`}>
          <div
            className={`workflow-header ${expandedSections.step3 ? 'expanded' : ''}`}
            onClick={() => hasContributed && toggleSection('step3')}
            style={{ cursor: hasContributed ? 'pointer' : 'default' }}
          >
            <span className="workflow-step-number">{contributionsClosed ? completedMarker : '3'}</span>
            <span className="workflow-step-title">Inviter des contributeurs</span>
            <span
              className={`workflow-step-status ${
                !hasContributed ? 'is-locked' :
                contributionsClosed ? 'is-complete' :
                (invitationsCount > 0 ? 'is-active' : 'is-todo')
              }`}
            >
              {!hasContributed ? 'Verrouille' :
               contributionsClosed ? 'Clos' :
               (invitationsCount > 0 ? `${invitationsCount}` : 'A faire')}
            </span>
          </div>
          {expandedSections.step3 && hasContributed && (
            <Step3Invitations
              {...props}
              hasContributed={hasContributed}
            />
          )}
        </div>
      )}

      <div className={`workflow-step ${isClosed ? 'completed' : ''}`}>
        <div
          className={`workflow-header ${expandedSections.step4 ? 'expanded' : ''}`}
          onClick={() => toggleSection('step4')}
        >
          <span className="workflow-step-number">
            {isClosed ? completedMarker : (chapterDraftStatus === 'draft' ? 'B' : '4')}
          </span>
          <span className="workflow-step-title">Clore le chapitre</span>
          <span
            className={`workflow-step-status ${
              isClosed ? 'is-complete' :
              (chapterDraftStatus === 'draft' ? 'is-draft' : 'is-muted')
            }`}
          >
            {isClosed ? 'Clotur\u00e9' : (chapterDraftStatus === 'draft' ? 'Brouillon' : '')}
          </span>
        </div>
        {expandedSections.step4 && <Step4Cloture {...props} />}
      </div>
    </div>
  );
};

export default ChapterWorkflowLuxe;
