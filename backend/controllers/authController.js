const { createClient } = require('@supabase/supabase-js');
const supabase = require('../config/supabase');
const { t } = require('../services/i18n/t');

// UN CLIENT JETABLE POUR CHAQUE CONNEXION.
//
// signInWithPassword et signUp RETIENNENT la session sur le client qui
// les appelle. Les lancer sur le client partage du backend le transformait
// en client de la derniere personne connectee — voir le commentaire de
// config/supabase.js pour ce que ca a casse.
//
// Un client neuf par appel coute une allocation et resout le probleme a la
// racine : la session naît et meurt avec la requete, sans jamais pouvoir
// contaminer quoi que ce soit.
const clientJetable = () => createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
);

const login = async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const normalizedEmail = String(email || '').trim().toLowerCase();

    if (!normalizedEmail || !password) {
      return res.status(400).json({ error: t(req, 'Email et mot de passe requis', 'Email and password required') });
    }

    const { data, error } = await clientJetable().auth.signInWithPassword({
      email: normalizedEmail,
      password
    });

    if (error) {
      return res.status(401).json({ error: t(req, 'Email ou mot de passe incorrect', 'Incorrect email or password') });
    }

    return res.json({
      token: data?.session?.access_token,
      user: {
        id: data?.user?.id,
        email: data?.user?.email,
        name: data?.user?.user_metadata?.full_name || normalizedEmail.split('@')[0]
      }
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

const register = async (req, res) => {
  try {
    const { email, password, full_name } = req.body || {};
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const safePassword = String(password || '');
    const name = String(full_name || normalizedEmail.split('@')[0] || '').trim();

    if (!normalizedEmail || !safePassword) {
      return res.status(400).json({ error: t(req, 'Email et mot de passe requis', 'Email and password required') });
    }

    if (safePassword.length < 8) {
      return res.status(400).json({ error: t(req, 'Mot de passe trop court (8 caracteres minimum)', 'Password too short (8 characters minimum)') });
    }

    const { data, error } = await clientJetable().auth.signUp({
      email: normalizedEmail,
      password: safePassword,
      options: {
        data: {
          full_name: name
        }
      }
    });

    if (error) {
      const statusCode = /already|exists|registered/i.test(error.message) ? 409 : 400;
      return res.status(statusCode).json({ error: error.message });
    }

    if (data?.user?.id) {
      try {
        await supabase
          .from('profiles')
          .upsert([{
            id: data.user.id,
            email: normalizedEmail,
            full_name: name
          }], { onConflict: 'id' });
      } catch (_profileError) {
        // Non bloquant pendant l'inscription
      }
    }

    return res.status(201).json({
      message: t(req, 'Inscription reussie', 'Registration successful'),
      user: {
        id: data?.user?.id,
        email: data?.user?.email || normalizedEmail,
        name
      },
      requiresEmailConfirmation: !data?.session
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

const logout = async (req, res) => {
  try {
    const { error } = await clientJetable().auth.signOut();
    if (error) {
      return res.status(500).json({ error: error.message });
    }
    return res.json({ message: t(req, 'Deconnexion reussie', 'Logout successful') });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

const getProfile = async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: t(req, 'Utilisateur non authentifie', 'User not authenticated') });
    }

    const { data: profile, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', req.user.id)
      .single();

    if (error) {
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
          return res.status(500).json({ error: t(req, 'Erreur creation profil', 'Error creating profile') });
        }

        return res.json(newProfile);
      }

      return res.status(500).json({ error: error.message });
    }

    return res.json(profile);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

const updateProfile = async (req, res) => {
  try {
    const { full_name } = req.body || {};

    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: t(req, 'Utilisateur non authentifie', 'User not authenticated') });
    }

    const { data, error } = await supabase
      .from('profiles')
      .update({ full_name })
      .eq('id', req.user.id)
      .select()
      .single();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.json(data);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

module.exports = {
  login,
  register,
  logout,
  getProfile,
  updateProfile
};
