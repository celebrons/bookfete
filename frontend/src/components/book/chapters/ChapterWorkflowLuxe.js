import React, { useEffect, useRef, useState } from 'react';
import Step1Questions from './Step1Questions';
import Step2Contribution from './Step2Contribution';
import Step3Invitations from './Step3Invitations';
import Step4Cloture from './Step4Cloture';
import '../BookLuxe.css';

const getDefaultActiveStep = ({
  questionsValidated,
  hasContributed,
  contributionsClosed,
  isClosed,
  isSoloMode
}) => {
  if (!questionsValidated) {
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

  const questionsValidated = chapter?.questions_validated || false;
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
      setActiveStep(getDefaultActiveStep({
        questionsValidated,
        hasContributed,
        contributionsClosed,
        isClosed,
        isSoloMode
      }));
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

  const steps = [
    {
      key: 'step1',
      order: 1,
      title: 'Questions pour vous aider',
      completed: questionsValidated,
      locked: isClosed && !questionsValidated,
      status: {
        tone: isClosed && !questionsValidated ? 'is-locked' : (questionsValidated ? 'is-complete' : 'is-todo'),
        label: isClosed && !questionsValidated ? 'Verrouille' : (questionsValidated ? 'Valide' : 'A faire')
      },
      content: (
        <Step1Questions
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
      locked: !questionsValidated || (isClosed && !isFinalized),
      status: {
        tone: !questionsValidated
          ? 'is-locked'
          : ((isClosed && !isFinalized) ? 'is-locked' : (isFinalized ? 'is-complete' : (hasContributed ? 'is-draft' : 'is-todo'))),
        label: !questionsValidated
          ? 'Verrouille'
          : ((isClosed && !isFinalized) ? 'Verrouille' : (isFinalized ? 'Validee' : (hasContributed ? 'Brouillon' : 'A faire')))
      },
      content: questionsValidated ? (
        <Step2Contribution
          chapter={chapter}
          user={user}
          book={book}
          onSaveContribution={onSaveContribution}
          onFinalizeContribution={onFinalizeContribution}
        />
      ) : (
        <div className="workflow-content workflow-empty-state">
          Validez d abord l etape 1 pour acceder a votre contribution.
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
      questionsValidated,
      hasContributed,
      contributionsClosed,
      isClosed,
      isSoloMode
    }));
  }, [activeStep, isSoloMode, questionsValidated, hasContributed, contributionsClosed, isClosed]);

  const activeStepConfig = steps.find((step) => step.key === activeStep) || steps[0];

  return (
    <div className="workflow-layout" style={{ marginBottom: 'var(--space-xl)' }}>
      <aside className="workflow-steps-nav" aria-label="Etapes du chapitre">
        <div className="workflow-steps-summary" aria-label="Sommaire compact des etapes">
          {steps.map((step) => (
            <button
              key={`${step.key}-summary`}
              type="button"
              className={`workflow-step-chip ${step.completed ? 'completed' : ''} ${step.locked ? 'locked' : ''} ${activeStep === step.key ? 'active' : ''}`}
              onClick={() => setActiveStep(step.key)}
              aria-current={activeStep === step.key ? 'step' : undefined}
            >
              <span className="workflow-step-chip-number">
                {step.completed ? completedMarker : `${step.order}`}
              </span>
              <span className="workflow-step-chip-text">
                <span className="workflow-step-chip-label">Etape {step.order}</span>
                <span className="workflow-step-chip-title">{step.title}</span>
              </span>
            </button>
          ))}
        </div>

        {steps.map((step) => (
          <div
            key={step.key}
            className={`workflow-step ${step.completed ? 'completed' : ''} ${step.locked ? 'locked' : ''} ${activeStep === step.key ? 'active' : 'inactive'}`}
          >
            <button
              type="button"
              className={`workflow-header ${activeStep === step.key ? 'active' : ''}`}
              onClick={() => setActiveStep(step.key)}
              aria-current={activeStep === step.key ? 'step' : undefined}
            >
              <span className="workflow-step-number">{step.completed ? completedMarker : `${step.order}`}</span>
              <span className="workflow-step-title-wrap">
                <span className="workflow-step-title">{step.title}</span>
                {activeStep === step.key && (
                  <span className="workflow-step-focus-tag">
                    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                      <path d="M8 1l1.85 3.75L14 5.36l-3 2.92.71 4.14L8 10.47l-3.71 1.95L5 8.28 2 5.36l4.15-.61L8 1z" />
                    </svg>
                    En cours
                  </span>
                )}
              </span>
              <span className={`workflow-step-status ${step.status.tone}`}>
                {step.status.label}
              </span>
            </button>
          </div>
        ))}
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
