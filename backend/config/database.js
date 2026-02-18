const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

console.log('=== CHARGEMENT SUPABASE CLIENT ===');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ ERREUR: Variables Supabase manquantes');
  process.exit(1);
}

console.log('✅ URL Supabase:', supabaseUrl.substring(0, 20) + '...');
console.log('✅ Clé présente:', !!supabaseKey);

const supabase = createClient(supabaseUrl, supabaseKey);

console.log('✅ Client Supabase créé');
console.log('===============================');

module.exports = supabase;