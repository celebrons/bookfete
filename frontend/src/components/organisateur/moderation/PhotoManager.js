// C:\Users\USER\bookfete\frontend\src\components\organisateur\moderation\PhotoManager.js
import React from 'react';

const PhotoManager = ({ photos, onUpdate }) => {
  const handleReorder = (index, direction) => {
    const newPhotos = [...photos];
    if (direction === 'up' && index > 0) {
      [newPhotos[index - 1], newPhotos[index]] = [newPhotos[index], newPhotos[index - 1]];
    } else if (direction === 'down' && index < photos.length - 1) {
      [newPhotos[index], newPhotos[index + 1]] = [newPhotos[index + 1], newPhotos[index]];
    }
    onUpdate(newPhotos);
  };

  const handleSetMain = (index) => {
    const newPhotos = [...photos];
    const [mainPhoto] = newPhotos.splice(index, 1);
    newPhotos.unshift(mainPhoto);
    onUpdate(newPhotos);
  };

  const handleDelete = (index) => {
    const newPhotos = photos.filter((_, i) => i !== index);
    onUpdate(newPhotos);
  };

  return (
    <div>
      <h4>Gestion des photos ({photos.length})</h4>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
        gap: '1rem',
        marginTop: '1rem'
      }}>
        {photos.map((photo, index) => (
          <div key={index} style={{
            position: 'relative',
            border: index === 0 ? '3px solid gold' : 'none',
            borderRadius: '8px',
            overflow: 'hidden'
          }}>
            <img
              src={photo}
              alt={`photo-${index}`}
              style={{
                width: '100%',
                height: '150px',
                objectFit: 'cover'
              }}
            />
            {index === 0 && (
              <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                background: 'gold',
                color: 'black',
                padding: '2px 5px',
                fontSize: '0.8rem'
              }}>
                Principale
              </div>
            )}
            <div style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              background: 'rgba(0,0,0,0.7)',
              display: 'flex',
              justifyContent: 'space-around',
              padding: '0.5rem'
            }}>
              <button onClick={() => handleReorder(index, 'up')}>↑</button>
              <button onClick={() => handleReorder(index, 'down')}>↓</button>
              <button onClick={() => handleSetMain(index)}>⭐</button>
              <button onClick={() => handleDelete(index)}>🗑️</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default PhotoManager;