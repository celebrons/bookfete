// C:\Users\USER\bookfete\frontend\src\components\home\HowItWorksLuxe.js
import React from 'react';
import { Link } from 'react-router-dom';
import '../../styles/luxe-theme.css';
import './HowItWorksLuxe.css';

const HowItWorksLuxe = () => {
  const steps = [
    {
      number: '1️⃣',
      title: 'Créez votre projet, seul ou à plusieurs',
      description: 'Choisissez votre occasion (anniversaire, mariage, départ...), donnez un titre à votre livre, et décidez si vous le composez seul ou en mode collectif.',
      time: '1 minute',
      highlight: 'Aucune inscription requise pour commencer'
    },
    {
      number: '2️⃣',
      title: 'Réunissez vos souvenirs',
      description: 'Importez vos photos et écrivez vos textes directement dans l\'atelier. En mode collectif, invitez vos proches par un lien individuel : chacun ajoute ses souvenirs, sans créer de compte.',
      time: '10 minutes',
      highlight: 'Vous gardez la main sur chaque mot et chaque image'
    },
    {
      number: '3️⃣',
      title: 'Composez votre livre',
      description: 'Choisissez une mise en page pour chaque page dans l\'atelier, ou laissez la composition automatique s\'en charger. L\'aperçu se met à jour en direct, à l\'identique du rendu final.',
      time: '10 minutes',
      highlight: 'Mise en page automatique ou manuelle, sans IA'
    },
    {
      number: '4️⃣',
      title: 'Choisissez le format et commandez',
      description: 'Comparez les 3 formats (Livret, Standard, Luxe) avec un aperçu réel et le prix affiché en direct, validez votre commande, et recevez votre livre chez vous (délai indicatif de 1 à 2 semaines selon la charge de production).',
      time: '5 minutes',
      highlight: 'Prix affiché immédiatement, sans surprise'
    }
  ];

  const features = [
    {
      icon: '👥',
      title: 'Créez à plusieurs',
      description: 'Invitez vos proches par un lien individuel : chacun ajoute ses photos et ses souvenirs sans créer de compte, et vous suivez qui a contribué.'
    },
    {
      icon: '📸',
      title: 'Photos de qualité',
      description: 'Importez vos photos, elles sont optimisées pour l\'impression et placées harmonieusement dans le livre.'
    },
    {
      icon: '✨',
      title: 'Trois formats, une vraie identité chacun',
      description: 'Livret, Standard ou Luxe : chaque format a sa propre taille, son papier et sa mise en page, du plus simple au plus premium — pas juste une même page redimensionnée.'
    },
    {
      icon: '🖊️',
      title: 'Vous restez l\'auteur',
      description: 'Aucun texte n\'est généré à votre place : que vous écriviez seul ou que vos proches contribuent, c\'est toujours vous qui écrivez.'
    },
    {
      icon: '👁️',
      title: 'Aperçu en direct',
      description: 'Visualisez votre livre au fil de la composition, à l\'échelle réelle, et ajustez la mise en page ou le format avant de commander.'
    },
    {
      icon: '📄',
      title: 'Impression ou version PDF',
      description: 'Au moment de la commande, choisissez de recevoir votre livre imprimé, en PDF numérique, ou les deux.'
    }
  ];

  const faqs = [
    {
      question: "📦 Combien de temps pour recevoir le livre ?",
      answer: "Comptez généralement 1 à 2 semaines entre la commande et la réception (fabrication puis expédition). Ce délai est donné à titre indicatif, pas contractuel : il dépend de la charge de production du moment. Le suivi de fabrication et d'expédition est visible à tout moment depuis votre espace de commande."
    },
    {
      question: "📸 Peut-on ajouter des photos ?",
      answer: "Oui, vous pouvez importer autant de photos que vous le souhaitez. Elles sont optimisées automatiquement pour une qualité d'impression parfaite."
    },
    {
      question: "👥 Comment mes proches peuvent-ils contribuer ?",
      answer: "Activez le mode collectif : un lien personnel est généré pour chacun de vos proches, à partager vous-même comme vous le souhaitez (message, e-mail, SMS...). Avec ce lien, chacun ajoute ses photos et ses souvenirs sans créer de compte. Vous suivez qui a contribué, relancez les retardataires, et pouvez fixer une date limite de participation."
    },
    {
      question: "🖊️ Qui écrit les textes du livre ?",
      answer: "Vous — et vos proches s'ils contribuent. Aucun contenu n'est généré automatiquement : le moteur se charge uniquement de la mise en page de ce que vous écrivez."
    },
    {
      question: "💳 Comment fonctionne le paiement ?",
      answer: "Vous payez en ligne par carte bancaire (paiement sécurisé Stripe). Le livre n'est imprimé qu'après validation de votre commande."
    },
    {
      question: "📝 Peut-on modifier après validation ?",
      answer: "Oui, librement, tant que la commande n'est pas payée : photos, textes, mise en page et format restent modifiables à tout moment. Une fois la commande payée, le livre est verrouillé — c'est ce qui garantit que la version imprimée correspond exactement à celle que vous avez validée."
    },
    {
      question: "↩️ Puis-je me rétracter après ma commande ?",
      answer: "Non : votre livre étant composé à partir de vos propres photos et textes, il s'agit d'un bien personnalisé, exclu du droit de rétractation de 14 jours (article L221-28 du Code de la consommation). Vous en êtes informé et vous l'acceptez explicitement avant de payer, au moment de valider votre commande."
    },
    {
      question: "📷 Une de mes photos apparaît floue, que faire ?",
      answer: "Avant de commander, un écran récapitulatif vous signale automatiquement toute photo dont la résolution est trop faible pour une impression nette au format choisi. Vous pouvez alors la remplacer par une version plus grande, changer sa mise en page, ou choisir de commander tel quel en connaissance de cause."
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
            Créez un livre unique en 4 étapes simples, seul ou à plusieurs, sans aucune compétence technique. Vos photos, vos textes, votre format.
          </p>
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

      {/* Pas de temoignages fabriques : voir ExemplesLuxe.js, meme principe
          (retour utilisateur — "des livres reels valent mieux que n'importe
          quel argumentaire"). Renvoie vers /exemples plutot que de dupliquer
          un contenu honnete a deux endroits. */}
      <section className="testimonials-section">
        <div className="container-luxe testimonials-honest">
          <span className="label-gold">DE VRAIS LIVRES, BIENTÔT</span>
          <h2>💬 Vous serez parmi les premiers</h2>
          <p className="section-subtitle">
            Célébrons vient de démarrer : nous préférons vous montrer de vrais livres et de vrais
            retours plutôt que d'inventer des chiffres ou des témoignages. La meilleure façon de
            juger, en attendant, reste de composer le vôtre — l'aperçu est à l'échelle réelle dès
            le début.
          </p>
          <Link to="/exemples" className="btn btn-outline">Voir la page Exemples</Link>
        </div>
      </section>

      {/* Questions fréquentes */}
      <section className="faq-section" id="faq">
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
