const supabase = require('../config/supabase');

const login = async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const normalizedEmail = String(email || '').trim().toLowerCase();

    if (!normalizedEmail || !password) {
      return res.status(400).json({ error: 'Email et mot de passe requis' });
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password
    });

    if (error) {
      return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
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
      return res.status(400).json({ error: 'Email et mot de passe requis' });
    }

    if (safePassword.length < 8) {
      return res.status(400).json({ error: 'Mot de passe trop court (8 caracteres minimum)' });
    }

    const { data, error } = await supabase.auth.signUp({
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
      message: 'Inscription reussie',
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
    const { error } = await supabase.auth.signOut();
    if (error) {
      return res.status(500).json({ error: error.message });
    }
    return res.json({ message: 'Deconnexion reussie' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

const getProfile = async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: 'Utilisateur non authentifie' });
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
          return res.status(500).json({ error: 'Erreur creation profil' });
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
      return res.status(401).json({ error: 'Utilisateur non authentifie' });
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
