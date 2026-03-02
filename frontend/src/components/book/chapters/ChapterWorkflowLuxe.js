// C:\Users\USER\bookfete\frontend\src\components\book\chapters\ChapterWorkflowLuxe.js
import React, { useEffect, useRef, useState } from 'react';
import Step1Questions from './Step1Questions';
import Step2Contribution from './Step2Contribution';
import Step3Invitations from './Step3Invitations';
import Step4Cloture from './Step4Cloture';
import '../BookLuxe.css';

const getDefaultExpandedSections = ({ questionsValidated, hasContributed, contributionsClosed, isClosed }) => {
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
  const [expandedSections, setExpandedSections] = useState(() =>
    getDefaultExpandedSections({ questionsValidated, hasContributed, contributionsClosed, isClosed })
  );
  const previousStateRef = useRef({
    questionsValidated,
    hasContributed,
    isFinalized,
    contributionsClosed,
    isClosed
  });

  const toggleSection = (step) => {
    setExpandedSections(prev => ({ ...prev, [step]: !prev[step] }));
  };

  useEffect(() => {
    const previousState = previousStateRef.current;
    const progressed =
      (!previousState.questionsValidated && questionsValidated) ||
      (!previousState.hasContributed && hasContributed) ||
      (!previousState.isFinalized && isFinalized) ||
      (!previousState.contributionsClosed && contributionsClosed) ||
      (!previousState.isClosed && isClosed);

    if (progressed) {
      setExpandedSections(
        getDefaultExpandedSections({ questionsValidated, hasContributed, contributionsClosed, isClosed })
      );
    }

    previousStateRef.current = {
      questionsValidated,
      hasContributed,
      isFinalized,
      contributionsClosed,
      isClosed
    };
  }, [questionsValidated, hasContributed, isFinalized, contributionsClosed, isClosed]);

  return (
    <div className="workflow-container" style={{ marginBottom: 'var(--space-xl)' }}>
      
      {/* ÉTAPE 1 */}
      <div className={`workflow-step ${questionsValidated ? 'completed' : ''}`}>
        <div 
          className={`workflow-header ${expandedSections.step1 ? 'expanded' : ''}`}
          onClick={() => toggleSection('step1')}
        >
          <span className="workflow-step-number">{questionsValidated ? '✓' : '1'}</span>
          <span className="workflow-step-title">Questions pour les contributeurs</span>
          <span className="workflow-step-status">
            {questionsValidated ? '✅' : 'À faire'}
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

      {/* ÉTAPE 2 */}
      <div className={`workflow-step ${isFinalized ? 'completed' : ''} ${!questionsValidated ? 'locked' : ''}`}>
        <div 
          className={`workflow-header ${expandedSections.step2 ? 'expanded' : ''}`}
          onClick={() => questionsValidated && toggleSection('step2')}
          style={{ cursor: questionsValidated ? 'pointer' : 'default' }}
        >
          <span className="workflow-step-number">
            {isFinalized ? '✓' : (hasContributed ? '📝' : '2')}
          </span>
          <span className="workflow-step-title">Votre contribution</span>
          <span className="workflow-step-status">
            {!questionsValidated ? '🔒' : 
             isFinalized ? '✅' : 
             hasContributed ? '📝' : 'À faire'}
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

      {/* ÉTAPE 3 */}
      <div className={`workflow-step ${contributionsClosed ? 'completed' : ''} ${!hasContributed ? 'locked' : ''}`}>
        <div 
          className={`workflow-header ${expandedSections.step3 ? 'expanded' : ''}`}
          onClick={() => hasContributed && toggleSection('step3')}
          style={{ cursor: hasContributed ? 'pointer' : 'default' }}
        >
          <span className="workflow-step-number">{contributionsClosed ? '✓' : '3'}</span>
          <span className="workflow-step-title">Inviter des contributeurs</span>
          <span className="workflow-step-status">
            {!hasContributed ? '🔒' :
             contributionsClosed ? '✅' :
             (invitationsCount > 0 ? `${invitationsCount}` : 'À faire')}
          </span>
        </div>
        {expandedSections.step3 && hasContributed && (
          <Step3Invitations
            {...props}
            hasContributed={hasContributed}
          />
        )}
      </div>

      {/* ÉTAPE 4 */}
      <div className={`workflow-step ${isClosed ? 'completed' : ''}`}>
        <div 
          className={`workflow-header ${expandedSections.step4 ? 'expanded' : ''}`}
          onClick={() => toggleSection('step4')}
        >
          <span className="workflow-step-number">{isClosed ? '✓' : '4'}</span>
          <span className="workflow-step-title">Clôturer le chapitre</span>
          <span className="workflow-step-status">{isClosed ? '✅' : ''}</span>
        </div>
        {expandedSections.step4 && <Step4Cloture {...props} />}
      </div>
    </div>
  );
};

export default ChapterWorkflowLuxe;
