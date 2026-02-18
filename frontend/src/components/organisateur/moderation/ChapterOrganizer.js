// C:\Users\USER\bookfete\frontend\src\components\organisateur\moderation\ChapterOrganizer.js
import React, { useState } from 'react';

const ChapterOrganizer = ({ chapters, contributions, chapterContributions, onUpdateChapterContributions }) => {
  const [draggedContribution, setDraggedContribution] = useState(null);
  const [expandedChapter, setExpandedChapter] = useState(null);

  const handleDragStart = (contribution) => {
    setDraggedContribution(contribution);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = (chapterId) => {
    if (!draggedContribution) return;

    const currentContribs = chapterContributions[chapterId] || [];
    if (!currentContribs.includes(draggedContribution.id)) {
      onUpdateChapterContributions(chapterId, [...currentContribs, draggedContribution.id]);
    }
    setDraggedContribution(null);
  };

  const removeFromChapter = (chapterId, contributionId) => {
    const currentContribs = chapterContributions[chapterId] || [];
    onUpdateChapterContributions(chapterId, currentContribs.filter(id => id !== contributionId));
  };

  const getContributionsNotInAnyChapter = () => {
    const assignedIds = Object.values(chapterContributions).flat();
    return contributions.filter(c => !assignedIds.includes(c.id));
  };

  return (
    <div style={{ display: 'flex', gap: '2rem' }}>
      {/* Colonne des contributions non assignées */}
      <div style={{ flex: 1, background: 'white', padding: '1.5rem', borderRadius: '10px', boxShadow: '0 2px 10px rgba(0,0,0,0.1)' }}>
        <h3>Contributions non assignées</h3>
        <p style={{ color: '#666', fontSize: '0.9rem', marginBottom: '1rem' }}>
          Glissez-déposez dans les chapitres
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {getContributionsNotInAnyChapter().map(contribution => (
            <div
              key={contribution.id}
              draggable
              onDragStart={() => handleDragStart(contribution)}
              style={{
                padding: '0.8rem',
                background: '#f8f9fa',
                border: '1px solid #dee2e6',
                borderRadius: '5px',
                cursor: 'move',
                opacity: draggedContribution?.id === contribution.id ? 0.5 : 1
              }}
            >
              <div style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>{contribution.contributor_email}</div>
              <div style={{ fontSize: '0.8rem', color: '#666' }}>
                {contribution.message?.substring(0, 50)}...
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Colonne des chapitres */}
      <div style={{ flex: 2 }}>
        <h3>Chapitres</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {chapters.map(chapter => {
            const chapterContribs = contributions.filter(c => 
              (chapterContributions[chapter.id] || []).includes(c.id)
            );

            return (
              <div
                key={chapter.id}
                onDragOver={handleDragOver}
                onDrop={() => handleDrop(chapter.id)}
                style={{
                  background: 'white',
                  padding: '1rem',
                  borderRadius: '8px',
                  boxShadow: '0 2px 5px rgba(0,0,0,0.1)',
                  border: '2px dashed #ccc'
                }}
              >
                <div
                  onClick={() => setExpandedChapter(expandedChapter === chapter.id ? null : chapter.id)}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    cursor: 'pointer'
                  }}
                >
                  <h4 style={{ margin: 0, color: '#764ba2' }}>{chapter.title}</h4>
                  <span>{expandedChapter === chapter.id ? '▼' : '▶'}</span>
                </div>
                
                <p style={{ fontSize: '0.9rem', color: '#666', margin: '0.5rem 0' }}>
                  {chapterContribs.length} contribution{chapterContribs.length > 1 ? 's' : ''}
                </p>

                {expandedChapter === chapter.id && (
                  <div style={{ marginTop: '1rem' }}>
                    {chapterContribs.map(contrib => (
                      <div
                        key={contrib.id}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '0.5rem',
                          background: '#f8f9fa',
                          borderRadius: '5px',
                          marginBottom: '0.5rem'
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>{contrib.contributor_email}</div>
                          <div style={{ fontSize: '0.8rem', color: '#666' }}>
                            {contrib.message?.substring(0, 30)}...
                          </div>
                        </div>
                        <button
                          onClick={() => removeFromChapter(chapter.id, contrib.id)}
                          style={{
                            padding: '0.3rem 0.6rem',
                            background: '#dc3545',
                            color: 'white',
                            border: 'none',
                            borderRadius: '3px',
                            cursor: 'pointer'
                          }}
                        >
                          Retirer
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default ChapterOrganizer;