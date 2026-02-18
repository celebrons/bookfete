import React, { useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';

const OrderPayment = () => {
  const { projectId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { orderId, total, options } = location.state || {};
  
  const [loading, setLoading] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('card');
  const [cardInfo, setCardInfo] = useState({
    number: '',
    expiry: '',
    cvc: '',
    name: ''
  });

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setCardInfo(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Simulation de paiement - à remplacer par Stripe
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Mettre à jour la commande
      const { error } = await supabase
        .from('orders')
        .update({ 
          status: 'paid',
          amount: total,
          payment_date: new Date().toISOString()
        })
        .eq('id', orderId);

      if (error) throw error;

      // Mettre à jour le statut du projet
      await supabase
        .from('projects')
        .update({ status: 'completed' })
        .eq('id', projectId);

      navigate(`/order-confirmation/${orderId}`);
    } catch (error) {
      console.error('Erreur paiement:', error);
      alert('Erreur lors du paiement');
    } finally {
      setLoading(false);
    }
  };

  if (!orderId || !total) {
    return <div>Erreur : informations de commande manquantes</div>;
  }

  return (
    <div className="payment-container">
      <h1>Finaliser votre commande</h1>

      <div className="payment-content">
        <div className="payment-form-section">
          <h2>Moyen de paiement</h2>
          
          <div className="payment-methods">
            <label className={`payment-method ${paymentMethod === 'card' ? 'selected' : ''}`}>
              <input
                type="radio"
                name="paymentMethod"
                value="card"
                checked={paymentMethod === 'card'}
                onChange={(e) => setPaymentMethod(e.target.value)}
              />
              <span>Carte bancaire</span>
            </label>
            <label className={`payment-method ${paymentMethod === 'paypal' ? 'selected' : ''}`}>
              <input
                type="radio"
                name="paymentMethod"
                value="paypal"
                checked={paymentMethod === 'paypal'}
                onChange={(e) => setPaymentMethod(e.target.value)}
              />
              <span>PayPal</span>
            </label>
          </div>

          {paymentMethod === 'card' && (
            <form onSubmit={handleSubmit} className="card-form">
              <div className="form-group">
                <label>Nom sur la carte</label>
                <input
                  type="text"
                  name="name"
                  value={cardInfo.name}
                  onChange={handleInputChange}
                  required
                  placeholder="JEAN DUPONT"
                />
              </div>

              <div className="form-group">
                <label>Numéro de carte</label>
                <input
                  type="text"
                  name="number"
                  value={cardInfo.number}
                  onChange={handleInputChange}
                  required
                  placeholder="1234 5678 9012 3456"
                  maxLength="19"
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Date d'expiration</label>
                  <input
                    type="text"
                    name="expiry"
                    value={cardInfo.expiry}
                    onChange={handleInputChange}
                    required
                    placeholder="MM/AA"
                    maxLength="5"
                  />
                </div>

                <div className="form-group">
                  <label>CVC</label>
                  <input
                    type="text"
                    name="cvc"
                    value={cardInfo.cvc}
                    onChange={handleInputChange}
                    required
                    placeholder="123"
                    maxLength="3"
                  />
                </div>
              </div>

              <button 
                type="submit" 
                disabled={loading}
                className="btn-primary btn-large btn-block"
              >
                {loading ? 'Paiement en cours...' : `Payer ${total} €`}
              </button>
            </form>
          )}

          {paymentMethod === 'paypal' && (
            <div className="paypal-info">
              <p>Redirection vers PayPal...</p>
              <button className="btn-paypal">Payer avec PayPal</button>
            </div>
          )}
        </div>

        <div className="order-summary-sidebar">
          <h2>Récapitulatif</h2>
          <div className="summary-details">
            <p>Maquette : {options?.template}</p>
            <p>Format : {options?.format}</p>
            <p>Papier : {options?.paperType}</p>
            <p>Reliure : {options?.binding}</p>
            <hr />
            <p className="total">Total : {total} €</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OrderPayment;