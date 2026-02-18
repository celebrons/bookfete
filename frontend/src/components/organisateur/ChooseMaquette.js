import React, { useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';

const ChooseMaquette = () => {
  const { projectId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { pdfPreviewUrl, orderId } = location.state || {};
  
  const [selectedTemplate, setSelectedTemplate] = useState('classic');
  const [format, setFormat] = useState('square');
  const [paperType, setPaperType] = useState('mat');
  const [binding, setBinding] = useState('hardcover');
  const [loading, setLoading] = useState(false);

  const templates = [
    { id: 'classic', name: 'Classique', description: 'Mise en page élégante et intemporelle', preview: '/templates/classic.jpg' },
    { id: 'modern', name: 'Moderne', description: 'Design contemporain avec touches de couleur', preview: '/templates/modern.jpg' },
    { id: 'vintage', name: 'Vintage', description: 'Style rétro avec filtres chauds', preview: '/templates/vintage.jpg' },
    { id: 'minimalist', name: 'Minimaliste', description: 'Sobre et épuré', preview: '/templates/minimalist.jpg' },
    { id: 'colorful', name: 'Coloré', description: 'Vif et dynamique', preview: '/templates/colorful.jpg' }
  ];

  const formats = [
    { id: 'square', name: 'Carré', dimensions: '21 x 21 cm', price: 29.90 },
    { id: 'portrait', name: 'Portrait', dimensions: '21 x 27 cm', price: 34.90 },
    { id: 'landscape', name: 'Paysage', dimensions: '27 x 21 cm', price: 34.90 }
  ];

  const paperTypes = [
    { id: 'mat', name: 'Mat', description: 'Sans reflet, aspect naturel', price: 0 },
    { id: 'brillant', name: 'Brillant', description: 'Couleurs éclatantes', price: 4.90 },
    { id: 'photo', name: 'Photo premium', description: 'Qualité professionnelle', price: 9.90 }
  ];

  const bindings = [
    { id: 'hardcover', name: 'Relié cartonné', description: 'Couverture rigide, durable', price: 0 },
    { id: 'softcover', name: 'Broché', description: 'Couverture souple, léger', price: -5 },
	{ id: 'spiral', name: 'Spirale', description: "S'ouvre à plat", price: 2.90 }  ];

  const calculateTotal = () => {
    const formatPrice = formats.find(f => f.id === format)?.price || 0;
    const paperPrice = paperTypes.find(p => p.id === paperType)?.price || 0;
    const bindingPrice = bindings.find(b => b.id === binding)?.price || 0;
    return (29.90 + formatPrice + paperPrice + bindingPrice).toFixed(2);
  };

  const handleProceedToPayment = async () => {
    setLoading(true);
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      
      const response = await fetch(`${process.env.REACT_APP_API_URL}/orders/select`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          orderId,
          template: selectedTemplate,
          options: {
            format,
            paperType,
            binding
          }
        })
      });

      if (!response.ok) throw new Error('Erreur lors de la sélection');

      navigate(`/project/${projectId}/payment`, { 
        state: { 
          orderId,
          total: calculateTotal(),
          options: { format, paperType, binding, template: selectedTemplate }
        }
      });
    } catch (error) {
      console.error('Erreur:', error);
      alert('Erreur lors de la validation');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="choose-maquette">
      <h1>Personnalisez votre livre</h1>

      {pdfPreviewUrl && (
        <div className="pdf-preview">
          <h2>Aperçu du PDF généré</h2>
          <iframe src={pdfPreviewUrl} title="Aperçu du livre" className="pdf-iframe" />
        </div>
      )}

      <div className="customization-options">
        <div className="options-section">
          <h2>1. Choisissez une maquette</h2>
          <div className="templates-grid">
            {templates.map(template => (
              <div 
                key={template.id}
                className={`template-card ${selectedTemplate === template.id ? 'selected' : ''}`}
                onClick={() => setSelectedTemplate(template.id)}
              >
                <div className="template-preview">
                  {/* Image de prévisualisation */}
                  <div className="template-placeholder">{template.name}</div>
                </div>
                <h3>{template.name}</h3>
                <p>{template.description}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="options-section">
          <h2>2. Choisissez le format</h2>
          <div className="options-grid">
            {formats.map(f => (
              <label key={f.id} className={`option-card ${format === f.id ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="format"
                  value={f.id}
                  checked={format === f.id}
                  onChange={(e) => setFormat(e.target.value)}
                />
                <div className="option-content">
                  <h3>{f.name}</h3>
                  <p>{f.dimensions}</p>
                  <p className="price">+{f.price}€</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        <div className="options-section">
          <h2>3. Type de papier</h2>
          <div className="options-grid">
            {paperTypes.map(p => (
              <label key={p.id} className={`option-card ${paperType === p.id ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="paper"
                  value={p.id}
                  checked={paperType === p.id}
                  onChange={(e) => setPaperType(e.target.value)}
                />
                <div className="option-content">
                  <h3>{p.name}</h3>
                  <p>{p.description}</p>
                  <p className="price">{p.price > 0 ? `+${p.price}€` : 'Inclus'}</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        <div className="options-section">
          <h2>4. Reliure</h2>
          <div className="options-grid">
            {bindings.map(b => (
              <label key={b.id} className={`option-card ${binding === b.id ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="binding"
                  value={b.id}
                  checked={binding === b.id}
                  onChange={(e) => setBinding(e.target.value)}
                />
                <div className="option-content">
                  <h3>{b.name}</h3>
                  <p>{b.description}</p>
                  <p className="price">
                    {b.price > 0 ? `+${b.price}€` : b.price < 0 ? `${b.price}€` : 'Inclus'}
                  </p>
                </div>
              </label>
            ))}
          </div>
        </div>

        <div className="order-summary">
          <h2>Récapitulatif</h2>
          <div className="summary-details">
            <p>Format : {formats.find(f => f.id === format)?.name}</p>
            <p>Papier : {paperTypes.find(p => p.id === paperType)?.name}</p>
            <p>Reliure : {bindings.find(b => b.id === binding)?.name}</p>
            <p className="total">Total : {calculateTotal()} € TTC</p>
          </div>
        </div>

        <div className="options-actions">
          <button 
            onClick={() => navigate(`/project/${projectId}/review`)}
            className="btn-secondary"
          >
            Retour
          </button>
          <button 
            onClick={handleProceedToPayment}
            disabled={loading}
            className="btn-primary btn-large"
          >
            {loading ? 'Traitement...' : 'Procéder au paiement'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChooseMaquette;
