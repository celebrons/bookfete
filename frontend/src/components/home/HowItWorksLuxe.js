// C:\Users\USER\bookfete\frontend\src\components\home\HowItWorksLuxe.js
import React from 'react';
import { Link } from 'react-router-dom';
import '../../styles/luxe-theme.css';
import './HowItWorksLuxe.css';

const HowItWorksLuxe = () => {
  const steps = [
    {
      number: '1️⃣',
      title: 'Créez votre projet',
      description: 'Choisissez votre événement (anniversaire, mariage, départ...) et donnez un titre à votre livre.',
      time: '1 minute',
      highlight: 'Aucune inscription requise pour commencer'
    },
    {
      number: '2️⃣',
      title: 'Ajoutez vos photos et vos textes',
      description: 'Importez vos photos et écrivez vos souvenirs directement dans l\'éditeur, à votre rythme.',
      time: '10 minutes',
      highlight: 'Vous gardez la main sur chaque mot et chaque image'
    },
    {
      number: '3️⃣',
      title: 'Choisissez le style',
      description: 'Sélectionnez une mise en page (finition, papier, style narratif) et le nombre de pages. L\'aperçu se met à jour en direct.',
      time: '5 minutes',
      highlight: 'Mise en page automatique, sans IA'
    },
    {
      number: '4️⃣',
      title: 'Composez et commandez',
      description: 'Générez l\'aperçu de votre livre, validez, commandez et recevez-le chez vous en 2 semaines.',
      time: '5 minutes',
      highlight: 'Qualité d\'impression professionnelle'
    }
  ];

  const features = [
    {
      icon: '🎨',
      title: 'Styles personnalisables',
      description: 'Choisissez la finition, le papier et le ton de votre livre parmi plusieurs styles pensés pour chaque type d\'événement.'
    },
    {
      icon: '📸',
      title: 'Photos de qualité',
      description: 'Importez vos photos, elles sont optimisées pour l\'impression et placées harmonieusement dans le livre.'
    },
    {
      icon: '✨',
      title: 'Mise en page luxueuse',
      description: 'Typographie élégante, marges généreuses, papiers premium. Votre livre a l\'allure d\'un véritable ouvrage d\'éditeur.'
    },
    {
      icon: '🖊️',
      title: 'Vous restez l\'auteur',
      description: 'Aucun texte n\'est généré à votre place : c\'est vous qui écrivez, le moteur se charge uniquement de la mise en page.'
    },
    {
      icon: '👁️',
      title: 'Aperçu en direct',
      description: 'Visualisez votre livre au fil de la composition et ajustez le style ou le nombre de pages avant de commander.'
    },
    {
      icon: '📄',
      title: 'Export PDF',
      description: 'Téléchargez un aperçu PDF de votre livre a tout moment, avant meme de passer commande.'
    }
  ];

  const testimonials = [
    {
      text: "J'ai créé un livre pour les 60 ans de mon mari en seulement 20 minutes. J'ai ajouté mes photos et mes textes, et le résultat est magnifique !",
      name: "Sophie",
      role: "Les 60 ans de Gégé",
      image: "https://images.unsplash.com/photo-1494790108777-296ef5a2ec48?w=100&h=100&fit=crop"
    },
    {
      text: "Pour le départ de notre collègue, j'ai rassemblé nos photos et nos mots en une soirée. La mise en page automatique a fait un travail incroyable. Le livre est splendide !",
      name: "Thomas",
      role: "Pot de départ",
      image: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop"
    },
    {
      text: "Notre livre de mariage est unique. J'ai pu tout composer moi-même, et les photos sont magnifiques. Merci pour cette pépite !",
      name: "Marie & Pierre",
      role: "Mariage",
      image: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop"
    }
  ];

  const faqs = [
    {
      question: "📦 Combien de temps pour recevoir le livre ?",
      answer: "Comptez 2 semaines entre votre commande et la réception. L'impression est réalisée en France avec des partenaires de confiance."
    },
    {
      question: "📸 Peut-on ajouter des photos ?",
      answer: "Oui, vous pouvez importer autant de photos que vous le souhaitez. Elles sont optimisées automatiquement pour une qualité d'impression parfaite."
    },
    {
      question: "🖊️ Qui écrit les textes du livre ?",
      answer: "Vous. Aucun contenu n'est généré automatiquement : le moteur de mise en page place vos photos et vos textes dans le style choisi."
    },
    {
      question: "💳 Comment fonctionne le paiement ?",
      answer: "Vous payez en ligne par carte bancaire (paiement sécurisé Stripe). Le livre n'est imprimé qu'après validation de votre commande."
    },
    {
      question: "📝 Peut-on modifier après validation ?",
      answer: "Oui, vous pouvez ajuster vos photos, vos textes et le style tant que vous n'avez pas validé définitivement votre livre."
    },
    {
      question: "🎁 Y a-t-il une version coffret ?",
      answer: "Bientôt ! Nous travaillons sur des éditions encore plus luxueuses avec coffret et jaquette personnalisée."
    }
  ];

  return (
    <div className="how-it-works-page">
      {/* Hero section */}
      <section className="how-hero">
        <div className="container-luxe">
          <span className="label-gold">DÉCOUVRIR</span>
          <h1>✨ Comment ça marche ?</h1>
          <p className="hero-description">
            Créez un livre unique en 4 étapes simples, sans aucune compétence technique. Vos photos, vos textes, votre style.
          </p>
          
          <div className="hero-stats">
            <div className="stat-item">
              <span className="stat-number">1500+</span>
              <span className="stat-label">Livres créés</span>
            </div>
            <div className="stat-item">
              <span className="stat-number">45 min</span>
              <span className="stat-label">Temps actif</span>
            </div>
            <div className="stat-item">
              <span className="stat-number">24h</span>
              <span className="stat-label">Premières contributions</span>
            </div>
          </div>
        </div>
      </section>

      {/* Timeline des étapes */}
      <section className="timeline-section">
        <div className="container-luxe">
          <div className="section-header">
            <span className="label-gold">LE PROCESSUS</span>
            <h2>📋 En 4 étapes, votre livre prend vie</h2>
            <p className="section-subtitle">De l'idée à la réalisation, suivez le guide</p>
          </div>

          <div className="timeline-grid">
            {steps.map((step, index) => (
              <div key={index} className="timeline-item">
                <div className="timeline-number">{step.number}</div>
                <div className="timeline-content">
                  <h3>{step.title}</h3>
                  <p>{step.description}</p>
                  <div className="timeline-meta">
                    <span className="timeline-time">⏱️ {step.time}</span>
                    <span className="timeline-highlight">{step.highlight}</span>
                  </div>
                </div>
                {index < steps.length - 1 && <div className="timeline-connector" />}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Ce qui rend le livre unique */}
      <section className="features-section">
        <div className="container-luxe">
          <div className="section-header">
            <span className="label-gold">L'EXPÉRIENCE</span>
            <h2>🌟 Ce qui rend votre livre unique</h2>
            <p className="section-subtitle">Un moteur de mise en page automatique pour un résultat professionnel</p>
          </div>

          <div className="features-grid">
            {features.map((feature, index) => (
              <div key={index} className="feature-card">
                <div className="feature-icon">{feature.icon}</div>
                <h3>{feature.title}</h3>
                <p>{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Témoignages */}
      <section className="testimonials-section">
        <div className="container-luxe">
          <div className="section-header">
            <span className="label-gold">ILS NOUS ONT FAIT CONFIANCE</span>
            <h2>💬 Ils l'ont fait, ils racontent</h2>
            <p className="section-subtitle">Des milliers de personnes ont déjà créé leur livre</p>
          </div>

          <div className="testimonials-grid">
            {testimonials.map((testimonial, index) => (
              <div key={index} className="testimonial-card">
                <div className="testimonial-quote">"</div>
                <p className="testimonial-text">"{testimonial.text}"</p>
                <div className="testimonial-author">
                  <img src={testimonial.image} alt={testimonial.name} className="testimonial-image" />
                  <div className="testimonial-info">
                    <strong>{testimonial.name}</strong>
                    <span>{testimonial.role}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Questions fréquentes */}
      <section className="faq-section">
        <div className="container-luxe">
          <div className="section-header">
            <span className="label-gold">QUESTIONS FRÉQUENTES</span>
            <h2>❓ FAQ</h2>
            <p className="section-subtitle">Tout ce que vous devez savoir</p>
          </div>

          <div className="faq-grid">
            {faqs.map((faq, index) => (
              <div key={index} className="faq-item">
                <h4 className="faq-question">{faq.question}</h4>
                <p className="faq-answer">{faq.answer}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Appel à l'action */}
      <section className="how-cta">
        <div className="container-luxe">
          <h2>Prêt à créer des souvenirs inoubliables ?</h2>
          <p className="cta-description">Rejoignez les 1500+ personnes qui ont déjà créé leur livre</p>
          <Link to="/create-book" className="cta-button">
            <button className="btn btn-primary" style={{ padding: '16px 48px' }}>
              ✨ Créer mon livre gratuitement
            </button>
          </Link>
          <p className="cta-note">
            Sans engagement, vous ne payez qu'à la commande
          </p>
        </div>
      </section>
    </div>
  );
};

export default HowItWorksLuxe;
