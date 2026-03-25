import React, { useEffect, useRef, useState } from 'react';
import Step1Amorce from './Step1Amorce';
import Step2Contribution from './Step2Contribution';
import Step3Invitations from './Step3Invitations';
import Step4Cloture from './Step4Cloture';
import '../BookLuxe.css';

const getDefaultActiveStep = ({
  amorceValidated,
  hasContributed,
  contributionsClosed,
  isClosed,
  isSoloMode
}) => {
  if (!amorceValidated) {
    return 'step1';
  }

  if (!hasContributed) {
    return 'step2';
  }

  if (isSoloMode) {
    return 'step4';
  }

  if (!contributionsClosed) {
    return 'step3';
  }

  if (!isClosed) {
    return 'step4';
  }

  return 'step4';
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

  const amorceValidated = Boolean(chapter?.amorce_validated || chapter?.questions_validated);
  const hasContributed = chapter?.hasContributed || false;
  const isFinalized = chapter?.isFinalized || false;
  const invitationsCount = chapter?.invitationsCount || 0;
  const contributionsClosed = chapter?.contributionsClosed || false;
  const isClosed = chapter?.isChapterClosed || false;
  const chapterDraftStatus = chapter?.chapterDraft?.status || null;
  const isSoloMode = Boolean(book?.cover_config?.soloMode);
  const completedMarker = '\u2713';
  const [activeStep, setActiveStep] = useState(() =>
    getDefaultActiveStep({
      amorceValidated,
      hasContributed,
      contributionsClosed,
      isClosed,
      isSoloMode
    })
  );
  const previousStateRef = useRef({
    amorceValidated,
    hasContributed,
    isFinalized,
    contributionsClosed,
    isClosed,
    isSoloMode
  });

  useEffect(() => {
    const previousState = previousStateRef.current;
    const progressed =
      (!previousState.amorceValidated && amorceValidated) ||
      (!previousState.hasContributed && hasContributed) ||
      (!previousState.isFinalized && isFinalized) ||
      (!previousState.contributionsClosed && contributionsClosed) ||
      (!previousState.isClosed && isClosed) ||
      previousState.isSoloMode !== isSoloMode;

    if (progressed) {
      setActiveStep(getDefaultActiveStep({
        amorceValidated,
        hasContributed,
        contributionsClosed,
        isClosed,
        isSoloMode
      }));
    }

    previousStateRef.current = {
      amorceValidated,
      hasContributed,
      isFinalized,
      contributionsClosed,
      isClosed,
      isSoloMode
    };
  }, [amorceValidated, hasContributed, isFinalized, contributionsClosed, isClosed, isSoloMode]);

  const steps = [
    {
      key: 'step1',
      order: 1,
      title: 'Amorce du chapitre',
      completed: amorceValidated,
      locked: isClosed && !amorceValidated,
      status: {
        tone: isClosed && !amorceValidated ? 'is-locked' : (amorceValidated ? 'is-complete' : 'is-todo'),
        label: isClosed && !amorceValidated ? 'Verrouille' : (amorceValidated ? 'Valide' : 'A faire')
      },
      content: (
        <Step1Amorce
          chapter={chapter}
          user={user}
          book={book}
          onUpdateChapter={onUpdateChapter}
        />
      )
    },
    {
      key: 'step2',
      order: 2,
      title: 'Votre contribution',
      completed: isFinalized,
      locked: !amorceValidated || (isClosed && !isFinalized),
      status: {
        tone: !amorceValidated
          ? 'is-locked'
          : ((isClosed && !isFinalized) ? 'is-locked' : (isFinalized ? 'is-complete' : (hasContributed ? 'is-draft' : 'is-todo'))),
        label: !amorceValidated
          ? 'Verrouille'
          : ((isClosed && !isFinalized) ? 'Verrouille' : (isFinalized ? 'Validee' : (hasContributed ? 'Brouillon' : 'A faire')))
      },
      content: amorceValidated ? (
        <Step2Contribution
          chapter={chapter}
          user={user}
          book={book}
          onSaveContribution={onSaveContribution}
          onFinalizeContribution={onFinalizeContribution}
        />
      ) : (
        <div className="workflow-content workflow-empty-state">
          Validez d abord l amorce du chapitre pour acceder a votre contribution.
        </div>
      )
    },
    ...(!isSoloMode ? [{
      key: 'step3',
      order: 3,
      title: 'Inviter des contributeurs',
      completed: contributionsClosed,
      locked: !hasContributed || (isClosed && !contributionsClosed),
      status: {
        tone: !hasContributed
          ? 'is-locked'
          : ((isClosed && !contributionsClosed) ? 'is-locked' : (contributionsClosed ? 'is-complete' : (invitationsCount > 0 ? 'is-active' : 'is-todo'))),
        label: !hasContributed
          ? 'Verrouille'
          : ((isClosed && !contributionsClosed) ? 'Verrouille' : (contributionsClosed ? 'Clos' : (invitationsCount > 0 ? `${invitationsCount}` : 'A faire')))
      },
      content: hasContributed ? (
        <Step3Invitations
          {...props}
          hasContributed={hasContributed}
        />
      ) : (
        <div className="workflow-content workflow-empty-state">
          Finalisez d abord votre contribution (etape 2) pour inviter des participants.
        </div>
      )
    }] : []),
    {
      key: 'step4',
      order: 4,
      title: 'Clore le chapitre',
      completed: isClosed,
      locked: false,
      status: {
        tone: isClosed ? 'is-complete' : (chapterDraftStatus === 'draft' ? 'is-draft' : 'is-muted'),
        label: isClosed ? 'Clotur\u00e9' : (chapterDraftStatus === 'draft' ? 'Brouillon' : '')
      },
      content: <Step4Cloture {...props} />
    }
  ];

  useEffect(() => {
    if (!isSoloMode || activeStep !== 'step3') {
      return;
    }

    setActiveStep(getDefaultActiveStep({
      amorceValidated,
      hasContributed,
      contributionsClosed,
      isClosed,
      isSoloMode
    }));
  }, [activeStep, isSoloMode, amorceValidated, hasContributed, contributionsClosed, isClosed]);

  const activeStepConfig = steps.find((step) => step.key === activeStep) || steps[0];
  const getStepVisualState = (step) => {
    if (activeStep === step.key) {
      return 'current';
    }
    if (step.completed) {
      return 'done';
    }
    if (step.locked) {
      return 'locked';
    }
    return 'upcoming';
  };

  return (
    <div className="workflow-layout" style={{ marginBottom: 'var(--space-xl)' }}>
      <aside className="workflow-steps-nav" aria-label="Etapes du chapitre">
        <div className="workflow-steps-heading">
          <h3 className="workflow-steps-heading-title">Etapes</h3>
        </div>
        <ol className="workflow-steps-stair">
          {steps.map((step) => (
            <li
              key={step.key}
              className="workflow-steps-stair-item"
            >
              <button
                type="button"
                className={`workflow-stair-step is-${getStepVisualState(step)}`}
                onClick={() => setActiveStep(step.key)}
                aria-current={activeStep === step.key ? 'step' : undefined}
              >
                <span className="workflow-stair-marker">{step.completed ? completedMarker : `${step.order}`}</span>
                <span className="workflow-stair-main">
                  <span className="workflow-stair-title" title={step.title}>{step.title}</span>
                </span>
                <span className={`workflow-stair-status ${step.status.tone}`}>
                  {step.status.label || 'A faire'}
                </span>
              </button>
            </li>
          ))}
        </ol>
      </aside>

      <section className="workflow-detail-panel">
        <div key={activeStep} className="workflow-detail-stage">
          {activeStepConfig.content}
        </div>
      </section>
    </div>
  );
};

export default ChapterWorkflowLuxe;
