// frontend/src/components/organisateur/moderation/ChapterManager.js
import React, { useState } from 'react';

const ChapterManager = ({ chapters, onUpdate }) => {
  const [newChapterTitle, setNewChapterTitle] = useState('');

  const predefinedChapters = [
    'Nos débuts',
    'Moments inoubliables',
    'Les fous rires',
    'Un avenir prometteur',
    'Souvenirs de voyage',
    'La famille',
    'Les amis',
    'Notre histoire'
  ];

  const addChapter = (title) => {
    const newChapter = {
      id: Date.now(),
      title,
      order_index: chapters.length
    };
    onUpdate([...chapters, newChapter]);
    setNewChapterTitle('');
  };

  const removeChapter = (index) => {
    const newChapters = chapters.filter((_, i) => i !== index);
    onUpdate(newChapters);
  };

  const reorderChapter = (index, direction) => {
    const newChapters = [...chapters];
    if (direction === 'up' && index > 0) {
      [newChapters[index - 1], newChapters[index]] = [newChapters[index], newChapters[index - 1]];
    } else if (direction === 'down' && index < chapters.length - 1) {
      [newChapters[index], newChapters[index + 1]] = [newChapters[index + 1], newChapters[index]];
    }
    onUpdate(newChapters);
  };

  return (
    <div style={{ padding: '2rem', background: 'white', borderRadius: '10px', boxShadow: '0 2px 10px rgba(0,0,0,0.1)' }}>
      <h3>Organisation en chapitres</h3>
      
      {/* Chapitres existants */}
      {chapters.length > 0 && (
        <div style={{ marginBottom: '2rem' }}>
          <h4>Chapitres actuels</h4>
          {chapters.map((chapter, index) => (
            <div key={chapter.id} style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '1rem',
              background: '#f8f9fa',
              marginBottom: '0.5rem',
              borderRadius: '5px'
            }}>
              <span style={{ fontWeight: 'bold' }}>{chapter.title}</span>
              <div>
                <button onClick={() => reorderChapter(index, 'up')}>↑</button>
                <button onClick={() => reorderChapter(index, 'down')}>↓</button>
                <button onClick={() => removeChapter(index)}>🗑️</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Ajouter un chapitre */}
      <div>
        <h4>Ajouter un chapitre</h4>
        
        {/* Prédéfinis */}
        <div style={{ marginBottom: '1rem' }}>
          <p>Suggestions :</p>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {predefinedChapters.map(title => (
              <button
                key={title}
                onClick={() => addChapter(title)}
                style={{
                  padding: '0.5rem 1rem',
                  background: '#e9ecef',
                  border: 'none',
                  borderRadius: '20px',
                  cursor: 'pointer'
                }}
              >
                {title}
              </button>
            ))}
          </div>
        </div>

        {/* Personnalisé */}
        <div style={{ display: 'flex', gap: '1rem' }}>
          <input
            type="text"
            value={newChapterTitle}
            onChange={(e) => setNewChapterTitle(e.target.value)}
            placeholder="Titre du chapitre personnalisé"
            style={{ flex: 1, padding: '0.5rem' }}
          />
          <button
            onClick={() => newChapterTitle && addChapter(newChapterTitle)}
            style={{
              padding: '0.5rem 2rem',
              background: '#764ba2',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              cursor: 'pointer'
            }}
          >
            Ajouter
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChapterManager;