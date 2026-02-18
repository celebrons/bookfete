// backend/controllers/contributionController.js
const supabase = require('../config/supabase');
const { v4: uuidv4 } = require('uuid');
const { sendEmail } = require('../services/emailService');

// ============================================
// PAGE PUBLIQUE DE CONTRIBUTION (lien magique)
// ============================================
exports.getContributionPage = async (req, res) => {
  const { token } = req.params;

  try {
    console.log('\n🔍 RECHERCHE PAGE CONTRIBUTION');
    console.log('Token:', token);

    const { data: invite, error } = await supabase
      .from('invites')
      .select('*, project:projects(*)')
      .eq('token', token)
      .single();

    if (error || !invite) {
      console.error('❌ Invitation non trouvée');
      return res.status(404).json({ error: 'Lien invalide ou expiré' });
    }

    const deadline = new Date(invite.project.contribution_deadline);
    const now = new Date();
    
    if (now > deadline) {
      console.log('❌ Date limite dépassée');
      return res.status(400).json({ error: 'La date limite de contribution est dépassée' });
    }

    if (invite.contributed) {
      console.log('⚠️ Déjà contribué');
      return res.json({ 
        message: 'Vous avez déjà contribué', 
        invite,
        project: invite.project 
      });
    }

    console.log('✅ Page de contribution chargée pour:', invite.email);
    res.json(invite);

  } catch (error) {
    console.error('❌ Erreur getContributionPage:', error);
    res.status(500).json({ error: error.message });
  }
};

// ============================================
// RÉCUPÉRER UNE CONTRIBUTION EXISTANTE (pour modification)
// ============================================
exports.getContributionForEdit = async (req, res) => {
  const { token } = req.params;

  try {
    console.log('\n🔍 RECHERCHE CONTRIBUTION POUR MODIFICATION');
    console.log('Token:', token);

    // Vérifier l'invitation
    const { data: invite, error: inviteError } = await supabase
      .from('invites')
      .select('*, project:projects(*)')
      .eq('token', token)
      .single();

    if (inviteError || !invite) {
      console.error('❌ Invitation non trouvée');
      return res.status(404).json({ error: 'Lien invalide ou expiré' });
    }

    // Vérifier si la date limite est dépassée
    const deadline = new Date(invite.project.contribution_deadline);
    const now = new Date();
    
    if (now > deadline) {
      console.log('❌ Date limite dépassée');
      return res.status(400).json({ 
        error: 'Date limite dépassée',
        message: 'La date limite de contribution est dépassée, vous ne pouvez plus modifier votre contribution'
      });
    }

    // Si l'utilisateur n'a pas encore contribué, rediriger vers la page de création
    if (!invite.contributed) {
      console.log('ℹ️ Pas encore de contribution, redirection vers création');
      return res.json({ 
        exists: false,
        invite,
        project: invite.project 
      });
    }

    // Récupérer la contribution existante
    const { data: contribution, error: contribError } = await supabase
      .from('contributions')
      .select('*')
      .eq('invite_id', invite.id)
      .single();

    if (contribError) {
      console.error('❌ Erreur récupération contribution:', contribError);
      return res.status(500).json({ error: 'Erreur lors de la récupération de votre contribution' });
    }

    console.log('✅ Contribution trouvée, modification possible');
    res.json({ 
      exists: true,
      invite,
      project: invite.project,
      contribution
    });

  } catch (error) {
    console.error('❌ Erreur getContributionForEdit:', error);
    res.status(500).json({ error: error.message });
  }
};

