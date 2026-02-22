// C:\Users\USER\bookfete\frontend\src\components\book\chapters\QuestionsEditor.js
import React from 'react';

const QuestionsEditor = ({
  editingQuestions,
  setEditingQuestions,
  newQuestion,
  setNewQuestion,
  onAddQuestion,
  onRemoveQuestion,
  onSave,
  onCancel
}) => {
  return (
    <div style={{ marginBottom: '2rem' }}>
      <h3 style={{ margin: '0 0 1rem' }}>Modifier les questions</h3>
      <div style={{ marginBottom: '1rem' }}>
        {editingQuestions.questions.map((q, idx) => (
          <div
            key={idx}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              marginBottom: '0.5rem',
              padding: '0.5rem',
              background: '#f8f9fa',
              borderRadius: '5px'
            }}
          >
            <span style={{ flex: 1 }}>{q}</span>
            <button
              onClick={() => onRemoveQuestion(idx)}
              style={{
                padding: '0.2rem 0.5rem',
                background: '#dc3545',
                color: 'white',
                border: 'none',
                borderRadius: '3px',
                cursor: 'pointer'
              }}
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        <input
          type="text"
          value={newQuestion}
          onChange={(e) => setNewQuestion(e.target.value)}
          placeholder="Nouvelle question"
          style={{
            flex: 1,
            padding: '0.5rem',
            border: '1px solid #ddd',
            borderRadius: '5px'
          }}
        />
        <button
          onClick={onAddQuestion}
          style={{
            padding: '0.5rem 1rem',
            background: '#28a745',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer'
          }}
        >
          Ajouter
        </button>
      </div>
      <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
        <button
          onClick={onCancel}
          style={{
            padding: '0.5rem 1rem',
            background: '#6c757d',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer'
          }}
        >
          Annuler
        </button>
        <button
          onClick={onSave}
          style={{
            padding: '0.5rem 1rem',
            background: '#28a745',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer'
          }}
        >
          Enregistrer les questions
        </button>
      </div>
    </div>
  );
};

export default QuestionsEditor;