// C:\Users\USER\bookfete\frontend\src\components\book\TestPage.js
import React from 'react';
import '../../styles/luxe-theme.css';
import './BookLuxe.css';

const TestPage = () => {
  // Liste de toutes les variables à tester
  const variables = [
    { name: '--gold', color: 'var(--gold)' },
    { name: '--gold-light', color: 'var(--gold-light)' },
    { name: '--silk', color: 'var(--silk)' },
    { name: '--ink', color: 'var(--ink)' },
    { name: '--white', color: 'var(--white)' },
    { name: '--mist', color: 'var(--mist)' },
    { name: '--text-light', color: 'var(--text-light)' },
  ];

  // Classes à tester
  const classes = [
    'book-container',
    'book-header',
    'book-header-content',
    'book-title',
    'book-meta',
    'dashboard-link',
    'tabs-container',
    'tabs',
    'tab',
    'tab active',
    'main-content',
    'card',
    'btn-primary',
    'btn-outline',
    'label-gold'
  ];

  return (
    <div style={{ padding: '20px', fontFamily: 'Inter, sans-serif' }}>
      <h1 style={{ color: 'var(--gold)', borderBottom: '2px solid var(--gold)', paddingBottom: '10px' }}>
        🧪 PAGE DE TEST LUXE
      </h1>

      {/* TEST 1 : Variables CSS */}
      <section style={{ marginBottom: '40px' }}>
        <h2 style={{ color: 'var(--ink)' }}>1. Variables CSS</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' }}>
          {variables.map((v, i) => (
            <div key={i} style={{
              background: v.color,
              padding: '20px',
              border: '1px solid var(--mist)',
              borderRadius: 'var(--radius)',
              color: v.name === '--white' ? 'var(--ink)' : 'white',
              boxShadow: 'var(--shadow-luxe)'
            }}>
              <strong>{v.name}</strong>
              <br />
              <span style={{ fontSize: '12px' }}>{v.color}</span>
            </div>
          ))}
        </div>
        <p style={{ marginTop: '10px', color: 'var(--text-light)' }}>
          ⚠️ Si tu vois du blanc/gris au lieu des couleurs, les variables ne sont pas chargées.
        </p>
      </section>

      {/* TEST 2 : Espacements */}
      <section style={{ marginBottom: '40px' }}>
        <h2 style={{ color: 'var(--ink)' }}>2. Espacements (variables)</h2>
        <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
          <div style={{ width: 'var(--space-xs)', height: '50px', background: 'var(--gold)' }} />
          <span>--space-xs (8px)</span>
          <div style={{ width: 'var(--space-sm)', height: '50px', background: 'var(--gold)' }} />
          <span>--space-sm (16px)</span>
          <div style={{ width: 'var(--space-md)', height: '50px', background: 'var(--gold)' }} />
          <span>--space-md (24px)</span>
          <div style={{ width: 'var(--space-lg)', height: '50px', background: 'var(--gold)' }} />
          <span>--space-lg (40px)</span>
        </div>
      </section>

      {/* TEST 3 : Classes principales */}
      <section style={{ marginBottom: '40px' }}>
        <h2 style={{ color: 'var(--ink)' }}>3. Classes CSS</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '20px' }}>
          {classes.map((cls, i) => (
            <div key={i} className={cls} style={{ 
              padding: '20px', 
              border: '1px solid var(--mist)',
              borderRadius: 'var(--radius)',
              background: cls.includes('active') ? 'var(--gold-light)' : 'white'
            }}>
              <strong className="label-gold">.{cls}</strong>
              <p>Ce bloc utilise la classe <code>{cls}</code></p>
            </div>
          ))}
        </div>
      </section>

      {/* TEST 4 : Boutons */}
      <section style={{ marginBottom: '40px' }}>
        <h2 style={{ color: 'var(--ink)' }}>4. Boutons</h2>
        <div style={{ display: 'flex', gap: '20px' }}>
          <button className="btn btn-primary">Bouton Primaire</button>
          <button className="btn btn-outline">Bouton Outline</button>
          <button className="btn btn-secondary">Bouton Secondaire</button>
        </div>
      </section>

      {/* TEST 5 : Carte complète */}
      <section>
        <h2 style={{ color: 'var(--ink)' }}>5. Exemple de carte</h2>
        <div className="card" style={{ maxWidth: '400px' }}>
          <span className="label-gold">LABEL TEST</span>
          <h3 style={{ margin: '10px 0' }}>Titre de la carte</h3>
          <p className="body-text">Ceci est un exemple de texte avec la classe body-text pour vérifier la typographie.</p>
          <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
            <button className="btn btn-primary">Valider</button>
            <button className="btn btn-outline">Annuler</button>
          </div>
        </div>
      </section>
    </div>
  );
};

export default TestPage;