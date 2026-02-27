// C:\Users\USER\bookfete\frontend\src\components\book\chapters\QuestionsEditorLuxe.js
import React from 'react';
import '../BookLuxe.css';

const QuestionsEditorLuxe = ({
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
    <div className="card" style={{ marginBottom: 'var(--space-lg)' }}>
      <h3 style={{ margin: '0 0 var(--space-lg)', fontSize: '18px', fontWeight: '600' }}>
        Modifier les questions
      </h3>
      
      <div style={{ marginBottom: 'var(--space-lg)' }}>
        <span className="label-gold">Questions actuelles</span>
        <div style={{ marginTop: 'var(--space-sm)' }}>
          {editingQuestions.questions.map((q, idx) => (
            <div
              key={idx}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-sm)',
                marginBottom: 'var(--space-xs)',
                padding: 'var(--space-sm)',
                background: 'var(--silk)',
                borderRadius: 'var(--radius)'
              }}
            >
              <span style={{ flex: 1, fontSize: '14px' }}>{q}</span>
              <button
                onClick={() => onRemoveQuestion(idx)}
                className="btn-outline"
                style={{
                  padding: '2px 8px',
                  borderColor: '#dc3545',
                  color: '#dc3545'
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </div>
      
      <div style={{ marginBottom: 'var(--space-lg)' }}>
        <span className="label-gold">Ajouter une question</span>
        <div style={{ display: 'flex', gap: 'var(--space-sm)', marginTop: 'var(--space-xs)' }}>
          <input
            type="text"
            value={newQuestion}
            onChange={(e) => setNewQuestion(e.target.value)}
            className="input-luxe"
            placeholder="Nouvelle question"
          />
          <button
            onClick={onAddQuestion}
            className="btn btn-primary"
            style={{ padding: '0 20px', whiteSpace: 'nowrap' }}
          >
            Ajouter
          </button>
        </div>
      </div>
      
      <div className="modal-actions" style={{ justifyContent: 'flex-end' }}>
        <button onClick={onCancel} className="modal-btn modal-btn-secondary">
          Annuler
        </button>
        <button onClick={onSave} className="modal-btn modal-btn-primary">
          Enregistrer les questions
        </button>
      </div>
    </div>
  );
};

export default QuestionsEditorLuxe;