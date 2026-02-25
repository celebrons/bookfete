// C:\Users\USER\bookfete\frontend\src\components\home\EventPreview.js
import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

const EventPreview = () => {
  const { eventType } = useParams();
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    recipientName: '',
    recipientAge: '',
    recipientGender: '',
    bookTitle: ''
  });

  // Données pour chaque type d'événement
  const eventData = {
    'pot-depart': {
      title: 'Livre de pot de départ',
      icon: '🍾',
      color: '#9B59B6',
      description: 'Un souvenir collectif pour marquer le départ d\'un collègue',
      image: 'https://images.unsplash.com/photo-1511795409834-ef04bbd61622?auto=format&fit=crop&q=80&w=800'
    },
    'fin-projet': {
      title: 'Livre de fin de projet',
      icon: '🚀',
      color: '#E67E22',
      description: 'Célébrez la réussite collective avec votre équipe',
      image: 'https://images.unsplash.com/photo-1552664730-d307ca884978?auto=format&fit=crop&q=80&w=800'
    },
    'mariage': {
      title: 'Livre de mariage',
      icon: '💍',
      color: '#D4AF37',
      description: 'Les témoignages de vos invités réunis dans un album unique',
      image: 'https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&q=80&w=800'
    },
    'vacances': {
      title: 'Livre de vacances',
      icon: '✈️',
      color: '#20B2AA',
      description: 'Immortalisez vos plus beaux voyages',
      image: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&q=80&w=800'
    },
    'anniversaire': {
      title: "Livre d'anniversaire",
      icon: '🎂',
      color: '#FF6B6B',
      description: 'Célébrez un anniversaire inoubliable',
      image: 'https://images.unsplash.com/photo-1513151233558-d860c5398176?auto=format&fit=crop&q=80&w=800'
    },
    'retraite': {
      title: 'Livre de départ en retraite',
      icon: '🌅',
      color: '#FFA07A',
      description: 'Une nouvelle vie qui commence',
      image: 'https://images.unsplash.com/photo-1557804506-669a67965ba0?auto=format&fit=crop&q=80&w=800'
    }
  };

  const data = eventData[eventType] || eventData['anniversaire'];

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.recipientName) {
      alert('Veuillez indiquer le nom du destinataire');
      return;
    }
    
    // Construire l'URL avec tous les paramètres
    const params = new URLSearchParams({
      event: eventType,
      name: formData.recipientName,
      age: formData.recipientAge || '',
      gender: formData.recipientGender || '',
      title: formData.bookTitle || `${data.title} de ${formData.recipientName}`
    }).toString();
    
    // Rediriger vers la création (la connexion sera demandée là-bas si nécessaire)
    navigate(`/create-book?${params}`);
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      padding: '2rem'
    }}>
      <div style={{
        maxWidth: '1200px',
        margin: '0 auto',
        background: 'white',
        borderRadius: '20px',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        overflow: 'hidden'
      }}>
        {/* En-tête */}
        <div style={{
          background: data.color,
          padding: '2rem',
          color: 'white'
        }}>
          <div style={{ fontSize: '4rem', marginBottom: '1rem', textAlign: 'center' }}>
            {data.icon}
          </div>
          <h1 style={{ textAlign: 'center', margin: 0, fontSize: '2.5rem' }}>
            {data.title}
          </h1>
        </div>

        {/* Contenu */}
        <div style={{ padding: '3rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3rem' }}>
          {/* Colonne gauche : Formulaire */}
          <div>
            <h2 style={{ marginBottom: '2rem', color: '#333' }}>
              Qui est le destinataire ?
            </h2>

            <form onSubmit={handleSubmit}>
              {/* Nom (obligatoire) */}
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '0.5rem' }}>
                  Prénom / Nom <span style={{ color: '#dc3545' }}>*</span>
                </label>
                <input
                  type="text"
                  value={formData.recipientName}
                  onChange={(e) => setFormData({ ...formData, recipientName: e.target.value })}
                  placeholder="Ex: Yani, Gégé, Marie..."
                  required
                  style={{
                    width: '100%',
                    padding: '1rem',
                    border: '2px solid #e9ecef',
                    borderRadius: '8px',
                    fontSize: '1rem'
                  }}
                />
              </div>

              {/* Âge ou tranche d'âge */}
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '0.5rem' }}>
                  Âge ou tranche d'âge
                </label>
                <select
                  value={formData.recipientAge}
                  onChange={(e) => setFormData({ ...formData, recipientAge: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '1rem',
                    border: '2px solid #e9ecef',
                    borderRadius: '8px',
                    fontSize: '1rem',
                    background: 'white'
                  }}
                >
                  <option value="">Sélectionnez une option</option>
                  <option value="enfant">Enfant (0-12 ans)</option>
                  <option value="ado">Adolescent (13-17 ans)</option>
                  <option value="jeune">Jeune adulte (18-25 ans)</option>
                  <option value="adulte">Adulte (26-50 ans)</option>
                  <option value="senior">Senior (51-70 ans)</option>
                  <option value="veteran">Vétéran (70+ ans)</option>
                </select>
              </div>

              {/* Sexe */}
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '0.5rem' }}>
                  Sexe
                </label>
                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <input
                      type="radio"
                      name="gender"
                      value="homme"
                      checked={formData.recipientGender === 'homme'}
                      onChange={(e) => setFormData({ ...formData, recipientGender: e.target.value })}
                    />
                    Homme
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <input
                      type="radio"
                      name="gender"
                      value="femme"
                      checked={formData.recipientGender === 'femme'}
                      onChange={(e) => setFormData({ ...formData, recipientGender: e.target.value })}
                    />
                    Femme
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <input
                      type="radio"
                      name="gender"
                      value="autre"
                      checked={formData.recipientGender === 'autre'}
                      onChange={(e) => setFormData({ ...formData, recipientGender: e.target.value })}
                    />
                    Autre
                  </label>
                </div>
              </div>

              {/* Titre du livre (optionnel) */}
              <div style={{ marginBottom: '2rem' }}>
                <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '0.5rem' }}>
                  Titre du livre (optionnel)
                </label>
                <input
                  type="text"
                  value={formData.bookTitle}
                  onChange={(e) => setFormData({ ...formData, bookTitle: e.target.value })}
                  placeholder={`${data.title} de ${formData.recipientName || 'la personne'}`}
                  style={{
                    width: '100%',
                    padding: '1rem',
                    border: '2px solid #e9ecef',
                    borderRadius: '8px',
                    fontSize: '1rem'
                  }}
                />
              </div>

              <button
                type="submit"
                disabled={!formData.recipientName}
                style={{
                  width: '100%',
                  padding: '1.2rem',
                  background: formData.recipientName ? data.color : '#ccc',
                  color: 'white',
                  border: 'none',
                  borderRadius: '50px',
                  fontSize: '1.1rem',
                  fontWeight: 'bold',
                  cursor: formData.recipientName ? 'pointer' : 'not-allowed',
                  transition: 'all 0.3s'
                }}
              >
                ✨ Créer mon livre
              </button>
              
              <p style={{ marginTop: '1rem', fontSize: '0.9rem', color: '#666', textAlign: 'center' }}>
                Vous serez redirigé vers la connexion si nécessaire
              </p>
            </form>
          </div>

          {/* Colonne droite : Aperçu */}
          <div>
            <h2 style={{ marginBottom: '2rem', color: '#333' }}>
              À quoi va ressembler votre livre
            </h2>

            {/* Aperçu de la couverture */}
            <div style={{
              background: data.color,
              borderRadius: '10px',
              padding: '2rem',
              color: 'white',
              marginBottom: '2rem',
              boxShadow: '0 10px 30px rgba(0,0,0,0.2)'
            }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem', textAlign: 'center' }}>
                {data.icon}
              </div>
              <h3 style={{ textAlign: 'center', margin: '0 0 0.5rem', fontSize: '1.5rem' }}>
                {formData.bookTitle || (formData.recipientName ? `${data.title} de ${formData.recipientName}` : data.title)}
              </h3>
              <p style={{ textAlign: 'center', opacity: 0.9, margin: 0 }}>
                {data.description}
              </p>
            </div>

            {/* Aperçu des chapitres */}
            <div style={{
              background: '#f8f9fa',
              borderRadius: '10px',
              padding: '1.5rem',
              border: '1px solid #e9ecef'
            }}>
              <h4 style={{ margin: '0 0 1rem', color: '#333' }}>
                📖 Chapitres proposés
              </h4>
              <ul style={{ margin: 0, paddingLeft: '1.2rem', color: '#666' }}>
                <li>Souvenirs d'enfance</li>
                <li>Moments complices</li>
                <li>Ce que j'aime chez toi</li>
                <li>Nos meilleurs souvenirs</li>
                <li>Messages</li>
                <li>Vœux pour l'avenir</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EventPreview;