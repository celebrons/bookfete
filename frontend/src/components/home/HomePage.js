// C:\Users\USER\bookfete\frontend\src\components\home\HomePage.js
import React from 'react';
import { useNavigate } from 'react-router-dom';
import HeroSection from './HeroSection';
import OffresSection from './OffresSection';
import TemoignagesSection from './TemoignagesSection';
import CTASection from './CTASection';
import Layout from '../layout/Layout';
import './Home.css';

const HomePage = () => {
  const navigate = useNavigate();

  return (
    <Layout>
      <HeroSection />
      <OffresSection />
      <TemoignagesSection />
      <CTASection />
    </Layout>
  );
};

export default HomePage;