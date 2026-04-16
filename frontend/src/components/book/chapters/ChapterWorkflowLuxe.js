import React, { useEffect, useRef, useState } from 'react';
import Step1Amorce from './Step1Amorce';
import Step2Contribution from './Step2Contribution';
import Step3Invitations from './Step3Invitations';
import Step4Cloture from './Step4Cloture';
import '../BookLuxe.css';

const hasText = (value) => String(value || '').trim().length > 0;
const CHAPTER_STATE_EMAIL = '__chapter_state__@system.local';
const CHAPTER_DRAFT_EMAIL = '__chapter_draft__@system.local';
const normalizeText = (value) => (value === null || value === undefined ? '' : String(value).trim());
const getDisplayBookTitle = (value) => {
  const normalized = normalizeText(value);

  if (!normalized) {
    return 'Livre';
  }

  return normalized.replace(/^(?:\[[^\]]+\]\s*)+/g, '').trim() || normalized;
};

const getChapterOrderNumber = (chapter) => {
  const orderIndex = Number(chapter?.order_index);

  if (Number.isFinite(orderIndex)) {
    return orderIndex + 1;
  }

  const position = Number(chapter?.position);

  if (Number.isFinite(position) && position > 0) {
    return position;
  }

  return null;
};

const StepCheckIcon = () => (
  <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
    <path
      d="M3.2 8.3 6.6 11.4 12.8 4.9"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const BackChevronIcon = () => (
  <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
    <path
      d="M11.8 4.5 6.2 10l5.6 5.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const getVisibleGuestContributions = (chapter, userEmail) => (
  (Array.isArray(chapter?.contributions) ? chapter.contributions : [])
    .filter((contribution) =>
      contribution?.contributor_email !== userEmail &&
      contribution?.contributor_email !== CHAPTER_STATE_EMAIL &&
      contribution?.contributor_email !== CHAPTER_DRAFT_EMAIL &&
      contribution?.is_finalized !== false &&
      hasText(contribution?.message)
    )
    .sort((a, b) => new Date(b?.created_at || 0) - new Date(a?.created_at || 0))
);

const getContributionDisplayName = (contribution) => (
  contribution?.contributor_name
  || contribution?.contributor_email?.split('@')[0]
  || 'Contributeur'
);

const getContributionRelation = (contribution) => (
  contribution?.relation
  || contribution?.relationship
  || contribution?.contributor_relation
  || contribution?.role
  || ''
);

const getContributorInitials = (contribution) => {
  const name = getContributionDisplayName(contribution);
  const parts = String(name).trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) {
    return 'C';
  }

  if (parts.length === 1) {
    return parts[0].slice(0, 1).toUpperCase();
  }

  return `${parts[0].slice(0, 1)}${parts[parts.length - 1].slice(0, 1)}`.toUpperCase();
};

const getWordCount = (value) => (
  String(value || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .length
);

const formatContributionDate = (dateValue) => {
  if (!dateValue) {
    return '';
  }

  try {
    return new Intl.DateTimeFormat('fr-FR', {
      day: 'numeric',
      month: 'long'
    }).format(new Date(dateValue));
  } catch (error) {
    return '';
  }
};

const getRelativeContributionTime = (dateValue) => {
  if (!dateValue) {
    return '';
  }

  const timestamp = new Date(dateValue).getTime();
  if (Number.isNaN(timestamp)) {
    return '';
  }

  const diffMs = timestamp - Date.now();
  const diffMinutes = Math.round(diffMs / (1000 * 60));
  const rtf = new Intl.RelativeTimeFormat('fr-FR', { numeric: 'auto' });

  if (Math.abs(diffMinutes) < 60) {
    return rtf.format(diffMinutes, 'minute');
  }

  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) {
    return rtf.format(diffHours, 'hour');
  }

  const diffDays = Math.round(diffHours / 24);
  if (Math.abs(diffDays) < 30) {
    return rtf.format(diffDays, 'day');
  }

  const diffMonths = Math.round(diffDays / 30);
  return rtf.format(diffMonths, 'month');
};

