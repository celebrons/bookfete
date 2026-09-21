const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
}

if (String(supabaseServiceRoleKey).startsWith('sb_publishable_')) {
  console.warn('SUPABASE_SERVICE_ROLE_KEY appears to be publishable. Use the service role key on backend.');
}

// CE CLIENT NE DOIT JAMAIS PORTER DE SESSION UTILISATEUR.
//
// Il parle au nom du service et contourne RLS : c'est ce qui permet aux
// routes de verifier elles-memes les droits (requireOwnedBook, owner_id...).
// Si une session s'y installait, toutes les requetes du serveur partiraient
// au nom de cette personne — et le contournement de RLS disparaitrait d'un
// coup, pour tout le monde.
//
// C'est exactement ce qui s'est produit le 2026-09-21 : une connexion par
// mot de passe posait sa session ici, et plus personne ne pouvait creer de
// livre jusqu'au redemarrage du serveur. Les trois options ci-dessous
// ferment cette porte ; les operations d'authentification utilisent
// desormais un client jetable (voir controllers/authController.js).
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false
  }
});

module.exports = supabase;
