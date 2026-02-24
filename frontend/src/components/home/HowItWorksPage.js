// C:\Users\USER\bookfete\frontend\src\components\home\HowItWorksPage.js
import React from 'react';
import { Link } from 'react-router-dom';
import './HowItWorksPage.css';

const HowItWorksPage = () => {
  const steps = [
    {
      number: '1️⃣',
      title: 'Créez votre projet',
      description: 'Choisissez votre événement (anniversaire, mariage, départ...), personnalisez la couverture et sélectionnez vos options (finition, papier, style).',
      time: '5 minutes',
      highlight: 'L\'IA génère automatiquement les chapitres et questions'
    },
    {
      number: '2️⃣',
      title: 'Invitez vos proches',
      description: 'Ajoutez les emails de vos contributeurs en quelques clics. Chaque personne reçoit une invitation personnalisée avec un lien unique.',
      time: '3 minutes',
      highlight: 'Gérez les invitations par chapitre'
    },
    {
      number: '3️⃣',
      title: 'Collectez les témoignages',
      description: 'Les contributeurs arrivent sur une page élégante avec des questions guides générées par l\'IA. Ils peuvent écrire leur message et ajouter jusqu\'à 2 photos.',
      time: '2 semaines (selon vos proches)',
      highlight: 'Sauvegarde automatique des brouillons'
    },
    {
      number: '4️⃣',
      title: 'Générez et commandez',
      description: 'L\'IA assemble toutes les contributions dans une mise en page luxueuse. Validez, commandez et recevez votre livre chez vous en 2 semaines.',
      time: '5 minutes',
      highlight: 'Qualité d\'impression professionnelle'
    }
  ];

  const features = [
    {
      icon: '🎯',
      title: 'Questions personnalisées',
      description: 'L\'IA génère 4 questions uniques par chapitre, adaptées à votre événement et au style choisi (intime, poétique ou factuel).'
    },
    {
      icon: '📸',
      title: 'Photos de qualité',
      description: 'Jusqu\'à 2 photos par contribution, optimisées pour l\'impression. Chaque image est placée harmonieusement dans le livre.'
    },
    {
      icon: '✨',
      title: 'Mise en page luxueuse',
      description: 'Typographie élégante, marges généreuses, papiers premium. Votre livre a l\'allure d\'un véritable ouvrage d\'éditeur.'
    },
    {
      icon: '🤖',
      title: 'IA invisible',
      description: 'L\'IA travaille en coulisses pour harmoniser les styles, corriger l\'orthographe et suggérer des améliorations sans jamais s\'imposer.'
    },
    {
      icon: '⏱️',
      title: 'Sauvegarde automatique',
      description: 'Les contributeurs peuvent sauvegarder leur brouillon et revenir plus tard. Plus jamais de messages perdus !'
    },
    {
      icon: '📊',
      title: 'Suivi en temps réel',
      description: 'Dans votre tableau de bord, voyez qui a répondu, relancez en un clic, et modérez les contributions facilement.'
    }
  ];

  const testimonials = [
    {
      text: "J'ai créé un livre pour les 60 ans de mon mari en seulement 20 minutes. Nos amis ont adoré contribuer, et le résultat est magnifique !",
      name: "Sophie",
      role: "Les 60 ans de Gégé",
      image: "https://images.unsplash.com/photo-1494790108777-296ef5a2ec48?w=100&h=100&fit=crop"
    },
    {
      text: "Pour le départ de notre collègue, on a rassemblé 25 témoignages. L'IA a fait un travail incroyable pour tout organiser. Le livre est splendide !",
      name: "Thomas",
      role: "Pot de départ",
      image: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop"
    },
    {
      text: "Notre livre de mariage est unique. Tous nos invités ont participé, et les photos sont magnifiques. Merci pour cette pépite !",
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
      answer: "Oui, chaque contributeur peut ajouter jusqu'à 2 photos. Elles sont optimisées automatiquement pour une qualité d'impression parfaite."
    },
    {
      question: "🤖 L'IA écrit-elle à ma place ?",
      answer: "Non, l'IA guide et suggère, mais ce sont vos proches qui écrivent. Elle s'assure juste que l'ensemble soit harmonieux."
    },
    {
      question: "💳 Comment fonctionne le paiement ?",
      answer: "Vous payez en ligne par carte bancaire (paiement sécurisé Stripe). Le livre n'est imprimé qu'après validation de votre commande."
    },
    {
      question: "📝 Peut-on modifier après validation ?",
      answer: "Oui, chaque contribution peut être sauvegardée en brouillon. La validation est définitive uniquement quand vous le décidez."
    },
    {
      question: "🎁 Y a-t-il une version coffret ?",
      answer: "Bientôt ! Nous travaillons sur des éditions encore plus luxueuses avec coffret et jaquette personnalisée."
    }
  ];

  return (
   
      <div className="how-it-works-page">
        {/* Hero section */}
        <section className="hero">
          <div className="container">
            <h1>✨ Comment ça marche ?</h1>
            <p>Créez un livre unique en 4 étapes simples, sans aucune compétence technique. L'IA s'occupe de tout !</p>
            
            <div className="hero-stats">
              <div className="hero-stat">
                <span className="number">1500+</span>
                <span className="label">Livres créés</span>
              </div>
              <div className="hero-stat">
                <span className="number">45 min</span>
                <span className="label">Temps actif</span>
              </div>
              <div className="hero-stat">
                <span className="number">24h</span>
                <span className="label">Premières contributions</span>
              </div>
            </div>
          </div>
        </section>

        {/* Timeline des étapes */}
        <section className="container">
          <div className="section-title">
            <h2>📋 En 4 étapes, votre livre prend vie</h2>
            <p>De l'idée à la réalisation, suivez le guide</p>
          </div>

          <div className="timeline">
            {steps.map((step, index) => (
              <div key={index} className="timeline-item">
                <div className="timeline-badge">{step.number}</div>
                <div className="timeline-content">
                  <h3>{step.title}</h3>
                  <p>{step.description}</p>
                  <p><small>⏱️ {step.time}</small></p>
                  <span className="time">{step.highlight}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Ce qui rend le livre unique */}
        <section className="container">
          <div className="section-title">
            <h2>🌟 Ce qui rend votre livre unique</h2>
            <p>L'IA guide chaque étape pour un résultat professionnel</p>
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
        </section>

        {/* Témoignages */}
        <section className="testimonials">
          <div className="container">
            <div className="section-title">
              <h2>💬 Ils l'ont fait, ils racontent</h2>
              <p>Des milliers de personnes ont déjà créé leur livre</p>
            </div>

            <div className="testimonial-grid">
              {testimonials.map((testimonial, index) => (
                <div key={index} className="testimonial-card">
                  <p>"{testimonial.text}"</p>
                  <div className="testimonial-author">
                    <img src={testimonial.image} alt={testimonial.name} />
                    <div>
                      <h4>{testimonial.name}</h4>
                      <p>{testimonial.role}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Questions fréquentes */}
        <section className="container">
          <div className="section-title">
            <h2>❓ Questions fréquentes</h2>
            <p>Tout ce que vous devez savoir</p>
          </div>

          <div className="faq-grid">
            {faqs.map((faq, index) => (
              <div key={index} className="faq-item">
                <h4>{faq.question}</h4>
                <p>{faq.answer}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Appel à l'action */}
        <section className="container">
          <div className="cta">
            <h2>Prêt à créer des souvenirs inoubliables ?</h2>
            <p>Rejoignez les 1500+ personnes qui ont déjà créé leur livre</p>
            <Link to="/create-book" className="cta-button">
              ✨ Créer mon livre gratuitement
              <span>→</span>
            </Link>
            <p style={{ marginTop: '2rem', fontSize: '0.9rem', opacity: 0.8 }}>
              Sans engagement, vous ne payez qu'à la commande
            </p>
          </div>
        </section>
      </div>
    
  );
};

export default HowItWorksPage;