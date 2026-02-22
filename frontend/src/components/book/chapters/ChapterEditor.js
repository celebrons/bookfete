// C:\Users\USER\bookfete\frontend\src\components\book\chapters\ChapterEditor.js
import React from 'react';

const ChapterEditor = ({ editingChapter, setEditingChapter, onSave, onCancel }) => {
  return (
    <div style={{ marginBottom: '2rem' }}>
      <h3 style={{ margin: '0 0 1rem' }}>Modifier le chapitre</h3>
      <input
        type="text"
        value={editingChapter.title}
        onChange={(e) => setEditingChapter({ ...editingChapter, title: e.target.value })}
        style={{
          width: '100%',
          padding: '0.8rem',
          border: '1px solid #764ba2',
          borderRadius: '5px',
          fontSize: '1rem',
          marginBottom: '1rem'
        }}
        placeholder="Titre du chapitre"
      />
      <textarea
        value={editingChapter.description}
        onChange={(e) => setEditingChapter({ ...editingChapter, description: e.target.value })}
        style={{
          width: '100%',
          padding: '0.8rem',
          border: '1px solid #ddd',
          borderRadius: '5px',
          fontSize: '1rem',
          minHeight: '80px',
          marginBottom: '1rem'
        }}
        placeholder="Description du chapitre (optionnelle)"
      />
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
          Enregistrer
        </button>
      </div>
    </div>
  );
};

export default ChapterEditor;