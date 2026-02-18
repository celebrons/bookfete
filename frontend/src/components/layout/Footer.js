import React from 'react';
import { Link } from 'react-router-dom';
import './Layout.css';

const Footer = () => {
  return (
    <footer className="footer">
      <div className="footer-container">
        <div className="footer-section">
          <h3>Mémoire Collective</h3>
          <p>Créez des souvenirs inoubliables avec vos proches</p>
        </div>
        
        <div className="footer-section">
          <h4>Liens utiles</h4>
          <ul>
            <li><Link to="/about">À propos</Link></li>
            <li><Link to="/how-it-works">Comment ça marche</Link></li>
            <li><Link to="/pricing">Tarifs</Link></li>
            <li><Link to="/contact">Contact</Link></li>
          </ul>
        </div>
        
        <div className="footer-section">
          <h4>Légal</h4>
          <ul>
            <li><Link to="/terms">Conditions générales</Link></li>
            <li><Link to="/privacy">Politique de confidentialité</Link></li>
            <li><Link to="/cookies">Cookies</Link></li>
          </ul>
        </div>
        
        <div className="footer-section">
          <h4>Suivez-nous</h4>
          <div className="social-links">
            <a href="#" target="_blank" rel="noopener noreferrer">Facebook</a>
            <a href="#" target="_blank" rel="noopener noreferrer">Instagram</a>
            <a href="#" target="_blank" rel="noopener noreferrer">LinkedIn</a>
          </div>
        </div>
      </div>
      
      <div className="footer-bottom">
        <p>&copy; {new Date().getFullYear()} Mémoire Collective. Tous droits réservés.</p>
      </div>
    </footer>
  );
};

export default Footer;