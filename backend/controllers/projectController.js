// C:\Users\USER\bookfete\backend\controllers\projectController.js
const supabase = require('../config/supabase');
const { v4: uuidv4 } = require('uuid');

// ============================================
// CRÉER UN PROJET
// ============================================
exports.createProject = async (req, res) => {
  const { type, name, description, deadline } = req.body;
  const owner_id = req.user.id;

  try {
    console.log('📝 Création projet pour user:', owner_id);
    console.log('   Données:', { type, name, description, deadline });

    let cover_url = null;

    // Upload de l'image de couverture si fournie
    if (req.file) {
      console.log('   📸 Upload image de couverture...');
      const fileExt = req.file.originalname.split('.').pop();
      const fileName = `${owner_id}/${uuidv4()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from('project-covers')
        .upload(fileName, req.file.buffer, { 
          contentType: req.file.mimetype,
          cacheControl: '3600'
        });
      
      if (uploadError) {
        console.error('❌ Erreur upload:', uploadError);
        throw uploadError;
      }

      const { data: { publicUrl } } = supabase.storage
        .from('project-covers')
        .getPublicUrl(fileName);

      cover_url = publicUrl;
      console.log('   ✅ Image uploadée:', cover_url);
    }

    console.log('   💾 Insertion dans Supabase...');
    
    const { data, error } = await supabase
      .from('projects')
      .insert([{ 
        owner_id, 
        type, 
        name, 
        description, 
        contribution_deadline: deadline, 
        cover_image_url: cover_url,
        status: 'collecting',
        manually_closed: false,
        created_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) {
      console.error('❌ Erreur insertion:', error);
      throw error;
    }

    console.log('✅ Projet créé avec succès! ID:', data.id);
    res.status(201).json(data);
    
  } catch (error) {
    console.error('❌ Erreur création projet:', error);
    res.status(500).json({ error: error.message });
  }
};

// ============================================
// RÉCUPÉRER LES PROJETS DE L'UTILISATEUR
// ============================================
exports.getUserProjects = async (req, res) => {
  try {
    console.log('📁 Récupération des projets pour user:', req.user.id);
    
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('owner_id', req.user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    
    console.log(`✅ ${data?.length || 0} projets trouvés`);
    res.json(data || []);
    
  } catch (error) {
    console.error('❌ Erreur:', error);
    res.status(500).json({ error: error.message });
  }
};

// ============================================
// RÉCUPÉRER UN PROJET PAR ID
// ============================================
exports.getProjectById = async (req, res) => {
  const { projectId } = req.params;

  try {
    console.log('🔍 Recherche projet:', projectId);
    
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Projet non trouvé' });

    if (data.owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Non autorisé' });
    }

    res.json(data);
  } catch (error) {
    console.error('❌ Erreur:', error);
    res.status(500).json({ error: error.message });
  }
};

// ============================================
// METTRE À JOUR UN PROJET
// ============================================
exports.updateProject = async (req, res) => {
  const { projectId } = req.params;
  const updates = req.body;

  try {
    const { data: project } = await supabase
      .from('projects')
      .select('owner_id')
      .eq('id', projectId)
      .single();

    if (!project) return res.status(404).json({ error: 'Projet non trouvé' });
    if (project.owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Non autorisé' });
    }

    const { data, error } = await supabase
      .from('projects')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', projectId)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('❌ Erreur update:', error);
    res.status(500).json({ error: error.message });
  }
};

// ============================================
// SUPPRIMER UN PROJET
// ============================================
exports.deleteProject = async (req, res) => {
  const { projectId } = req.params;

  try {
    const { data: project } = await supabase
      .from('projects')
      .select('owner_id')
      .eq('id', projectId)
      .single();

    if (!project) return res.status(404).json({ error: 'Projet non trouvé' });
    if (project.owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Non autorisé' });
    }

    const { error } = await supabase
      .from('projects')
      .delete()
      .eq('id', projectId);

    if (error) throw error;
    res.json({ message: 'Projet supprimé avec succès' });
  } catch (error) {
    console.error('❌ Erreur delete:', error);
    res.status(500).json({ error: error.message });
  }
};

// ============================================
// FERMER LES CONTRIBUTIONS D'UN PROJET
// ============================================
exports.closeContributions = async (req, res) => {
  const { projectId } = req.params;

  try {
    console.log('\n🔒 FERMETURE DES CONTRIBUTIONS');
    console.log('Projet ID:', projectId);

    // Vérifier que le projet existe et appartient à l'utilisateur
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .eq('owner_id', req.user.id)
      .single();

    if (projectError || !project) {
      console.error('❌ Projet non trouvé ou non autorisé');
      return res.status(404).json({ error: 'Projet non trouvé' });
    }

    // Mettre à jour le statut
    const { data, error } = await supabase
      .from('projects')
      .update({ 
        status: 'reviewing',
        manually_closed: true,
        closed_at: new Date().toISOString()
      })
      .eq('id', projectId)
      .select()
      .single();

    if (error) {
      console.error('❌ Erreur fermeture:', error);
      return res.status(500).json({ error: error.message });
    }

    console.log('✅ Contributions fermées avec succès');
    
    // Optionnel: Envoyer des notifications aux contributeurs qui n'ont pas encore participé
    const { data: pendingInvites } = await supabase
      .from('invites')
      .select('email')
      .eq('project_id', projectId)
      .eq('contributed', false);

    console.log(`📧 ${pendingInvites?.length || 0} contributeurs n'ont pas encore participé`);

    res.json({ 
      success: true, 
      message: 'Contributions fermées avec succès',
      project: data
    });

  } catch (error) {
    console.error('❌ Erreur:', error);
    res.status(500).json({ error: error.message });
  }
};

// ============================================
// RÉOUVRIR LES CONTRIBUTIONS D'UN PROJET
// ============================================
exports.reopenContributions = async (req, res) => {
  const { projectId } = req.params;

  try {
    console.log('\n🔓 RÉOUVERTURE DES CONTRIBUTIONS');
    console.log('Projet ID:', projectId);

    // Vérifier que le projet existe et appartient à l'utilisateur
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .eq('owner_id', req.user.id)
      .single();

    if (projectError || !project) {
      console.error('❌ Projet non trouvé ou non autorisé');
      return res.status(404).json({ error: 'Projet non trouvé' });
    }

    // Vérifier que la date limite n'est pas dépassée
    const deadline = new Date(project.contribution_deadline);
    const now = new Date();
    
    if (now > deadline) {
      return res.status(400).json({ 
        error: 'Date limite dépassée',
        message: 'Impossible de rouvrir les contributions car la date limite est dépassée. Modifiez d\'abord la date limite.'
      });
    }

    // Mettre à jour le statut
    const { data, error } = await supabase
      .from('projects')
      .update({ 
        status: 'collecting',
        manually_closed: false,
        reopened_at: new Date().toISOString()
      })
      .eq('id', projectId)
      .select()
      .single();

    if (error) {
      console.error('❌ Erreur réouverture:', error);
      return res.status(500).json({ error: error.message });
    }

    console.log('✅ Contributions rouvertes avec succès');

    res.json({ 
      success: true, 
      message: 'Contributions rouvertes avec succès',
      project: data
    });

  } catch (error) {
    console.error('❌ Erreur:', error);
    res.status(500).json({ error: error.message });
  }
};