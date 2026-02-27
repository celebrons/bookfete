// C:\Users\USER\bookfete\frontend\src\components\book\chapters\QuestionsSectionLuxe.js
import React, { useEffect } from 'react';
import Tooltip from '../../ui/Tooltip';
import '../BookLuxe.css';

const QuestionsSectionLuxe = ({ 
  questions, 
  onGenerate, 
  generating, 
  chapterTitle, 
  eventType, 
  style 
}) => {
  
  // Régénérer automatiquement quand le titre change
  useEffect(() => {
    if (chapterTitle) {
      onGenerate();
    }
  }, [chapterTitle]);

  return (
    <div className="questions-section">
      <div className="questions-header">
        <h3>✨ QUESTIONS SUGGÉRÉES PAR L'IA</h3>
        <Tooltip text="Les questions s'adaptent automatiquement au titre et au style">
          <span style={{ color: 'var(--gold)', cursor: 'help' }}>ⓘ</span>
        </Tooltip>
      </div>
      
      <ul className="questions-list">
        {questions && questions.length > 0 ? (
          questions.map((q, idx) => (
            <li key={idx}>{q}</li>
          ))
        ) : (
          <li style={{ fontStyle: 'italic' }}>Aucune question pour l'instant</li>
        )}
      </ul>

      <button
        onClick={onGenerate}
        disabled={generating}
        className="btn-generate"
      >
        {generating ? '✨ Génération...' : '🎲 Régénérer les questions'}
      </button>
    </div>
  );
};

export default QuestionsSectionLuxe;