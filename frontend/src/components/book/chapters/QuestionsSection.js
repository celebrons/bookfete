// C:\Users\USER\bookfete\frontend\src\components\book\chapters\QuestionsSection.js
import React from 'react';
import Tooltip from '../../ui/Tooltip';

const QuestionsSection = ({ 
  questions, 
  onGenerate, 
  generating, 
  onEdit,
  isOrganizer,
  questionsValidated,
  onValidate,
  readOnly
}) => {
  
  const handleGenerate = () => {
    console.log('🖱️ Clic sur Regénérer');
    onGenerate();
  };

  const handleEdit = () => {
    console.log('🖱️ Clic sur Modifier/Ajouter');
    onEdit();
  };

  const handleValidate = () => {
    console.log('🖱️ Clic sur Valider');
    onValidate();
  };

  // Si les questions sont validées, on les affiche en lecture seule
  const displayQuestions = questionsValidated ? questions : (questions || []);

  return (
    <div style={{
      background: questionsValidated ? '#d4edda' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      padding: '1.5rem',
      borderRadius: '10px',
      marginBottom: '2rem',
      color: questionsValidated ? '#155724' : 'white'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h3 style={{ margin: 0, color: questionsValidated ? '#155724' : 'white', fontSize: '1.1rem' }}>
          {questionsValidated ? '✅ Questions validées' : '💡 Questions suggérées pour vous inspirer'}
        </h3>
        <Tooltip text="Ces questions seront envoyées aux invités pour les guider dans leur contribution">
          <span style={{ color: questionsValidated ? '#155724' : 'white', cursor: 'help', fontSize: '1.2rem' }}>ⓘ</span>
        </Tooltip>
      </div>
      
      <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
        {displayQuestions && displayQuestions.length > 0 ? (
          displayQuestions.map((q, idx) => (
            <li key={idx} style={{ marginBottom: '0.8rem', lineHeight: '1.5' }}>{q}</li>
          ))
        ) : (
          <li style={{ fontStyle: 'italic' }}>Aucune question pour l'instant</li>
        )}
      </ul>

      {/* Boutons visibles uniquement pour l'organisateur */}
      {isOrganizer && !readOnly && (
        <div style={{ marginTop: '1rem', display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          {!questionsValidated && (
            <>
              <button
                onClick={handleGenerate}
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
              >
                {generating ? '✨ Génération...' : '🎲 Regénérer'}
              </button>
              
              <button
                onClick={handleEdit}
                style={{
                  padding: '0.6rem 1.2rem',
                  background: '#17a2b8',
                  color: 'white',
                  border: 'none',
                  borderRadius: '5px',
                  fontSize: '0.9rem',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                ✏️ Modifier/Ajouter
              </button>

              <button
                onClick={handleValidate}
                style={{
                  padding: '0.6rem 1.2rem',
                  background: '#28a745',
                  color: 'white',
                  border: 'none',
                  borderRadius: '5px',
                  fontSize: '0.9rem',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                ✅ Valider
              </button>
            </>
          )}
          
          {questionsValidated && (
            <div style={{
              padding: '0.6rem 1.2rem',
              background: '#d4edda',
              color: '#155724',
              border: '1px solid #c3e6cb',
              borderRadius: '5px',
              fontSize: '0.9rem',
              fontWeight: 'bold'
            }}>
              ✓ Questions validées - elles seront envoyées aux invités
            </div>
          )}
        </div>
      )}

      <p style={{ marginTop: '1rem', fontSize: '0.9rem', textAlign: 'center', opacity: 0.9 }}>
        Ces questions seront envoyées aux invités pour les guider dans leur contribution.
      </p>
    </div>
  );
};

export default QuestionsSection;