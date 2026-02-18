import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';

const OrderConfirmation = () => {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchOrder();
  }, [orderId]);

  const fetchOrder = async () => {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('*, project:projects(*)')
        .eq('id', orderId)
        .single();

      if (error) throw error;
      setOrder(data);
    } catch (error) {
      console.error('Erreur:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="loading">Chargement...</div>;
  if (!order) return <div className="error">Commande non trouvée</div>;

  return (
    <div className="order-confirmation">
      <div className="confirmation-card">
        <div className="success-icon">✓</div>
        <h1>Commande confirmée !</h1>
        <p className="confirmation-message">
          Merci pour votre commande. Votre livre est en cours de préparation.
        </p>

        <div className="order-details">
          <h2>Détails de la commande</h2>
          <p><strong>Numéro de commande :</strong> {order.id}</p>
          <p><strong>Projet :</strong> {order.project?.name}</p>
          <p><strong>Montant :</strong> {order.amount} €</p>
          <p><strong>Date :</strong> {new Date(order.created_at).toLocaleDateString('fr-FR')}</p>
          <p><strong>Statut :</strong> {order.status}</p>
        </div>

        <div className="whats-next">
          <h2>Prochaines étapes</h2>
          <ul>
            <li>📦 Votre livre sera imprimé dans les 48h</li>
            <li>🚚 Livraison sous 5-7 jours ouvrés</li>
            <li>📧 Vous recevrez un email de confirmation d'expédition</li>
          </ul>
        </div>

        <div className="confirmation-actions">
          <button 
            onClick={() => navigate('/dashboard')}
            className="btn-primary"
          >
            Retour au tableau de bord
          </button>
          <button 
            onClick={() => window.print()}
            className="btn-secondary"
          >
            Imprimer la confirmation
          </button>
        </div>
      </div>
    </div>
  );
};

export default OrderConfirmation;