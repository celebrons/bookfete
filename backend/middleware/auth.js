const supabase = require('../config/supabase');

const authenticate = async (req, res, next) => {
  try {
    console.log('🔐 Middleware auth appelé');
    
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      console.log('❌ Pas de token');
      return res.status(401).json({ error: 'Token manquant' });
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      console.log('❌ Format de token invalide');
      return res.status(401).json({ error: 'Format de token invalide' });
    }

    const token = parts[1];
    console.log('🔑 Token reçu, vérification...');

    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      console.log('❌ Token invalide:', error);
      return res.status(401).json({ error: 'Token invalide' });
    }

    console.log('✅ Utilisateur authentifié:', user.id);
    req.user = user;
    next();
  } catch (error) {
    console.error('❌ Erreur middleware:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

console.log('✅ Middleware auth chargé');
module.exports = authenticate;