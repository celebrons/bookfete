// C:\Users\USER\bookfete\frontend\src\components\layout\Layout.js
import React from 'react';
// Avant: import Header from './Header';
import HeaderLuxe from './HeaderLuxe';  // ← Corrigé
import Footer from './Footer';
import FooterLuxe from './FooterLuxe';
import { useTheme } from '../../contexts/ThemeContext';
import './Layout.css';
import '../../styles/luxe-theme.css';

const Layout = ({ children }) => {
  const { useLuxeTheme } = useTheme();

  return (
    <div className="layout">
      {useLuxeTheme ? <HeaderLuxe /> : <HeaderLuxe />} {/* ← Les deux pareils */}
      <main className="main-content">
        {children}
      </main>
      {useLuxeTheme ? <FooterLuxe /> : <FooterLuxe />} {/* ← Les deux pareils */}
    </div>
  );
};

export default Layout;