// C:\Users\USER\bookfete\frontend\src\contexts\ThemeContext.js
import React, { createContext, useState, useContext } from 'react';

const ThemeContext = createContext();

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

export const ThemeProvider = ({ children }) => {
  const [useLuxeTheme, setUseLuxeTheme] = useState(true); // true pour le thème luxe par défaut

  return (
    <ThemeContext.Provider value={{ useLuxeTheme, setUseLuxeTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};