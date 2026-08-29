// backend/services/composition/productCatalog.js
//
// Grille tarifaire (book_products) : nombre de pages -> prix. Remplace les
// paliers codes en dur cote frontend. Lecture seule, publique.

const supabase = require('../../config/supabase');

async function listActiveProducts() {
  const { data, error } = await supabase
    .from('book_products')
    .select('*')
    .eq('active', true)
    .order('page_count', { ascending: true });

  if (error) throw error;
  return data;
}

module.exports = {
  listActiveProducts
};