const truncateContribution = (value, maxLength = 260) => {
  const text = String(value || '').trim().replace(/\s+/g, ' ');

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength).trim()}...`;
};

const getDefaultActiveStep = ({
  preparationReady,
  contributionsClosed,
  isSoloMode
}) => {
  if (!preparationReady) {
    return 'preparation';
  }

  if (isSoloMode) {
    return 'finalisation';
  }

  if (!contributionsClosed) {
    return 'collecte';
  }

  return 'finalisation';
};

const getBookCreativeProgress = (chapters, isSoloMode) => {
  const chapterList = Array.isArray(chapters) ? chapters : [];

  if (!chapterList.length) {
    return 0;
  }

  const totalPhases = chapterList.length * (isSoloMode ? 2 : 3);

  if (!totalPhases) {
    return 0;
  }

  const completedPhases = chapterList.reduce((total, item) => {
    const preparationDone = Boolean(
      hasText(item?.amorce_text)
      && (item?.amorce_validated || item?.questions_validated)
      && item?.isFinalized
    );
    const collecteDone = isSoloMode ? true : Boolean(item?.contributionsClosed);
    const finalisationDone = Boolean(
      item?.isChapterClosed
      || item?.chapterDraft?.status === 'validated'
    );

    return total + [
      preparationDone,
      ...(isSoloMode ? [] : [collecteDone]),
      finalisationDone
    ].filter(Boolean).length;
  }, 0);

  return Math.max(0, Math.min(100, Math.round((completedPhases / totalPhases) * 100)));
};

const ChapterWorkflowLuxe = (props) => {
  const {
    chapter,
    chapters,
    user,
    book,
    onUpdateChapter,
    onSaveContribution,
    onFinalizeContribution,
    bookTitle,
    chapterTitle,
    onBackToStructure
  } = props;

  const amorceExists = hasText(chapter?.amorce_text);
  const amorceValidated = Boolean(chapter?.amorce_validated || chapter?.questions_validated);
  const isFinalized = Boolean(chapter?.isFinalized || chapter?.currentUserContribution?.is_finalized);
  const contributionsClosed = chapter?.contributionsClosed || false;
  const isClosed = chapter?.isChapterClosed || false;
  const chapterDraftStatus = chapter?.chapterDraft?.status || null;
  const isSoloMode = Boolean(book?.cover_config?.soloMode);
  const guestContributions = getVisibleGuestContributions(chapter, user?.email);
  const hasGuestContributions = guestContributions.length > 0;
  const chapterTriggers = Array.isArray(chapter?.triggers) ? chapter.triggers.filter(Boolean).slice(0, 4) : [];
  const hasDraftActivity = Boolean(
    chapterDraftStatus
    || Number(chapter?.chapterDraft?.generationCount || 0) > 0
    || hasText(chapter?.chapterDraft?.html)
  );
  const preparationReady = Boolean(amorceExists && isFinalized);
  const preparationNeedsRevision = Boolean(
    !isClosed
    && (contributionsClosed || hasDraftActivity)
    && amorceExists
    && isFinalized
    && !amorceValidated
  );
  const displayBookTitle = getDisplayBookTitle(bookTitle || book?.title || 'Livre');
  const chapterNumber = getChapterOrderNumber(chapter);
  const chapterContext = chapterNumber ? `Chapitre ${chapterNumber}` : 'Chapitre';
  const creativeProgressPercent = getBookCreativeProgress(chapters, isSoloMode);
  const workflowRootRef = useRef(null);
  const [activeStep, setActiveStep] = useState(() =>
    getDefaultActiveStep({
      preparationReady,
      contributionsClosed,
      isSoloMode
    })
  );
  const previousStateRef = useRef({
    preparationReady,
    isFinalized,
    contributionsClosed,
    isClosed,
    isSoloMode
  });
  const handleOpenModeration = () => {
    if (typeof props.onLoadContributions === 'function' && chapter?.id) {
      props.onLoadContributions(chapter.id);
    }
  };

  useEffect(() => {
    const previousState = previousStateRef.current;
    const progressed =
      (!previousState.preparationReady && preparationReady) ||
      (!previousState.isFinalized && isFinalized) ||
      (!previousState.contributionsClosed && contributionsClosed) ||
      (!previousState.isClosed && isClosed) ||
      previousState.isSoloMode !== isSoloMode;

    if (progressed) {
      setActiveStep(getDefaultActiveStep({
        preparationReady,
        contributionsClosed,
        isSoloMode
      }));
    }

    previousStateRef.current = {
      preparationReady,
      isFinalized,
      contributionsClosed,
      isClosed,
      isSoloMode
    };
  }, [preparationReady, isFinalized, contributionsClosed, isClosed, isSoloMode]);

  const steps = [
    {
      key: 'preparation',
      order: 1,
      title: 'Preparation',
      caption: 'Guide et texte prive',
      completed: preparationReady,
      locked: false,
      status: {
        tone: preparationNeedsRevision
          ? 'is-warning'
          : (preparationReady ? 'is-complete' : 'is-muted'),
        label: preparationNeedsRevision
          ? 'A reviser'
          : (preparationReady ? 'Pret' : 'A faire')
      },
      content: (
        <div className="workflow-editorial-stage workflow-editorial-stage--spread">
          <div className="workflow-editorial-spread">
            <section className="workflow-editorial-page workflow-editorial-page--inspiration">
              <div className="workflow-editorial-page-head">
                <span className="workflow-editorial-page-kicker">Page d inspiration</span>
                <h3 className="workflow-editorial-page-title">Guide d inspiration</h3>
                <p className="workflow-editorial-page-copy">
                  Affinez l amorce qui guidera vos invites. Elle donne le ton du chapitre, sans jamais reveler votre texte prive.
                </p>
              </div>
              <Step1Amorce
                chapter={chapter}
                user={user}
                book={book}
                onUpdateChapter={onUpdateChapter}
                embedded
                editorialMode
              />
            </section>

            <section className="workflow-editorial-page workflow-editorial-page--creation">
              <div className="workflow-editorial-page-head">
                <span className="workflow-editorial-page-kicker">Page de creation</span>
                <h3 className="workflow-editorial-page-title">Votre texte prive</h3>
                <p className="workflow-editorial-page-copy">
                  Ecrivez votre premier regard sur ce chapitre. Cette matiere reste strictement reservee a l organisateur.
                </p>
              </div>
              <Step2Contribution
                chapter={chapter}
                user={user}
                book={book}
                onSaveContribution={onSaveContribution}
                onFinalizeContribution={onFinalizeContribution}
                embedded
                editorialMode
              />
            </section>
          </div>
        </div>
      )
    },
    ...(!isSoloMode ? [{
      key: 'collecte',
      order: 2,
      title: 'Collecte',
      caption: 'Invitations et recits',
      completed: contributionsClosed,
      locked: !preparationReady,
      status: {
        tone: !preparationReady
          ? 'is-locked'
          : (contributionsClosed ? 'is-complete' : 'is-active'),
        label: !preparationReady
          ? 'A faire'
          : (contributionsClosed ? 'Collecte close' : 'Collecte ouverte')
      },
      content: preparationReady ? (
        <div className="workflow-editorial-stage workflow-editorial-stage--spread">
          <div className="workflow-editorial-spread workflow-editorial-spread--collecte">
            <section className="workflow-editorial-page workflow-editorial-page--inspiration workflow-editorial-page--collecte">
              <div className="workflow-editorial-page-head">
                <span className="workflow-editorial-page-kicker">Page de collecte</span>
                <h3 className="workflow-editorial-page-title">Recits et invitations</h3>
                <p className="workflow-editorial-page-copy">
                  Ouvrez la collecte une fois votre preparation terminee. Les invites recoivent l inspiration du chapitre, jamais votre texte prive.
                </p>
              </div>
              <Step3Invitations
                {...props}
                hasContributed={preparationReady}
                onOpenModeration={handleOpenModeration}
                editorialMode
              />
            </section>
            <section className="workflow-editorial-page workflow-editorial-page--creation workflow-editorial-page--collecte-side">
              <div className="workflow-editorial-page-head">
                <span className="workflow-editorial-page-kicker">Page de suivi</span>
                <h3 className="workflow-editorial-page-title">Vie du chapitre</h3>
                <p className="workflow-editorial-page-copy">
                  {hasGuestContributions
                    ? 'Les recits recus prennent place ici au fil de la collecte. Vous voyez le chapitre se remplir a mesure qu il avance.'
                    : 'Avant les premiers recits, verifiez ici exactement ce que vos invites verront lorsqu ils ouvriront leur page de contribution.'}
                </p>
              </div>
              {hasGuestContributions ? (
                <div className="workflow-collecte-activity-feed">
                  <div className="workflow-collecte-activity-head">
                    <span className="workflow-collecte-activity-kicker">Activite recente</span>
                    <span className="workflow-collecte-activity-count">
                      {guestContributions.length} recit{guestContributions.length > 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="workflow-collecte-activity-list">
                    {guestContributions.map((contribution) => (
                      <button
                        key={contribution.id}
                        type="button"
                        className="workflow-collecte-activity-card"
                        onClick={handleOpenModeration}
                        title="Ouvrir la moderation des recits"
                      >
                        <header className="workflow-collecte-activity-card-head">
                          <span className="workflow-collecte-activity-avatar" aria-hidden="true">
                            {getContributorInitials(contribution)}
                          </span>
                          <div className="workflow-collecte-activity-identity">
                            <strong>{getContributionDisplayName(contribution)}</strong>
                            {getContributionRelation(contribution) ? (
                              <span>({getContributionRelation(contribution)})</span>
                            ) : null}
                          </div>
                        </header>
                        <p className="workflow-collecte-activity-excerpt">
                          {truncateContribution(contribution.message)}
                        </p>
                        <footer className="workflow-collecte-activity-footer">
                          <span>{getWordCount(contribution.message)} mots</span>
                          {getRelativeContributionTime(contribution.created_at) ? (
                            <span>{getRelativeContributionTime(contribution.created_at)}</span>
                          ) : (formatContributionDate(contribution.created_at) ? (
                            <span>{formatContributionDate(contribution.created_at)}</span>
                          ) : null)}
                        </footer>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="workflow-collecte-mirror">
                  <div className="workflow-collecte-mirror-head">
                    <span className="workflow-collecte-mirror-kicker">Miroir contributeur</span>
                    <span className="workflow-collecte-mirror-note">Lecture seule</span>
                  </div>
                  <div className="amorce-callout contributor-preview-callout is-editorial workflow-collecte-mirror-callout">
                    <span className="amorce-display-text">
                      {chapter?.amorce_text || 'Les invites verront ici la phrase d ouverture du chapitre.'}
                    </span>
                  </div>
                  {chapterTriggers.length > 0 ? (
                    <div className="amorce-trigger-block contributor-preview-trigger-block workflow-collecte-mirror-triggers">
                      <div className="amorce-trigger-label">Mots-cles</div>
                      <div className="amorce-trigger-row">
                        {chapterTriggers.map((trigger) => (
                          <span key={trigger} className="amorce-trigger-pill is-editorial">
                            <span>{trigger}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  <div className="contributor-preview-field workflow-collecte-mirror-field">
                    <label className="chapter-prompt-admin-label">Espace de reponse</label>
                    <textarea
                      className="input-luxe contributor-preview-textarea"
                      readOnly
                      value=""
                      placeholder="Continuez a votre facon - une phrase, un paragraphe, tout est bienvenu."
                    />
                    <div className="contributor-preview-count">Champ vide cote invite</div>
                  </div>
                </div>
              )}
            </section>
          </div>
        </div>
      ) : (
        <div className="workflow-editorial-stage workflow-editorial-stage--single">
          <div className="workflow-empty-state workflow-editorial-empty">
            Finalisez d abord la preparation editoriale pour ouvrir la collecte.
          </div>
        </div>
      )
    }] : []),
    {
      key: 'finalisation',
      order: isSoloMode ? 2 : 3,
      title: 'Finalisation',
      caption: 'Rendu et cloture',
      completed: isClosed,
      locked: false,
      status: {
        tone: isClosed
          ? 'is-complete'
          : (preparationNeedsRevision ? 'is-warning' : (chapterDraftStatus === 'draft' ? 'is-draft' : 'is-muted')),
        label: isClosed
          ? 'Chapitre cloture'
          : (preparationNeedsRevision ? 'A reviser' : (chapterDraftStatus === 'draft' ? 'En cours' : 'A faire'))
      },
      content: (
        <div className="workflow-editorial-stage workflow-editorial-stage--single">
          <div className="workflow-editorial-stage-intro">
            <span className="workflow-editorial-stage-kicker">Phase 3</span>
            <h3 className="workflow-editorial-stage-title">Finalisation</h3>
            <p className="workflow-editorial-stage-copy">
              Une fois la collecte close, le chapitre entre en finalisation. L inspiration et le texte prive se figent pour garantir un rendu coherent.
            </p>
          </div>
          <Step4Cloture
            {...props}
            amorceExists={amorceExists}
            amorceValidated={amorceValidated}
            preparationNeedsRevision={preparationNeedsRevision}
            organizerContributionReady={isFinalized}
          />
        </div>
      )
    }
  ];

  useEffect(() => {
    if (!isSoloMode || activeStep !== 'collecte') {
      return;
    }

    setActiveStep(getDefaultActiveStep({
      preparationReady,
      contributionsClosed,
      isSoloMode
    }));
  }, [activeStep, isSoloMode, preparationReady, contributionsClosed]);

  const activeStepConfig = steps.find((step) => step.key === activeStep) || steps[0];
  const triggerActionInsideWorkflow = (selector) => {
    const button = workflowRootRef.current?.querySelector(selector);
    if (button instanceof HTMLButtonElement && !button.disabled) {
      button.click();
    }
  };

  const handlePrimaryTopbarAction = () => {
    if (activeStep === 'preparation') {
      const saveButton = workflowRootRef.current?.querySelector('[data-workflow-action="save-contribution"]');
      if (saveButton instanceof HTMLButtonElement && !saveButton.disabled) {
        saveButton.click();
        return;
      }

      if (!isFinalized) {
        triggerActionInsideWorkflow('[data-workflow-action="finalize-contribution"]');
        return;
      }

      if (!amorceValidated) {
        triggerActionInsideWorkflow('[data-workflow-action="validate-amorce"]');
      }
      return;
    }

    if (activeStep === 'collecte') {
      triggerActionInsideWorkflow('[data-workflow-action="close-collection"]');
      return;
    }

    triggerActionInsideWorkflow('[data-workflow-action="generate-chapter"]');
  };

  const primaryAction = (() => {
    if (activeStep === 'preparation') {
      return {
        label: 'Valider →',
        disabled: isClosed || (isFinalized && amorceValidated)
      };
    }

    if (activeStep === 'collecte') {
      return {
        label: 'Clore la collecte →',
        disabled: isClosed || contributionsClosed || !preparationReady
      };
    }

    return {
      label: 'Generer le chapitre →',
      disabled: isClosed || preparationNeedsRevision
    };
  })();

  const primaryActionDisplay = {
    ...primaryAction,
    label: activeStep === 'preparation'
      ? 'Valider'
      : activeStep === 'collecte'
        ? 'Clore la collecte'
        : 'Generer le chapitre'
  };

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
    <div ref={workflowRootRef} className="workflow-editorial-shell" style={{ marginBottom: 'var(--space-xl)' }}>
      <div className="chapter-editor-pilot">
        <div className="chapter-editor-pilot-topline">
          <div className="chapter-editor-heading">
            <button
              type="button"
              className="chapter-editor-return-icon"
              onClick={onBackToStructure}
              aria-label="Retour a la structure du livre"
            >
              <BackChevronIcon />
            </button>
            <div className="chapter-editor-heading-copy">
              <div className="chapter-editor-breadcrumb">
                <span>{displayBookTitle}</span>
                <span className="chapter-editor-breadcrumb-separator" aria-hidden="true">›</span>
                <span>{chapterContext}</span>
              </div>
              <strong className="chapter-editor-title">
                {chapterTitle || chapter?.title || 'Chapitre'}
              </strong>
            </div>
          </div>
          <div className="chapter-editor-controls">
            <button
              type="button"
              className="chapter-editor-primary-action"
              onClick={handlePrimaryTopbarAction}
              disabled={primaryActionDisplay.disabled}
            >
              {primaryActionDisplay.label}
            </button>
          </div>
        </div>
        <div className="chapter-editor-pilot-subline">
          <div className="workflow-stepper-wrap">
            <ol className="workflow-stepper workflow-stepper--compact" aria-label="Parcours editorial du chapitre">
              {steps.map((step, index) => (
                <li key={step.key} className="workflow-stepper-item">
                  {(() => {
                    const visualState = getStepVisualState(step);

                    return (
                      <>
                        <button
                          type="button"
                          className={`workflow-stepper-button is-${visualState}`}
                          onClick={() => setActiveStep(step.key)}
                          aria-current={activeStep === step.key ? 'step' : undefined}
                        >
                          <span className="workflow-stepper-index">
                            {step.completed ? <StepCheckIcon /> : `${step.order}`}
                          </span>
                          <span className="workflow-stepper-copy">
                            <span className="workflow-stepper-label">{step.title}</span>
                            {step.caption ? (
                              <span className="workflow-stepper-caption">{step.caption}</span>
                            ) : null}
                          </span>
                        </button>
                        {index < steps.length - 1 ? (
                          <span className={`workflow-stepper-rail is-${visualState}`} aria-hidden="true" />
                        ) : null}
                      </>
                    );
                  })()}
                </li>
              ))}
            </ol>
          </div>
          <div
            className="chapter-editor-book-progress"
            aria-label={`Progression globale du livre : ${creativeProgressPercent}%`}
          >
            <div className="chapter-editor-book-progress-track">
              <span
                className="chapter-editor-book-progress-value"
                style={{ width: `${creativeProgressPercent}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      <section className="workflow-editorial-canvas">
        <div key={activeStep} className="workflow-detail-stage">
          {activeStepConfig.content}
        </div>
      </section>
    </div>
  );
};

export default ChapterWorkflowLuxe;
