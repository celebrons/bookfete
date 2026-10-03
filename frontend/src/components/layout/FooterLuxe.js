// C:\Users\USER\bookfete\frontend\src\components\layout\FooterLuxe.js
import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import '../../styles/luxe-theme.css';
import './FooterLuxe.css';

// Styles sortis de l'inline vers FooterLuxe.css le 2026-09-14 : la grille
// etait figee a 4 colonnes et debordait de 195 px sur un telephone, sur
// toutes les pages du site. Le contenu et les liens sont inchanges.
//
// ROUTES EXPLICITES (2026-09-28) — remplace l'ancien generateur automatique
// `${label.toLowerCase().replace(' ', '-')}` : `.replace()` sans `/g` ne
// remplacait que le PREMIER espace, donc "Comment ça marche" produisait
// "/comment-ça marche" (espace brut restant, encode par le routeur) et
// aucune des 7 pages visees n'existait de toute facon — les 7 liens du pied
// de page menaient tous a une redirection silencieuse vers l'accueil (le
// catch-all de App.js fait `<Navigate to="/" />`, jamais un vrai 404).
// "Comment ça marche" et "FAQ" pointent vers la page /how-it-works deja
// existante (qui porte deja sa propre section FAQ, id="faq") plutot que de
// dupliquer son contenu dans une page a part.
const FooterLuxe = () => {
  const { t } = useTranslation();

  const PRODUIT = [
    { label: t('footer.howItWorks'), to: '/how-it-works' },
    { label: t('footer.pricing'), to: '/tarifs' },
    { label: t('footer.examples'), to: '/exemples' },
    { label: t('footer.faq'), to: '/how-it-works#faq' }
  ];
  const LEGAL = [
    { label: t('footer.cgv'), to: '/cgv' },
    { label: t('footer.privacy'), to: '/confidentialite' },
    { label: t('footer.legalNotice'), to: '/mentions-legales' }
  ];

  return (
    <footer className="site-footer">
      <div className="container-luxe">
        <div className="site-footer-grid">
          {/* Colonne 1 - Marque */}
          <div>
            <span className="site-footer-brand">
              Bookipix<span className="site-footer-brand-dot">.</span>
            </span>
            <p className="body-text" style={{ color: 'var(--text-light)' }}>
              {t('footer.tagline')}
            </p>
            <div className="separator-gold" style={{ marginTop: 'var(--space-lg)' }} />
          </div>

          {/* Colonne 2 - Produit */}
          <div>
            <span className="label-gold">{t('footer.product')}</span>
            <ul className="site-footer-list">
              {PRODUIT.map((item) => (
                <li key={item.to}>
                  <Link to={item.to} className="site-footer-link">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Colonne 3 - Légal */}
          <div>
            <span className="label-gold">{t('footer.legal')}</span>
            <ul className="site-footer-list">
              {LEGAL.map((item) => (
                <li key={item.to}>
                  <Link to={item.to} className="site-footer-link">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Colonne 4 - Contact */}
          <div>
            <span className="label-gold">{t('footer.contact')}</span>
            <ul className="site-footer-list">
              <li>
                <a href="mailto:bonjour@bookipix.com" className="site-footer-link">
                  bonjour@bookipix.com
                </a>
              </li>
              <li>
                <span className="body-text" style={{ fontSize: '14px', color: 'var(--text-light)' }}>
                  {t('footer.location')}
                </span>
              </li>
            </ul>
          </div>
        </div>

        {/* Copyright */}
        <div className="separator" style={{ margin: 'var(--space-xl) 0 var(--space-md)' }} />
        <div className="site-footer-bottom">
          <span className="body-text" style={{ fontSize: '12px', color: 'var(--text-light)' }}>
            {t('footer.copyright', { year: new Date().getFullYear() })}
          </span>
          <div className="site-footer-social">
            {['Instagram', 'Pinterest'].map((social) => (
              <a
                key={social}
                href="#"
                style={{ textDecoration: 'none', color: 'var(--text-light)', fontSize: '12px' }}
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
