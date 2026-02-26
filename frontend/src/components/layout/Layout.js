// C:\Users\USER\bookfete\frontend\src\components\layout\Layout.js
import React from 'react';
import HeaderLuxe from './HeaderLuxe';
import FooterLuxe from './FooterLuxe';
import './Layout.css';
import '../../styles/luxe-theme.css';

const Layout = ({ children }) => {
  return (
    <div className="layout">
      <HeaderLuxe />
      <main className="main-content">
        {children}
      </main>
      <FooterLuxe />
    </div>
  );
};

export default Layout;