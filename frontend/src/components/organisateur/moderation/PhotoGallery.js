// C:\Users\USER\bookfete\frontend\src\components\organisateur\moderation\PhotoGallery.js
import React, { useState } from 'react';

const PhotoGallery = ({ contributions, onUpdatePhoto }) => {
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [caption, setCaption] = useState('');
  const [filter, setFilter] = useState('all'); // all, with-caption, without-caption

  // Récupérer toutes les photos de toutes les contributions
  const allPhotos = contributions.flatMap(contribution => 
    (contribution.photo_urls || []).map(url => ({
      url,
      contributionId: contribution.id,
      contributorEmail: contribution.contributor_email,
      caption: contribution.photo_captions?.[contribution.photo_urls.indexOf(url)] || '',
      isMain: contribution.main_photo_index === contribution.photo_urls.indexOf(url)
    }))
  );

  const filteredPhotos = allPhotos.filter(photo => {
    if (filter === 'with-caption') return photo.caption;
    if (filter === 'without-caption') return !photo.caption;
    return true;
  });

  const handleSetMainPhoto = async (photo) => {
    const contribution = contributions.find(c => c.id === photo.contributionId);
    const photoIndex = contribution.photo_urls.indexOf(photo.url);
    
    const updatedContribution = {
      ...contribution,
      main_photo_index: photoIndex
    };
    
    onUpdatePhoto(updatedContribution);
  };

  const handleAddCaption = async (photo) => {
    const contribution = contributions.find(c => c.id === photo.contributionId);
    const photoIndex = contribution.photo_urls.indexOf(photo.url);
    
    const photoCaptions = [...(contribution.photo_captions || [])];
    photoCaptions[photoIndex] = caption;
    
    const updatedContribution = {
      ...contribution,
      photo_captions: photoCaptions
    };
    
    onUpdatePhoto(updatedContribution);
    setSelectedPhoto(null);
    setCaption('');
  };

  const handleRemovePhoto = async (photo) => {
    if (!window.confirm('Supprimer cette photo ?')) return;
    
    const contribution = contributions.find(c => c.id === photo.contributionId);
    const photoIndex = contribution.photo_urls.indexOf(photo.url);
    
    const newPhotoUrls = contribution.photo_urls.filter((_, i) => i !== photoIndex);
    const newPhotoCaptions = contribution.photo_captions?.filter((_, i) => i !== photoIndex) || [];
    
    const updatedContribution = {
      ...contribution,
      photo_urls: newPhotoUrls,
      photo_captions: newPhotoCaptions
    };
    
    onUpdatePhoto(updatedContribution);
  };

  return (
    <div style={{ background: 'white', padding: '2rem', borderRadius: '10px', boxShadow: '0 2px 10px rgba(0,0,0,0.1)' }}>
      <h3>Galerie photos</h3>
      
      {/* Filtres */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
        <button
          onClick={() => setFilter('all')}
          style={{
            padding: '0.5rem 1rem',
            background: filter === 'all' ? '#764ba2' : '#f8f9fa',
            color: filter === 'all' ? 'white' : '#333',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer'
          }}
        >
          Toutes ({allPhotos.length})
        </button>
        <button
          onClick={() => setFilter('with-caption')}
          style={{
            padding: '0.5rem 1rem',
            background: filter === 'with-caption' ? '#764ba2' : '#f8f9fa',
            color: filter === 'with-caption' ? 'white' : '#333',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer'
          }}
        >
          Avec légende
        </button>
        <button
          onClick={() => setFilter('without-caption')}
          style={{
            padding: '0.5rem 1rem',
            background: filter === 'without-caption' ? '#764ba2' : '#f8f9fa',
            color: filter === 'without-caption' ? 'white' : '#333',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer'
          }}
        >
          Sans légende
        </button>
      </div>

      {/* Grille de photos */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
        gap: '1.5rem'
      }}>
        {filteredPhotos.map((photo, index) => (
          <div
            key={index}
            style={{
              position: 'relative',
              borderRadius: '8px',
              overflow: 'hidden',
              boxShadow: '0 2px 5px rgba(0,0,0,0.1)',
              cursor: 'pointer'
            }}
            onClick={() => setSelectedPhoto(photo)}
          >
            <img
              src={photo.url}
              alt={`Photo de ${photo.contributorEmail}`}
              style={{
                width: '100%',
                height: '150px',
                objectFit: 'cover'
              }}
            />
            {photo.isMain && (
              <div style={{
                position: 'absolute',
                top: '5px',
                left: '5px',
                background: 'gold',
                color: 'black',
                padding: '2px 5px',
                borderRadius: '3px',
                fontSize: '0.8rem'
              }}>
                ⭐ Principale
              </div>
            )}
            {photo.caption && (
              <div style={{
                position: 'absolute',
                bottom: '5px',
                left: '5px',
                right: '5px',
                background: 'rgba(0,0,0,0.7)',
                color: 'white',
                padding: '3px',
                borderRadius: '3px',
                fontSize: '0.8rem',
                textAlign: 'center'
              }}>
                {photo.caption}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Modal de gestion de photo */}
      {selectedPhoto && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: 'white',
            padding: '2rem',
            borderRadius: '10px',
            maxWidth: '500px',
            width: '90%'
          }}>
            <img
              src={selectedPhoto.url}
              alt="Photo sélectionnée"
              style={{
                width: '100%',
                maxHeight: '300px',
                objectFit: 'contain',
                marginBottom: '1rem'
              }}
            />
            
            <p><strong>De :</strong> {selectedPhoto.contributorEmail}</p>
            
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem' }}>Légende :</label>
              <input
                type="text"
                value={caption || selectedPhoto.caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="Ajouter une légende..."
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  borderRadius: '5px',
                  border: '1px solid #ddd'
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  if (!selectedPhoto.isMain) {
                    handleSetMainPhoto(selectedPhoto);
                  }
                }}
                disabled={selectedPhoto.isMain}
                style={{
                  padding: '0.5rem 1rem',
                  background: selectedPhoto.isMain ? '#ccc' : 'gold',
                  color: selectedPhoto.isMain ? '#666' : 'black',
                  border: 'none',
                  borderRadius: '5px',
                  cursor: selectedPhoto.isMain ? 'not-allowed' : 'pointer'
                }}
              >
                ⭐ Définir comme principale
              </button>
              <button
                onClick={() => handleAddCaption(selectedPhoto)}
                style={{
                  padding: '0.5rem 1rem',
                  background: '#28a745',
                  color: 'white',
                  border: 'none',
                  borderRadius: '5px',
                  cursor: 'pointer'
                }}
              >
                💾 Enregistrer légende
              </button>
              <button
                onClick={() => handleRemovePhoto(selectedPhoto)}
                style={{
                  padding: '0.5rem 1rem',
                  background: '#dc3545',
                  color: 'white',
                  border: 'none',
                  borderRadius: '5px',
                  cursor: 'pointer'
                }}
              >
                🗑️ Supprimer
              </button>
              <button
                onClick={() => setSelectedPhoto(null)}
                style={{
                  padding: '0.5rem 1rem',
                  background: '#6c757d',
                  color: 'white',
                  border: 'none',
                  borderRadius: '5px',
                  cursor: 'pointer'
                }}
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PhotoGallery;