// C:\Users\USER\bookfete\frontend\src\components\book\BackCoverEditor.js
import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabaseClient';

const BackCoverEditor = ({ book, chapters, onUpdateBook }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [contributors, setContributors] = useState([]);
  const [backConfig, setBackConfig] = useState(
    book.back_cover_config || {
      template: 'classic',
      show_contributors: true,
      custom_text: '',
      color: '#f5f5f5'
    }
  );

  // Templates disponibles
  const templates = [
    {
      id: 'classic',
      name: 'Classique',
      description: 'Liste simple des contributeurs',
      preview: '📘'
    },
    {
      id: 'elegant',
      name: 'Élégant',
      description: 'Avec citation et liste',
      preview: '📚'
    },
    {
      id: 'modern',
      name: 'Moderne',
      description: 'Design épuré',
      preview: '📖'
    }
  ];

  // Charger la liste des contributeurs
  useEffect(() => {
    loadContributors();
  }, [chapters]);

  const loadContributors = async () => {
    try {
      // Récupérer tous les IDs des chapitres
      const chapterIds = chapters.map(ch => ch.id);
      
      if (chapterIds.length === 0) return;

      // Récupérer les contributeurs approuvés
      const { data, error } = await supabase
        .from('contributions')
        .select('contributor_name')
        .in('chapter_id', chapterIds)
        .eq('approved', true)
        .order('created_at', { ascending: true });

      if (error) throw error;

      // Noms uniques
      const uniqueNames = [...new Set(data.map(c => c.contributor_name))];
      setContributors(uniqueNames);
    } catch (error) {
      console.error('❌ Erreur chargement contributeurs:', error);
    }
  };

  const handleSave = () => {
    onUpdateBook({ back_cover_config: backConfig });
    setIsEditing(false);
  };

  // Aperçu de la 4ème de couverture
  const BackCoverPreview = () => (
    <div style={{
      width: '100%',
      minHeight: '300px',
      background: backConfig.color,
      borderRadius: '8px',
      boxShadow: '0 10px 30px rgba(0,0,0,0.2)',
      padding: '2rem',
      color: '#333',
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* Décor selon le template */}
      {backConfig.template === 'classic' && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '10px',
          background: 'linear-gradient(90deg, #b8924a, #d4af37)'
        }} />
      )}
      
      {backConfig.template === 'elegant' && (
        <div style={{
          position: 'absolute',
          top: '2rem',
          left: '2rem',
          fontSize: '4rem',
          opacity: 0.1,
          transform: 'rotate(-15deg)'
        }}>
          ✨
        </div>
      )}

      <div style={{ position: 'relative', zIndex: 2 }}>
        <h3 style={{ 
          margin: '0 0 1.5rem',
          color: '#b8924a',
          fontSize: '1.5rem'
        }}>
          Cet ouvrage a été rédigé par :
        </h3>

        {backConfig.show_contributors && (
          <div style={{ marginBottom: '2rem' }}>
            {contributors.length > 0 ? (
              <ul style={{
                listStyle: 'none',
                padding: 0,
                margin: 0,
                columns: contributors.length > 5 ? '2' : '1',
                columnGap: '2rem'
              }}>
                {contributors.map((name, index) => (
                  <li key={index} style={{
                    marginBottom: '0.5rem',
                    fontSize: '1.1rem',
                    borderBottom: '1px dotted #ddd',
                    paddingBottom: '0.3rem'
                  }}>
                    {name}
                  </li>
                ))}
              </ul>
            ) : (
              <p style={{ fontStyle: 'italic', color: '#999' }}>
                Aucun contributeur pour l'instant
              </p>
            )}
          </div>
        )}

        {backConfig.custom_text && (
          <div style={{
            marginTop: '2rem',
            paddingTop: '2rem',
            borderTop: '2px solid #e8e8e8',
            fontStyle: 'italic',
            color: '#666'
          }}>
            {backConfig.custom_text}
          </div>
        )}

        <div style={{
          marginTop: '2rem',
          textAlign: 'right',
          fontSize: '0.9rem',
          color: '#999'
        }}>
          {contributors.length} contributeur{contributors.length > 1 ? 's' : ''}
        </div>
      </div>
    </div>
  );

  if (isEditing) {
    return (
      <div style={{
        background: 'white',
        borderRadius: '10px',
        padding: '2rem',
        boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
      }}>
        <h2 style={{ margin: '0 0 2rem', color: '#333' }}>📘 Personnaliser la 4ème de couverture</h2>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
          {/* Colonne gauche : Éditeur */}
          <div>
            {/* Choix du template */}
            <div style={{ marginBottom: '2rem' }}>
              <label style={{
                display: 'block',
                fontSize: '0.9rem',
                fontWeight: 'bold',
                marginBottom: '1rem',
                color: '#555'
              }}>
                Style de la page
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
                {templates.map(t => (
                  <div
                    key={t.id}
                    onClick={() => setBackConfig({ ...backConfig, template: t.id })}
                    style={{
                      padding: '1rem',
                      border: backConfig.template === t.id ? '2px solid #764ba2' : '1px solid #ddd',
                      borderRadius: '8px',
                      textAlign: 'center',
                      cursor: 'pointer',
                      background: backConfig.template === t.id ? '#f3e8ff' : 'white'
                    }}
                  >
                    <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>{t.preview}</div>
                    <h4 style={{ margin: '0 0 0.3rem', fontSize: '0.9rem' }}>{t.name}</h4>
                    <small style={{ color: '#666' }}>{t.description}</small>
                  </div>
                ))}
              </div>
            </div>

            {/* Afficher les contributeurs */}
            <div style={{ marginBottom: '2rem' }}>
              <label style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                fontSize: '0.9rem',
                fontWeight: 'bold',
                marginBottom: '0.5rem',
                color: '#555'
              }}>
                <input
                  type="checkbox"
                  checked={backConfig.show_contributors}
                  onChange={(e) => setBackConfig({ ...backConfig, show_contributors: e.target.checked })}
                />
                Afficher la liste des contributeurs
              </label>
              {backConfig.show_contributors && (
                <small style={{ color: '#999', display: 'block', marginLeft: '1.5rem' }}>
                  {contributors.length} contributeur(s) trouvé(s)
                </small>
              )}
            </div>

            {/* Message personnalisé */}
            <div style={{ marginBottom: '2rem' }}>
              <label style={{
                display: 'block',
                fontSize: '0.9rem',
                fontWeight: 'bold',
                marginBottom: '0.5rem',
                color: '#555'
              }}>
                Message personnalisé (optionnel)
              </label>
              <textarea
                value={backConfig.custom_text}
                onChange={(e) => setBackConfig({ ...backConfig, custom_text: e.target.value })}
                placeholder="ex: Merci à tous pour ces merveilleux souvenirs..."
                rows="4"
                style={{
                  width: '100%',
                  padding: '0.8rem',
                  border: '1px solid #ddd',
                  borderRadius: '5px',
                  fontSize: '1rem',
                  resize: 'vertical'
                }}
              />
            </div>

            {/* Choix de la couleur de fond */}
            <div style={{ marginBottom: '2rem' }}>
              <label style={{
                display: 'block',
                fontSize: '0.9rem',
                fontWeight: 'bold',
                marginBottom: '0.5rem',
                color: '#555'
              }}>
                Couleur de fond
              </label>
              <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                {['#f5f5f5', '#ffffff', '#faf3e8', '#e8f4fd'].map(color => (
                  <div
                    key={color}
                    onClick={() => setBackConfig({ ...backConfig, color })}
                    style={{
                      width: '50px',
                      height: '50px',
                      borderRadius: '50%',
                      background: color,
                      cursor: 'pointer',
                      border: backConfig.color === color ? '4px solid #764ba2' : '2px solid transparent',
                      boxShadow: '0 2px 5px rgba(0,0,0,0.1)'
                    }}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Colonne droite : Aperçu */}
          <div>
            <label style={{
              display: 'block',
              fontSize: '0.9rem',
              fontWeight: 'bold',
              marginBottom: '1rem',
              color: '#555'
            }}>
              Aperçu en direct
            </label>
            <BackCoverPreview />
          </div>
        </div>

        {/* Boutons d'action */}
        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '2rem' }}>
          <button
            onClick={() => setIsEditing(false)}
            style={{
              padding: '0.8rem 2rem',
              background: '#6c757d',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              cursor: 'pointer',
              fontSize: '1rem'
            }}
          >
            Annuler
          </button>
          <button
            onClick={handleSave}
            style={{
              padding: '0.8rem 2rem',
              background: '#28a745',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              cursor: 'pointer',
              fontSize: '1rem',
              fontWeight: 'bold'
            }}
          >
            Enregistrer la 4ème de couverture
          </button>
        </div>
      </div>
    );
  }

  // Mode visualisation
  return (
    <div style={{
      background: 'white',
      borderRadius: '10px',
      padding: '2rem',
      boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h2 style={{ margin: 0, color: '#333' }}>📘 4ème de couverture</h2>
        <button
          onClick={() => setIsEditing(true)}
          style={{
            padding: '0.6rem 1.2rem',
            background: '#b8924a',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer',
            fontSize: '1rem'
          }}
        >
          ✏️ Personnaliser
        </button>
      </div>

      <BackCoverPreview />

      <p style={{
        marginTop: '2rem',
        padding: '1rem',
        background: '#f8f9fa',
        borderRadius: '5px',
        color: '#666',
        fontSize: '0.9rem',
        borderLeft: '4px solid #b8924a'
      }}>
        <strong>📌 Information :</strong> La 4ème de couverture apparaîtra à la fin du livre,
        après le dernier chapitre. La liste des contributeurs est automatiquement mise à jour.
      </p>
    </div>
  );
};

export default BackCoverEditor;