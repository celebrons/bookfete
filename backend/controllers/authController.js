// backend/controllers/authController.js
const supabase = require('../config/supabase');

console.log('=== CHARGEMENT AUTH CONTROLLER ===');

const getProfile = async (req, res) => {
  try {
    console.log('📝 getProfile appelé pour user:', req.user?.id);
    
    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: 'Utilisateur non authentifié' });
    }

    const { data: profile, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', req.user.id)
      .single();

    if (error) {
      console.error('❌ Erreur Supabase getProfile:', error);
      
      // Si le profil n'existe pas, on le crée
      if (error.code === 'PGRST116') { // Pas de résultat
        const { data: newProfile, error: insertError } = await supabase
          .from('profiles')
          .insert([{ 
            id: req.user.id, 
            email: req.user.email,
            full_name: req.user.user_metadata?.full_name || ''
          }])
          .select()
          .single();

        if (insertError) {
          console.error('❌ Erreur création profil:', insertError);
          return res.status(500).json({ error: 'Erreur création profil' });
        }

        return res.json(newProfile);
      }
      
      return res.status(500).json({ error: error.message });
    }

    res.json(profile);
  } catch (error) {
    console.error('❌ Erreur getProfile:', error);
    res.status(500).json({ error: error.message });
  }
};

const updateProfile = async (req, res) => {
  const { full_name } = req.body;
  
  try {
    console.log('📝 updateProfile appelé pour user:', req.user?.id);
    
    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: 'Utilisateur non authentifié' });
    }

    const { data, error } = await supabase
      .from('profiles')
      .update({ full_name })
      .eq('id', req.user.id)
      .select()
      .single();

    if (error) {
      console.error('❌ Erreur updateProfile:', error);
      return res.status(500).json({ error: error.message });
    }

    res.json(data);
  } catch (error) {
    console.error('❌ Erreur updateProfile:', error);
    res.status(500).json({ error: error.message });
  }
};

console.log('getProfile type:', typeof getProfile);
console.log('updateProfile type:', typeof updateProfile);

module.exports = {
  getProfile,
  updateProfile
};

console.log('✅ AuthController chargé avec succès');
console.log('===================================');