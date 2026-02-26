// C:\Users\USER\bookfete\frontend\src\components\layout\FooterLuxe.js
import React from 'react';
import { Link } from 'react-router-dom';
import '../../styles/luxe-theme.css';

const FooterLuxe = () => {
  return (
    <footer style={{
      backgroundColor: 'var(--silk)',
      padding: 'var(--space-xl) 0',
      marginTop: 'var(--space-xxl)',
      borderTop: 'var(--border-fine)'
    }}>
      <div className="container-luxe">
        <div style={{
          display: 'grid',
          gridTemplateColumns: '2fr 1fr 1fr 1fr',
          gap: 'var(--space-xl)'
        }}>
          {/* Colonne 1 - Marque */}
          <div>
            <span style={{
              fontSize: '20px',
              fontWeight: '700',
              color: 'var(--ink)',
              letterSpacing: '-0.02em',
              display: 'block',
              marginBottom: 'var(--space-md)'
            }}>
              Célébrons<span style={{ color: 'var(--gold)' }}>.</span>
            </span>
            <p className="body-text" style={{ color: 'var(--text-light)' }}>
              Créez des livres de souvenirs uniques, 
              collaboratifs et magnifiques pour vos 
              événements les plus précieux.
            </p>
            <div className="separator-gold" style={{ marginTop: 'var(--space-lg)' }} />
          </div>

          {/* Colonne 2 - Produit */}
          <div>
            <span className="label-gold">Produit</span>
            <ul style={{ listStyle: 'none', marginTop: 'var(--space-md)' }}>
              {['Comment ça marche', 'Tarifs', 'Exemples', 'FAQ'].map(item => (
                <li key={item} style={{ marginBottom: 'var(--space-sm)' }}>
                  <Link 
                    to={`/${item.toLowerCase().replace(' ', '-')}`}
                    style={{
                      textDecoration: 'none',
                      color: 'var(--ink)',
                      fontSize: '14px',
                      fontWeight: '400'
                    }}
                  >
                    {item}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Colonne 3 - Légal */}
          <div>
            <span className="label-gold">Légal</span>
            <ul style={{ listStyle: 'none', marginTop: 'var(--space-md)' }}>
              {['CGV', 'Confidentialité', 'Mentions légales'].map(item => (
                <li key={item} style={{ marginBottom: 'var(--space-sm)' }}>
                  <Link 
                    to={`/${item.toLowerCase().replace(' ', '-')}`}
                    style={{
                      textDecoration: 'none',
                      color: 'var(--ink)',
                      fontSize: '14px',
                      fontWeight: '400'
                    }}
                  >
                    {item}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Colonne 4 - Contact */}
          <div>
            <span className="label-gold">Contact</span>
            <ul style={{ listStyle: 'none', marginTop: 'var(--space-md)' }}>
              <li style={{ marginBottom: 'var(--space-sm)' }}>
                <a 
                  href="mailto:bonjour@celebrons.com"
                  style={{
                    textDecoration: 'none',
                    color: 'var(--ink)',
                    fontSize: '14px'
                  }}
                >
                  bonjour@celebrons.com
                </a>
              </li>
              <li>
                <span className="body-text" style={{ fontSize: '14px', color: 'var(--text-light)' }}>
                  Paris, France
                </span>
              </li>
            </ul>
          </div>
        </div>

        {/* Copyright */}
        <div className="separator" style={{ margin: 'var(--space-xl) 0 var(--space-md)' }} />
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <span className="body-text" style={{ fontSize: '12px', color: 'var(--text-light)' }}>
            © {new Date().getFullYear()} Célébrons. Tous droits réservés.
          </span>
          <div style={{ display: 'flex', gap: 'var(--space-md)' }}>
            {['Instagram', 'Pinterest'].map(social => (
              <a 
                key={social}
                href="#"
                style={{
                  textDecoration: 'none',
                  color: 'var(--text-light)',
                  fontSize: '12px'
                }}
              >
                {social}
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
};

export default FooterLuxe;