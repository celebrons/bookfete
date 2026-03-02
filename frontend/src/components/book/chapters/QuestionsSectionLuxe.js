// C:\Users\USER\bookfete\frontend\src\components\book\chapters\QuestionsSectionLuxe.js
import React from 'react';
import Tooltip from '../../ui/Tooltip';
import '../BookLuxe.css';

const QuestionsSectionLuxe = ({ 
  questions, 
  onGenerate, 
  generating, 
  isOrganizer,
  onEdit,
  onValidate,
  questionsValidated,
  readOnly
}) => {
  
  console.log('🔵 QuestionsSectionLuxe - isOrganizer:', isOrganizer);
  console.log('🔵 QuestionsSectionLuxe - questionsValidated:', questionsValidated);
  console.log('🔵 QuestionsSectionLuxe - readOnly:', readOnly);

  return (
    <div className={`questions-section ${questionsValidated ? 'validated' : ''}`}>
      <div className="questions-header">
        <h3>
          {questionsValidated ? '✅ Questions validées' : '✨ QUESTIONS SUGGÉRÉES PAR L\'IA'}
        </h3>
        <Tooltip text="Ces questions seront envoyées aux invités pour les guider dans leur contribution">
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

      <p className="questions-info">
        Ces questions seront envoyées aux invités pour les guider dans leur contribution.
      </p>

      {/* Boutons pour l'organisateur */}
      {isOrganizer && !readOnly && (
        <div className="questions-actions">
          {!questionsValidated ? (
            // Mode édition (questions non validées)
            <>
              <button
                onClick={() => {
                  console.log('🟢 Clic sur Regénérer');
                  onGenerate();
                }}
                disabled={generating}
                className="btn btn-outline"
                style={{ flex: 1 }}
              >
                {generating ? '✨ Génération...' : '🎲 Regénérer'}
              </button>
              
              <button
                onClick={() => {
                  console.log('🟢 Clic sur Modifier/Ajouter');
                  onEdit();
                }}
                className="btn btn-outline"
                style={{ flex: 1 }}
              >
                ✏️ Modifier/Ajouter
              </button>

              <button
                onClick={() => {
                  console.log('🟢 Clic sur Valider');
                  onValidate();
                }}
                className="btn btn-primary"
                style={{ flex: 1 }}
              >
                ✅ Valider
              </button>
            </>
          ) : (
            // Mode lecture seule (questions validées)
            <div className="validated-message">
              ✓ Questions validées - elles seront envoyées aux invités
            </div>
          )}
        </div>
      )}

      {/* Message si pas organisateur */}
      {!isOrganizer && (
        <div className="validated-message" style={{ background: 'var(--silk)', color: 'var(--text-light)' }}>
          Seul l'organisateur peut modifier les questions
        </div>
      )}
    </div>
  );
};

export default QuestionsSectionLuxe;