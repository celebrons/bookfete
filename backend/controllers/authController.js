// backend/controllers/authController.js
const supabase = require('../config/supabase');

console.log('=== CHARGEMENT AUTH CONTROLLER ===');

// ✅ NOUVELLE FONCTION LOGIN
const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    
    console.log('📝 Tentative de login pour:', email);
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email et mot de passe requis' });
    }

    // Authentification via Supabase
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      console.error('❌ Erreur login Supabase:', error.message);
      return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
    }

    console.log('✅ Login réussi pour:', email);

    // Retourner le token et les infos utilisateur
    res.json({
      token: data.session.access_token,
      user: {
        id: data.user.id,
        email: data.user.email,
        name: data.user.user_metadata?.full_name || email.split('@')[0]
      }
    });

  } catch (error) {
    console.error('❌ Erreur login:', error);
    res.status(500).json({ error: error.message });
  }
};

// ✅ NOUVELLE FONCTION REGISTER
const register = async (req, res) => {
  try {
    const { email, password, full_name } = req.body;
    
    console.log('📝 Tentative d\'inscription pour:', email);

    if (!email || !password) {
      return res.status(400).json({ error: 'Email et mot de passe requis' });
    }

    // Création via Supabase
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: full_name || email.split('@')[0]
        }
      }
    });

    if (error) {
      console.error('❌ Erreur inscription Supabase:', error.message);
      return res.status(400).json({ error: error.message });
    }

    console.log('✅ Inscription réussie pour:', email);

    res.json({
      message: 'Inscription réussie',
      user: {
        id: data.user.id,
        email: data.user.email,
        name: data.user.user_metadata?.full_name
      }
    });

  } catch (error) {
    console.error('❌ Erreur register:', error);
    res.status(500).json({ error: error.message });
  }
};

// ✅ NOUVELLE FONCTION LOGOUT
const logout = async (req, res) => {
  try {
    const { error } = await supabase.auth.signOut();
    
    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json({ message: 'Déconnexion réussie' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ✅ FONCTIONS EXISTANTES (inchangées)
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
      if (error.code === 'PGRST116') {
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

console.log('Fonctions exportées:', {
  login: typeof login,
  register: typeof register,
  logout: typeof logout,
  getProfile: typeof getProfile,
  updateProfile: typeof updateProfile
});

module.exports = {
  login,
  register,
  logout,
  getProfile,
  updateProfile
};

console.log('✅ AuthController chargé avec succès');
console.log('===================================');