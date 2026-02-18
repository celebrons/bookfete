// C:\Users\USER\bookfete\frontend\src\components\home\HomePage.js
import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import HeroSection from './HeroSection';
import OffresSection from './OffresSection';
import TemoignagesSection from './TemoignagesSection';
import CTASection from './CTASection';
import Layout from '../layout/Layout';
import './Home.css';

const HomePage = () => {
  const navigate = useNavigate();

  const themes = [
    { id: 'famille', icon: '👨‍👩‍👧‍👦', name: 'Famille', description: 'Immortalisez les moments précieux en famille' },
    { id: 'amour', icon: '❤️', name: 'Amour', description: 'Célébrez votre histoire d\'amour unique' },
    { id: 'amitie', icon: '🤝', name: 'Amitié', description: 'Les meilleurs moments partagés entre amis' },
    { id: 'voyage', icon: '✈️', name: 'Voyage', description: 'Retracez vos plus belles aventures' },
    { id: 'entreprise', icon: '💼', name: 'Entreprise', description: 'Valorisez votre culture d\'entreprise' }
  ];

  return (
    <Layout>
      <HeroSection />
      
      {/* Section Thématiques */}
      <section className="themes-section">
        <h2>Choisissez votre thématique</h2>
        <div className="themes-grid">
          {themes.map(theme => (
            <Link
              to={`/theme/${theme.id}`}
              key={theme.id}
              className="theme-card-link"
            >
              <div className="theme-card">
                <div className="theme-icon">{theme.icon}</div>
                <h3>{theme.name}</h3>
                <p className="theme-description">{theme.description}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <OffresSection />
      <TemoignagesSection />
      <CTASection />
    </Layout>
  );
};

export default HomePage;