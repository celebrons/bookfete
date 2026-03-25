import React from 'react';

const ContributionAmorceBlock = ({
  amorceText = '',
  triggers = [],
  message = '',
  onChangeMessage
}) => {
  const safeTriggers = Array.isArray(triggers) ? triggers.filter(Boolean).slice(0, 4) : [];
  const activeTokens = safeTriggers.filter((trigger) => message.includes(trigger));

  const toggleTrigger = (trigger) => {
    if (typeof onChangeMessage !== 'function') return;
    const currentValue = String(message || '');

    if (currentValue.includes(trigger)) {
      const escapedTrigger = trigger.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const nextValue = currentValue
        .replace(new RegExp(`\\s*${escapedTrigger}\\s*`, 'g'), ' ')
        .replace(/\s+/g, ' ')
        .trim();
      onChangeMessage(nextValue);
      return;
    }

    const nextValue = `${currentValue.trim()}${currentValue.trim() ? ' ' : ''}${trigger}`.trim();
    onChangeMessage(nextValue);
  };

  return (
    <>
      {amorceText ? (
        <div className="contribution-amorce-card">
          <div className="contribution-amorce-label">Amorce du chapitre</div>
          <p className="contribution-amorce-text">{amorceText}</p>
        </div>
      ) : null}

      <div className="form-group">
        <label className="label-gold">Votre texte</label>
        <textarea
          value={message}
          onChange={(event) => onChangeMessage(event.target.value)}
          rows="6"
          placeholder="Continuez a votre facon - une phrase, un paragraphe, tout est bienvenu."
          className="input-luxe"
          style={{ resize: 'vertical' }}
        />
        <div className="contribution-char-count">
          {String(message || '').length} caracteres
        </div>
      </div>

      {safeTriggers.length > 0 ? (
        <div className="form-group">
          <div className="contribution-trigger-header">Besoin d un coup de pouce ?</div>
          <div className="contribution-trigger-row">
            {safeTriggers.map((trigger) => {
              const isActive = activeTokens.includes(trigger);
              return (
                <button
                  key={trigger}
                  type="button"
                  onClick={() => toggleTrigger(trigger)}
                  className={`contribution-trigger-pill ${isActive ? 'is-active' : ''}`}
                >
                  {trigger}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </>
  );
};

export default ContributionAmorceBlock;