// ============================================
// SOUMISSION D'UNE CONTRIBUTION (création)
// ============================================
exports.submitContribution = async (req, res) => {
  const { token } = req.params;
  const { message } = req.body;
  const files = req.files || [];

  try {
    console.log('\n📝 SOUMISSION CONTRIBUTION');
    console.log('Token:', token);
    console.log('Message:', message);
    console.log('Nombre de fichiers:', files.length);

    // Vérifier l'invitation
    const { data: invite, error: inviteError } = await supabase
      .from('invites')
      .select('*, project:projects(*)')
      .eq('token', token)
      .single();

    if (inviteError || !invite) {
      console.error('❌ Invitation non trouvée');
      return res.status(404).json({ error: 'Lien invalide' });
    }

    if (invite.contributed) {
      console.log('❌ Déjà contribué');
      return res.status(400).json({ error: 'Vous avez déjà contribué' });
    }

    // Vérifier la date limite
    const deadline = new Date(invite.project.contribution_deadline);
    const now = new Date();
    
    if (now > deadline) {
      console.log('❌ Date limite dépassée');
      return res.status(400).json({ error: 'La date limite est dépassée' });
    }

    // Upload des photos (max 5)
    const photoUrls = [];
    for (const file of files.slice(0, 5)) {
      try {
        console.log('📸 Upload photo:', file.originalname);
        
        const fileExt = file.originalname.split('.').pop();
        const fileName = `contributions/${invite.project_id}/${uuidv4()}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
          .from('contribution-photos')
          .upload(fileName, file.buffer, { 
            contentType: file.mimetype,
            cacheControl: '3600'
          });

        if (uploadError) {
          console.error('❌ Erreur upload:', uploadError);
          continue;
        }

        // Obtenir l'URL publique
        const { data: publicUrlData } = supabase.storage
          .from('contribution-photos')
          .getPublicUrl(fileName);

        photoUrls.push(publicUrlData.publicUrl);
        console.log('✅ Photo uploadée:', publicUrlData.publicUrl);
        
      } catch (uploadErr) {
        console.error('❌ Erreur upload:', uploadErr);
      }
    }

    // Insérer la contribution
    console.log('💾 Insertion contribution dans la DB...');
    
    const { data: contribution, error: insertError } = await supabase
      .from('contributions')
      .insert([{
        project_id: invite.project_id,
        invite_id: invite.id,
        contributor_email: invite.email,
        message,
        photo_urls: photoUrls,
        created_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (insertError) {
      console.error('❌ Erreur insertion:', insertError);
      throw insertError;
    }

    // Marquer l'invitation comme contribuée
    await supabase
      .from('invites')
      .update({ contributed: true })
      .eq('id', invite.id);

    console.log('✅ Contribution enregistrée avec succès');
    console.log(`📸 ${photoUrls.length} photos uploadées`);

    res.status(201).json({ 
      success: true,
      message: 'Contribution enregistrée avec succès',
      contribution: {
        id: contribution.id,
        message: contribution.message,
        photo_count: photoUrls.length,
        photos: photoUrls
      }
    });

  } catch (error) {
    console.error('❌ Erreur soumission contribution:', error);
    res.status(500).json({ 
      error: 'Erreur lors de l\'envoi de la contribution',
      details: error.message 
    });
  }
};

// ============================================
// METTRE À JOUR UNE CONTRIBUTION EXISTANTE
// ============================================
exports.updateContribution = async (req, res) => {
  const { token } = req.params;
  const { message } = req.body;
  const files = req.files || [];

  try {
    console.log('\n📝 MISE À JOUR CONTRIBUTION');
    console.log('Token:', token);
    console.log('Nouveau message:', message);
    console.log('Nouveaux fichiers:', files.length);

    // Vérifier l'invitation
    const { data: invite, error: inviteError } = await supabase
      .from('invites')
      .select('*, project:projects(*)')
      .eq('token', token)
      .single();

    if (inviteError || !invite) {
      console.error('❌ Invitation non trouvée');
      return res.status(404).json({ error: 'Lien invalide' });
    }

    // Vérifier la date limite
    const deadline = new Date(invite.project.contribution_deadline);
    const now = new Date();
    
    if (now > deadline) {
      console.log('❌ Date limite dépassée');
      return res.status(400).json({ 
        error: 'Date limite dépassée',
        message: 'La date limite de contribution est dépassée, vous ne pouvez plus modifier votre contribution'
      });
    }

    // Récupérer la contribution existante
    const { data: existingContribution, error: fetchError } = await supabase
      .from('contributions')
      .select('*')
      .eq('invite_id', invite.id)
      .single();

    if (fetchError) {
      console.error('❌ Contribution non trouvée');
      return res.status(404).json({ error: 'Contribution non trouvée' });
    }

    // Upload des nouvelles photos
    const photoUrls = [...(existingContribution.photo_urls || [])];
    
    for (const file of files.slice(0, 5)) {
      try {
        console.log('📸 Upload nouvelle photo:', file.originalname);
        
        const fileExt = file.originalname.split('.').pop();
        const fileName = `contributions/${invite.project_id}/${uuidv4()}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
          .from('contribution-photos')
          .upload(fileName, file.buffer, { 
            contentType: file.mimetype,
            cacheControl: '3600'
          });

        if (uploadError) {
          console.error('❌ Erreur upload:', uploadError);
          continue;
        }

        const { data: publicUrlData } = supabase.storage
          .from('contribution-photos')
          .getPublicUrl(fileName);

        photoUrls.push(publicUrlData.publicUrl);
        console.log('✅ Nouvelle photo uploadée:', publicUrlData.publicUrl);
        
      } catch (uploadErr) {
        console.error('❌ Erreur upload:', uploadErr);
      }
    }

    // Mettre à jour la contribution
    console.log('💾 Mise à jour de la contribution...');
    
    const { data: contribution, error: updateError } = await supabase
      .from('contributions')
      .update({
        message,
        photo_urls: photoUrls,
        updated_at: new Date().toISOString()
      })
      .eq('id', existingContribution.id)
      .select()
      .single();

    if (updateError) {
      console.error('❌ Erreur mise à jour:', updateError);
      throw updateError;
    }

    console.log('✅ Contribution mise à jour avec succès');
    console.log(`📸 ${photoUrls.length} photos au total`);

    res.status(200).json({ 
      success: true,
      message: 'Contribution mise à jour avec succès',
      contribution: {
        id: contribution.id,
        message: contribution.message,
        photo_count: photoUrls.length,
        photos: photoUrls
      }
    });

  } catch (error) {
    console.error('❌ Erreur mise à jour contribution:', error);
    res.status(500).json({ 
      error: 'Erreur lors de la mise à jour de la contribution',
      details: error.message 
    });
  }
};

