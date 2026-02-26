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
  onValidate
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
          💡 Questions suggérées pour vous inspirer et inspirer les contributeurs
        </h3>
        <Tooltip text="Ces questions seront envoyées aux invités pour les guider dans leur contribution">
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

      <div style={{ marginTop: '1rem', display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
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

        {isOrganizer && !questionsValidated && (
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
        )}
      </div>

      <p style={{ marginTop: '1rem', fontSize: '0.9rem', textAlign: 'center', opacity: 0.9 }}>
        Ces questions seront envoyées aux invités pour les guider dans leur contribution.
      </p>

      {/* Message de debug temporaire */}
      <div style={{ marginTop: '0.5rem', fontSize: '0.7rem', textAlign: 'center', opacity: 0.5 }}>
        {questions?.length || 0} questions • {isOrganizer ? 'Organisateur' : 'Invité'}
      </div>
    </div>
  );
};

export default QuestionsSection;