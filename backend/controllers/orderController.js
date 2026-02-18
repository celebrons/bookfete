const supabase = require('../config/supabase');
const { generatePDF } = require('../services/pdfService');

exports.generateBookPDF = async (req, res) => {
  const { projectId } = req.params;
  
  try {
    // Récupérer le projet
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .single();

    if (projectError) throw projectError;

    // Récupérer toutes les contributions
    const { data: contributions, error: contributionsError } = await supabase
      .from('contributions')
      .select('*')
      .eq('project_id', projectId);

    if (contributionsError) throw contributionsError;

    // Générer le PDF
    const pdfBuffer = await generatePDF(project, contributions);

    // Uploader le PDF
    const fileName = `projects/${projectId}/book-${Date.now()}.pdf`;
    const { error: uploadError } = await supabase.storage
      .from('generated-books')
      .upload(fileName, pdfBuffer, { 
        contentType: 'application/pdf',
        upsert: true 
      });

    if (uploadError) throw uploadError;

    // Obtenir une URL signée
    const { data: signedData, error: signedError } = await supabase.storage
      .from('generated-books')
      .createSignedUrl(fileName, 31536000); // 1 an

    if (signedError) throw signedError;

    // Créer une commande
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert([{ 
        project_id: projectId, 
        user_id: req.user.id, 
        pdf_url: signedData.signedUrl, 
        status: 'pending' 
      }])
      .select()
      .single();

    if (orderError) throw orderError;

    // Mettre à jour le statut du projet
    await supabase
      .from('projects')
      .update({ status: 'generating' })
      .eq('id', projectId);

    res.json({ 
      pdfPreviewUrl: signedData.signedUrl, 
      orderId: order.id 
    });
  } catch (error) {
    console.error('Erreur génération PDF:', error);
    res.status(500).json({ error: error.message });
  }
};

exports.selectTemplateAndOrder = async (req, res) => {
  const { orderId, template, options } = req.body;
  
  try {
    const { data, error } = await supabase
      .from('orders')
      .update({ 
        selected_template: template, 
        options, 
        status: 'paid' 
      })
      .eq('id', orderId)
      .select()
      .single();

    if (error) throw error;

    // Récupérer le projectId pour mettre à jour son statut
    const { data: order } = await supabase
      .from('orders')
      .select('project_id')
      .eq('id', orderId)
      .single();

    if (order) {
      await supabase
        .from('projects')
        .update({ status: 'completed' })
        .eq('id', order.project_id);
    }

    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getOrderStatus = async (req, res) => {
  const { orderId } = req.params;
  
  try {
    const { data, error } = await supabase
      .from('orders')
      .select('*, project:projects(*)')
      .eq('id', orderId)
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};