// ============================================
// SUPPRIMER UNE PHOTO D'UNE CONTRIBUTION
// ============================================
exports.deletePhoto = async (req, res) => {
  const { token } = req.params;
  const { photoUrl } = req.body;

  try {
    console.log('\n🗑️ SUPPRESSION PHOTO');
    console.log('Token:', token);
    console.log('Photo URL:', photoUrl);

    // Vérifier l'invitation
    const { data: invite, error: inviteError } = await supabase
      .from('invites')
      .select('*, project:projects(*)')
      .eq('token', token)
      .single();

    if (inviteError || !invite) {
      return res.status(404).json({ error: 'Lien invalide' });
    }

    // Vérifier la date limite
    const deadline = new Date(invite.project.contribution_deadline);
    const now = new Date();
    
    if (now > deadline) {
      return res.status(400).json({ error: 'Date limite dépassée' });
    }

    // Récupérer la contribution
    const { data: contribution, error: fetchError } = await supabase
      .from('contributions')
      .select('*')
      .eq('invite_id', invite.id)
      .single();

    if (fetchError) {
      return res.status(404).json({ error: 'Contribution non trouvée' });
    }

    // Filtrer pour enlever la photo
    const newPhotoUrls = (contribution.photo_urls || []).filter(url => url !== photoUrl);

    // Mettre à jour
    const { error: updateError } = await supabase
      .from('contributions')
      .update({
        photo_urls: newPhotoUrls,
        updated_at: new Date().toISOString()
      })
      .eq('id', contribution.id);

    if (updateError) {
      console.error('❌ Erreur suppression photo:', updateError);
      return res.status(500).json({ error: updateError.message });
    }

    console.log('✅ Photo supprimée');
    res.json({ 
      success: true, 
      message: 'Photo supprimée',
      photo_urls: newPhotoUrls 
    });

  } catch (error) {
    console.error('❌ Erreur:', error);
    res.status(500).json({ error: error.message });
  }
};

// ============================================
// RÉCUPÉRER LES CONTRIBUTIONS D'UN PROJET
// ============================================
exports.getProjectContributions = async (req, res) => {
  const { projectId } = req.params;

  try {
    console.log('\n📋 RÉCUPÉRATION CONTRIBUTIONS');
    console.log('Projet ID:', projectId);

    // Vérifier que l'utilisateur est propriétaire du projet
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('owner_id, name')
      .eq('id', projectId)
      .single();

    if (projectError) {
      console.error('❌ Projet non trouvé');
      return res.status(404).json({ error: 'Projet non trouvé' });
    }

    if (project.owner_id !== req.user.id) {
      console.error('❌ Non autorisé');
      return res.status(403).json({ error: 'Non autorisé' });
    }

    // Récupérer les contributions
    const { data, error } = await supabase
      .from('contributions')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('❌ Erreur récupération:', error);
      return res.status(500).json({ error: error.message });
    }

    console.log(`✅ ${data.length} contributions trouvées`);
    res.json(data);

  } catch (error) {
    console.error('❌ Erreur:', error);
    res.status(500).json({ error: error.message });
  }
};

// ============================================
// SUPPRIMER UNE CONTRIBUTION
// ============================================
exports.deleteContribution = async (req, res) => {
  const { contributionId } = req.params;

  try {
    console.log('\n🗑️ SUPPRESSION CONTRIBUTION');
    console.log('Contribution ID:', contributionId);

    const { data: contribution, error: fetchError } = await supabase
      .from('contributions')
      .select('*, project:projects(owner_id)')
      .eq('id', contributionId)
      .single();

    if (fetchError) {
      console.error('❌ Contribution non trouvée');
      return res.status(404).json({ error: 'Contribution non trouvée' });
    }

    if (contribution.project.owner_id !== req.user.id) {
      console.error('❌ Non autorisé');
      return res.status(403).json({ error: 'Non autorisé' });
    }

    const { error } = await supabase
      .from('contributions')
      .delete()
      .eq('id', contributionId);

    if (error) {
      console.error('❌ Erreur suppression:', error);
      return res.status(500).json({ error: error.message });
    }

    console.log('✅ Contribution supprimée');
    res.json({ success: true, message: 'Contribution supprimée' });

  } catch (error) {
    console.error('❌ Erreur:', error);
    res.status(500).json({ error: error.message });
  }
};