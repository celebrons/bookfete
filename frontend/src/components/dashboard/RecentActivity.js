// C:\Users\USER\bookfete\frontend\src\components\dashboard\RecentActivity.js
import React from 'react';
import { useNavigate } from 'react-router-dom';

const RecentActivity = ({ activities }) => {
  const navigate = useNavigate();

  if (!activities || activities.length === 0) {
    return (
      <div style={{
        background: 'white',
        padding: '2rem',
        borderRadius: '10px',
        boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
        textAlign: 'center'
      }}>
        <p style={{ color: '#666', margin: 0 }}>Aucune activité récente</p>
      </div>
    );
  }

  const getActivityIcon = (type) => {
    return '💬'; // Pour l'instant, toutes les activités sont des contributions
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now - date;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) return "aujourd'hui";
    if (days === 1) return "hier";
    if (days < 7) return `il y a ${days} jours`;
    return date.toLocaleDateString('fr-FR');
  };

  return (
    <div style={{
      background: 'white',
      padding: '2rem',
      borderRadius: '10px',
      boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
    }}>
      <h3 style={{ margin: '0 0 1.5rem' }}>📋 Activité récente</h3>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {activities.map((activity, index) => (
          <div
            key={activity.id}
            onClick={() => {
              if (activity.chapter?.book) {
                navigate(`/book/${activity.chapter.book.id}/chapter/${activity.chapter_id}`);
              }
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '1rem',
              padding: '1rem',
              background: index % 2 === 0 ? '#f8f9fa' : 'white',
              borderRadius: '8px',
              cursor: activity.chapter?.book ? 'pointer' : 'default',
              transition: 'background 0.2s'
            }}
            onMouseEnter={(e) => {
              if (activity.chapter?.book) {
                e.currentTarget.style.background = '#f3e8ff';
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = index % 2 === 0 ? '#f8f9fa' : 'white';
            }}
          >
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              background: '#764ba2',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontSize: '1.2rem'
            }}>
              {getActivityIcon()}
            </div>
            
            <div style={{ flex: 1 }}>
              <p style={{ margin: '0 0 0.3rem' }}>
                <strong>{activity.contributor_name || activity.contributor_email}</strong>
                {' '}a contribué au chapitre{' '}
                <strong>"{activity.chapter?.title}"</strong>
              </p>
              <p style={{ margin: 0, color: '#666', fontSize: '0.9rem' }}>
                {activity.chapter?.book?.title} • {formatDate(activity.created_at)}
              </p>
            </div>

            {activity.photo_urls?.length > 0 && (
              <span style={{
                background: '#17a2b8',
                color: 'white',
                padding: '0.2rem 0.5rem',
                borderRadius: '3px',
                fontSize: '0.8rem'
              }}>
                📸 {activity.photo_urls.length}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default RecentActivity;