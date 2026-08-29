// backend/services/composition/templateCatalog.js
//
// Catalogue des styles (book_templates) et des mises en page qu'ils
// autorisent (layout_definitions). Lecture seule, publique.

const supabase = require('../../config/supabase');

async function listActiveTemplates() {
  const { data, error } = await supabase
    .from('book_templates')
    .select('*')
    .eq('active', true)
    .order('sort_order', { ascending: true });

  if (error) throw error;
  return data;
}

async function listActiveLayouts() {
  const { data, error } = await supabase
    .from('layout_definitions')
    .select('*')
    .eq('active', true)
    .order('kind', { ascending: true });

  if (error) throw error;
  return data;
}

async function getTemplateById(templateId) {
  const { data, error } = await supabase
    .from('book_templates')
    .select('*')
    .eq('id', templateId)
    .eq('active', true)
    .maybeSingle();

  if (error) throw error;
  return data;
}

module.exports = {
  listActiveTemplates,
  listActiveLayouts,
  getTemplateById
};
