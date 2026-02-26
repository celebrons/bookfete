// C:\Users\USER\bookfete\frontend\src\components\book\chapters\QuestionsSection.js
import React, { useEffect } from 'react';
import Tooltip from '../../ui/Tooltip';

const QuestionsSection = ({ 
  questions, 
  onGenerate, 
  generating, 
  chapterTitle, 
  eventType, 
  style 
}) => {
  
  // Log au chargement du composant
  useEffect(() => {
    console.log('📦 QuestionsSection chargée pour le chapitre:', chapterTitle);
  }, [chapterTitle]);

  // Log quand les questions changent
  useEffect(() => {
    console.log('📝 Questions actuelles:', questions);
  }, [questions]);

  const handleGenerateClick = () => {
    if (onGenerate) {
      onGenerate();
    }
  };

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
          onClick={handleGenerateClick}
          disabled={generating}
          style={{
            padding: '0.6rem 1.2rem',
            background: generating ? '#ccc' : 'white',
            color: '#764ba2',
            border: 'none',
            borderRadius: '5px',
            fontSize: '0.9rem',
            fontWeight: 'bold',
            cursor: generating ? 'not-allowed' : 'pointer',
            opacity: generating ? 0.7 : 1,
            transition: 'all 0.2s'
          }}
          onMouseEnter={(e) => {
            if (!generating) {
              e.target.style.transform = 'translateY(-2px)';
              e.target.style.boxShadow = '0 5px 15px rgba(0,0,0,0.2)';
            }
          }}
          onMouseLeave={(e) => {
            if (!generating) {
              e.target.style.transform = 'translateY(0)';
              e.target.style.boxShadow = 'none';
            }
          }}
        >
          {generating ? '✨ Génération...' : '🎲 Générer de nouvelles questions'}
        </button>
      </div>

      {/* Message de debug */}
      <div style={{ marginTop: '1rem', fontSize: '0.8rem', textAlign: 'center', opacity: 0.7 }}>
        {chapterTitle && <span>Chapitre: {chapterTitle}</span>}
      </div>
    </div>
  );
};

export default QuestionsSection;