// backend/config/supabase.js - VERSION SIMPLIFIÉE QUI MARCHE
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

console.log('\n🔧 CONNEXION SUPABASE');
console.log('URL:', process.env.SUPABASE_URL);

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Test immédiat
(async () => {
  const { data, error } = await supabase
    .from('projects')
    .select('*');
  
  console.log('📊 Projets trouvés:', data?.length || 0);
  if (error) console.error('❌ Erreur:', error);
  else console.log('✅ Connexion OK');
})();

module.exports = supabase;