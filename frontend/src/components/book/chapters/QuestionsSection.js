// C:\Users\USER\bookfete\frontend\src\components\book\chapters\QuestionsSection.js
import React from 'react';

const QuestionsSection = ({ questions, onGenerate, generating }) => {
  return (
    <div style={{
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      padding: '1.5rem',
      borderRadius: '10px',
      marginBottom: '2rem',
      color: 'white'
    }}>
      <h3 style={{ margin: '0 0 1rem', color: 'white', fontSize: '1.1rem' }}>
        ✨ QUESTIONS SUGGÉRÉES PAR L'IA
      </h3>
      
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
          {generating ? '✨ Génération...' : '🎲 Générer de nouvelles questions'}
        </button>
      </div>
    </div>
  );
};

export default QuestionsSection;