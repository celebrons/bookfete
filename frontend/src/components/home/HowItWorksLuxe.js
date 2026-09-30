// C:\Users\USER\bookfete\frontend\src\components\home\HowItWorksLuxe.js
import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import '../../styles/luxe-theme.css';
import './HowItWorksLuxe.css';

const HowItWorksLuxe = () => {
  const { t } = useTranslation('home');
  const steps = [
    {
      number: '1️⃣',
      title: t('howItWorks.timeline.step1.title'),
      description: t('howItWorks.timeline.step1.description'),
      time: t('howItWorks.timeline.step1.time'),
      highlight: t('howItWorks.timeline.step1.highlight')
    },
    {
      number: '2️⃣',
      title: t('howItWorks.timeline.step2.title'),
      description: t('howItWorks.timeline.step2.description'),
      time: t('howItWorks.timeline.step2.time'),
      highlight: t('howItWorks.timeline.step2.highlight')
    },
    {
      number: '3️⃣',
      title: t('howItWorks.timeline.step3.title'),
      description: t('howItWorks.timeline.step3.description'),
      time: t('howItWorks.timeline.step3.time'),
      highlight: t('howItWorks.timeline.step3.highlight')
    },
    {
      number: '4️⃣',
      title: t('howItWorks.timeline.step4.title'),
      description: t('howItWorks.timeline.step4.description'),
      time: t('howItWorks.timeline.step4.time'),
      highlight: t('howItWorks.timeline.step4.highlight')
    }
  ];

  const features = [
    {
      icon: '👥',
      title: t('howItWorks.features.collective.title'),
      description: t('howItWorks.features.collective.description')
    },
    {
      icon: '📸',
      title: t('howItWorks.features.photos.title'),
      description: t('howItWorks.features.photos.description')
    },
    {
      icon: '✨',
      title: t('howItWorks.features.formats.title'),
      description: t('howItWorks.features.formats.description')
    },
    {
      icon: '🖊️',
      title: t('howItWorks.features.author.title'),
      description: t('howItWorks.features.author.description')
    },
    {
      icon: '👁️',
      title: t('howItWorks.features.preview.title'),
      description: t('howItWorks.features.preview.description')
    },
    {
      icon: '📄',
      title: t('howItWorks.features.formats2.title'),
      description: t('howItWorks.features.formats2.description')
    }
  ];

  const faqs = [
    {
      question: t('howItWorks.faq.delivery.question'),
      answer: t('howItWorks.faq.delivery.answer')
    },
    {
      question: t('howItWorks.faq.photos.question'),
      answer: t('howItWorks.faq.photos.answer')
    },
    {
      question: t('howItWorks.faq.collective.question'),
      answer: t('howItWorks.faq.collective.answer')
    },
    {
      question: t('howItWorks.faq.author.question'),
      answer: t('howItWorks.faq.author.answer')
    },
    {
      question: t('howItWorks.faq.payment.question'),
      answer: t('howItWorks.faq.payment.answer')
    },
    {
      question: t('howItWorks.faq.editing.question'),
      answer: t('howItWorks.faq.editing.answer')
    },
    {
      question: t('howItWorks.faq.withdrawal.question'),
      answer: t('howItWorks.faq.withdrawal.answer')
    },
    {
      question: t('howItWorks.faq.blurryPhoto.question'),
      answer: t('howItWorks.faq.blurryPhoto.answer')
    }
  ];

  return (
    <div className="how-it-works-page">
      {/* Hero section */}
      <section className="how-hero">
        <div className="container-luxe">
          <span className="label-gold">{t('howItWorks.hero.eyebrow')}</span>
          <h1>{t('howItWorks.hero.title')}</h1>
          <p className="hero-description">
            {t('howItWorks.hero.description')}
          </p>
        </div>
      </section>

      {/* Timeline des étapes */}
      <section className="timeline-section">
        <div className="container-luxe">
          <div className="section-header">
            <span className="label-gold">{t('howItWorks.timeline.eyebrow')}</span>
            <h2>{t('howItWorks.timeline.title')}</h2>
            <p className="section-subtitle">{t('howItWorks.timeline.subtitle')}</p>
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
            <span className="label-gold">{t('howItWorks.features.eyebrow')}</span>
            <h2>{t('howItWorks.features.title')}</h2>
            <p className="section-subtitle">{t('howItWorks.features.subtitle')}</p>
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
          <span className="label-gold">{t('howItWorks.testimonials.eyebrow')}</span>
          <h2>{t('howItWorks.testimonials.title')}</h2>
          <p className="section-subtitle">
            {t('howItWorks.testimonials.text')}
          </p>
          <Link to="/exemples" className="btn btn-outline">{t('howItWorks.testimonials.cta')}</Link>
        </div>
      </section>

      {/* Questions fréquentes */}
      <section className="faq-section" id="faq">
        <div className="container-luxe">
          <div className="section-header">
            <span className="label-gold">{t('howItWorks.faq.eyebrow')}</span>
            <h2>{t('howItWorks.faq.title')}</h2>
            <p className="section-subtitle">{t('howItWorks.faq.subtitle')}</p>
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
          <h2>{t('howItWorks.cta.title')}</h2>
          <Link to="/create-book" className="cta-button">
            <button className="btn btn-primary" style={{ padding: '16px 48px' }}>
              {t('howItWorks.cta.button')}
            </button>
          </Link>
          <p className="cta-note">
            {t('howItWorks.cta.note')}
          </p>
        </div>
      </section>
    </div>
  );
};

export default HowItWorksLuxe;
