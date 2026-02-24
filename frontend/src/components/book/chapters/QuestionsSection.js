// C:\Users\USER\bookfete\frontend\src\components\book\chapters\QuestionsSection.js
import React, { useEffect } from 'react';
import Tooltip from '../../ui/Tooltip';  // ← IMPORT AJOUTÉ

const QuestionsSection = ({ 
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
    <div style={{
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      padding: '1.5rem',
      borderRadius: '10px',
      marginBottom: '2rem',
      color: 'white'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h3 style={{ margin: 0, color: 'white', fontSize: '1.1rem' }}>
          ✨ QUESTIONS SUGGÉRÉES PAR L'IA
        </h3>
        <Tooltip text="Les questions s'adaptent automatiquement au titre et au style">
          <span style={{ color: 'white', cursor: 'help', fontSize: '1.2rem' }}>ⓘ</span>
        </Tooltip>
      </div>
      
      <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
        {questions && questions.length > 0 ? (
          questions.map((q, idx) => (
            <li key={idx} style={{ marginBottom: '0.8rem', lineHeight: '1.5' }}>{q}</li>
          ))
        ) : (
          <li style={{ fontStyle: 'italic' }}>Aucune question pour l'instant</li>
        )}
      </ul>

      <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'center' }}>
        <button
          onClick={onGenerate}
          disabled={generating}
          style={{
            padding: '0.6rem 1.2rem',
            background: 'white',
            color: '#764ba2',
            border: 'none',
            borderRadius: '5px',
            fontSize: '0.9rem',
            fontWeight: 'bold',
            cursor: generating ? 'not-allowed' : 'pointer',
            opacity: generating ? 0.7 : 1
          }}
        >
          {generating ? '✨ Génération...' : '🎲 Régénérer les questions'}
        </button>
      </div>
    </div>
  );
};

export default QuestionsSection;