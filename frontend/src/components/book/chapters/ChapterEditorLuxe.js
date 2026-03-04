// C:\Users\USER\bookfete\frontend\src\components\book\chapters\ChapterEditorLuxe.js
import React from 'react';
import '../BookLuxe.css';

const ChapterEditorLuxe = ({ editingChapter, setEditingChapter, onSave, onCancel }) => {
  const isIntroductionChapter = editingChapter?.title === 'Introduction';

  return (
    <div className="card" style={{ marginBottom: 'var(--space-lg)' }}>
      <h3 style={{ margin: '0 0 var(--space-lg)', fontSize: '18px', fontWeight: '600' }}>
        Modifier le chapitre
      </h3>
      
      <div style={{ marginBottom: 'var(--space-lg)' }}>
        <span className="label-gold">Titre du chapitre</span>
        <input
          type="text"
          value={editingChapter.title}
          onChange={(e) => setEditingChapter({ ...editingChapter, title: e.target.value })}
          className="input-luxe"
          placeholder="Titre du chapitre"
          disabled={isIntroductionChapter}
        />
        {isIntroductionChapter && (
          <p className="chapter-subtitle" style={{ margin: '8px 0 0' }}>
            Le premier chapitre reste une introduction.
          </p>
        )}
      </div>
      
      <div style={{ marginBottom: 'var(--space-lg)' }}>
        <span className="label-gold">Description (optionnelle)</span>
        <textarea
          value={editingChapter.description}
          onChange={(e) => setEditingChapter({ ...editingChapter, description: e.target.value })}
          className="input-luxe"
          rows="3"
          placeholder="Description du chapitre"
        />
      </div>
      
      <div className="modal-actions" style={{ justifyContent: 'flex-end' }}>
        <button onClick={onCancel} className="modal-btn modal-btn-secondary">
          Annuler
        </button>
        <button onClick={onSave} className="modal-btn modal-btn-primary">
          Enregistrer
        </button>
      </div>
    </div>
  );
};

export default ChapterEditorLuxe;
