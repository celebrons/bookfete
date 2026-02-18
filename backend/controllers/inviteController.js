// C:\Users\USER\bookfete\backend\controllers\inviteController.js
const supabase = require('../config/supabase');
const { v4: uuidv4 } = require('uuid');
const { sendEmail } = require('../services/emailService');

// ============================================
// INVITER DES CONTRIBUTEURS
// ============================================
exports.inviteContributors = async (req, res) => {
  const { projectId, emails, customMessage } = req.body;

  try {
    console.log('\n' + '='.repeat(60));
    console.log('📨 TENTATIVE D\'ENVOI D\'INVITATIONS');
    console.log('='.repeat(60));
    console.log('   - Project ID reçu:', projectId);
    console.log('   - Emails reçus:', emails);
    console.log('   - Utilisateur ID:', req.user?.id);
    console.log('   - Utilisateur Email:', req.user?.email);
    console.log('   - Timestamp:', new Date().toISOString());

    // Vérifications de base
    if (!projectId) {
      console.log('❌ ERREUR: ID du projet manquant');
      return res.status(400).json({ error: 'ID du projet manquant' });
    }

    if (!emails || !Array.isArray(emails) || emails.length === 0) {
      console.log('❌ ERREUR: Liste d\'emails invalide');
      return res.status(400).json({ error: 'Liste d\'emails invalide' });
    }

    if (emails.length > 100) {
      console.log('❌ ERREUR: Trop d\'emails (max 100)');
      return res.status(400).json({ error: 'Maximum 100 invitations par projet' });
    }

    // ============================================
    // ÉTAPE 1: Vérifier que le projet existe (SANS filtre propriétaire d'abord)
    // ============================================
    console.log('\n🔍 ÉTAPE 1: Recherche du projet par ID...');
    console.log('   - ID recherché:', projectId);
    
    const { data: projectExists, error: existsError } = await supabase
      .from('projects')
      .select('id, name, owner_id, status, contribution_deadline')
      .eq('id', projectId)
      .maybeSingle();

    if (existsError) {
      console.error('❌ Erreur technique lors de la recherche:', existsError);
      return res.status(500).json({ 
        error: 'Erreur technique',
        details: existsError.message 
      });
    }

    if (!projectExists) {
      console.log('❌ Projet non trouvé avec cet ID');
      
      // Chercher tous les projets pour debug
      const { data: allProjects } = await supabase
        .from('projects')
        .select('id, name, owner_id')
        .limit(5);
      
      console.log('📋 5 premiers projets dans la DB:', allProjects);
      
      return res.status(404).json({ 
        error: 'Projet non trouvé',
        message: `Aucun projet avec l'ID ${projectId} n'existe`,
        allProjects: allProjects
      });
    }

    console.log('✅ Projet trouvé dans la DB:');
    console.log('   - Nom:', projectExists.name);
    console.log('   - Propriétaire ID:', projectExists.owner_id);
    console.log('   - Statut:', projectExists.status);

    // ============================================
    // ÉTAPE 2: Vérifier la correspondance du propriétaire
    // ============================================
    console.log('\n🔍 ÉTAPE 2: Vérification du propriétaire...');
    console.log('   - Propriétaire requis:', projectExists.owner_id);
    console.log('   - Utilisateur connecté:', req.user.id);
    console.log('   - Correspondance:', projectExists.owner_id === req.user.id ? '✅ OUI' : '❌ NON');

    if (projectExists.owner_id !== req.user.id) {
      console.log('❌ ERREUR: L\'utilisateur n\'est pas le propriétaire');
      
      // Chercher les projets de l'utilisateur
      const { data: userProjects } = await supabase
        .from('projects')
        .select('id, name')
        .eq('owner_id', req.user.id);
      
      console.log('📋 Projets de cet utilisateur:', userProjects);
      
      return res.status(403).json({ 
        error: 'Non autorisé',
        message: 'Vous n\'êtes pas le propriétaire de ce projet',
        yourProjects: userProjects
      });
    }

    // ============================================
    // ÉTAPE 3: Vérifier la date limite
    // ============================================
    console.log('\n🔍 ÉTAPE 3: Vérification de la date limite...');
    const deadline = new Date(projectExists.contribution_deadline);
    const now = new Date();
    
    console.log('   - Date limite:', projectExists.contribution_deadline);
    console.log('   - Date actuelle:', now.toISOString().split('T')[0]);
    console.log('   - Deadline dépassée:', now > deadline ? '✅ OUI' : '❌ NON');

    if (now > deadline) {
      console.log('❌ ERREUR: Date limite dépassée');
      return res.status(400).json({ 
        error: 'Date limite dépassée',
        message: 'La date limite de collecte est dépassée',
        deadline: projectExists.contribution_deadline
      });
    }

    // ============================================
    // ÉTAPE 4: Valider les emails
    // ============================================
    console.log('\n🔍 ÉTAPE 4: Validation des emails...');
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const validEmails = [];
    const invalidEmails = [];

    emails.forEach(email => {
      const cleanEmail = email.trim().toLowerCase();
      if (emailRegex.test(cleanEmail)) {
        validEmails.push(cleanEmail);
        console.log('   ✅ Valide:', cleanEmail);
      } else {
        invalidEmails.push(email);
        console.log('   ❌ Invalide:', email);
      }
    });

    if (invalidEmails.length > 0) {
      console.log('❌ ERREUR: Emails invalides détectés');
      return res.status(400).json({
        error: 'Emails invalides',
        invalidEmails
      });
    }

    // ============================================
    // ÉTAPE 5: Vérifier les invitations existantes
    // ============================================
    console.log('\n🔍 ÉTAPE 5: Vérification des invitations existantes...');
    
    const { data: existingInvites, error: existingError } = await supabase
      .from('invites')
      .select('email')
      .eq('project_id', projectId)
      .in('email', validEmails);

    if (existingError) {
      console.error('❌ Erreur vérification existantes:', existingError);
      // On continue quand même
    }

    const existingEmails = new Set(existingInvites?.map(i => i.email) || []);
    const newEmails = validEmails.filter(email => !existingEmails.has(email));

    console.log('   - Emails déjà invités:', Array.from(existingEmails));
    console.log('   - Nouveaux emails:', newEmails);

    if (newEmails.length === 0) {
      console.log('❌ ERREUR: Tous les emails ont déjà été invités');
      return res.status(400).json({
        error: 'Tous les emails ont déjà été invités',
        existingEmails: Array.from(existingEmails)
      });
    }

    // ============================================
    // ÉTAPE 6: Créer les nouvelles invitations
    // ============================================
    console.log('\n🔍 ÉTAPE 6: Création des invitations...');
    const invites = [];
    const failedEmails = [];

    for (const email of newEmails) {
      try {
        const token = uuidv4();
        console.log(`   - Création pour ${email}...`);
        
        invites.push({ 
          project_id: projectId, 
          email: email, 
          token,
          contributed: false,
          created_at: new Date().toISOString()
        });

        // Simuler l'envoi d'email
        const inviteLink = `${process.env.FRONTEND_URL}/contribute/${token}`;
        console.log(`     ✅ Token généré: ${token.substring(0, 8)}...`);
        console.log(`     🔗 Lien: ${inviteLink}`);

      } catch (err) {
        console.error(`     ❌ Erreur pour ${email}:`, err);
        failedEmails.push(email);
      }
    }

    if (invites.length === 0) {
      console.log('❌ ERREUR: Aucune invitation valide à créer');
      return res.status(400).json({ 
        error: 'Aucune invitation valide à créer',
        failedEmails
      });
    }

    // ============================================
    // ÉTAPE 7: Insérer dans la base de données
    // ============================================
    console.log('\n🔍 ÉTAPE 7: Insertion dans Supabase...');
    console.log('   - Nombre d\'invitations:', invites.length);
    
    const { data, error } = await supabase
      .from('invites')
      .insert(invites)
      .select();

    if (error) {
      console.error('❌ ERREUR INSERTION:', error);
      console.error('   - Code:', error.code);
      console.error('   - Message:', error.message);
      console.error('   - Détails:', error.details);
      
      if (error.code === '23505') {
        return res.status(400).json({ 
          error: 'Conflit d\'emails',
          message: 'Certains emails existent déjà',
          details: error.details
        });
      }
      
      return res.status(500).json({ 
        error: 'Erreur base de données',
        message: error.message,
        code: error.code
      });
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ SUCCÈS!', invites.length, 'invitations créées');
    console.log('='.repeat(60));
    
    // ============================================
    // ÉTAPE 8: Retourner la réponse
    // ============================================
    res.status(201).json({ 
      success: true,
      message: `${invites.length} invitation(s) envoyée(s) avec succès`,
      invites: data,
      stats: {
        total: validEmails.length,
        new: invites.length,
        existing: validEmails.length - invites.length,
        invalid: invalidEmails.length,
        failed: failedEmails.length
      },
      links: data.map(i => ({
        email: i.email,
        token: i.token,
        link: `${process.env.FRONTEND_URL}/contribute/${i.token}`
      }))
    });
    
  } catch (error) {
    console.error('\n❌ ERREUR GÉNÉRALE CATASTROPHIQUE:');
    console.error(error);
    res.status(500).json({ 
      error: 'Erreur serveur interne',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

// ============================================
// RÉCUPÉRER LES INVITATIONS D'UN PROJET
// ============================================
exports.getProjectInvites = async (req, res) => {
  const { projectId } = req.params;

  try {
    console.log('\n📋 RÉCUPÉRATION DES INVITATIONS');
    console.log('   - Projet ID:', projectId);
    console.log('   - Utilisateur:', req.user?.id);

    // Vérifier que le projet existe et appartient à l'utilisateur
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('owner_id, name')
      .eq('id', projectId)
      .single();

    if (projectError) {
      console.error('❌ Erreur vérification projet:', projectError);
      return res.status(404).json({ error: 'Projet non trouvé' });
    }

    if (project.owner_id !== req.user.id) {
      console.error('❌ Non autorisé - Propriétaire:', project.owner_id);
      return res.status(403).json({ error: 'Non autorisé' });
    }

    // Récupérer les invitations
    const { data, error } = await supabase
      .from('invites')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ Erreur récupération invitations:', error);
      return res.status(500).json({ error: error.message });
    }

    // Calculer les statistiques
    const stats = {
      total: data.length,
      contributed: data.filter(i => i.contributed).length,
      pending: data.filter(i => !i.contributed).length,
      contributionRate: data.length > 0 
        ? Math.round((data.filter(i => i.contributed).length / data.length) * 100) 
        : 0
    };

    console.log(`✅ ${data.length} invitations trouvées`);
    console.log(`   - Contribués: ${stats.contributed}`);
    console.log(`   - En attente: ${stats.pending}`);

    res.json({
      projectName: project.name,
      invites: data,
      stats
    });
    
  } catch (error) {
    console.error('❌ Erreur:', error);
    res.status(500).json({ error: error.message });
  }
};

// ============================================
// RENVOYER UNE INVITATION
// ============================================
exports.resendInvite = async (req, res) => {
  const { inviteId } = req.params;

  try {
    console.log('\n📧 RENVOI D\'INVITATION');
    console.log('   - Invitation ID:', inviteId);

    // Récupérer l'invitation avec les infos du projet
    const { data: invite, error: inviteError } = await supabase
      .from('invites')
      .select('*, project:projects(id, name, owner_id, contribution_deadline)')
      .eq('id', inviteId)
      .single();

    if (inviteError) {
      console.error('❌ Erreur récupération invitation:', inviteError);
      return res.status(404).json({ error: 'Invitation non trouvée' });
    }

    // Vérifier que l'utilisateur est propriétaire du projet
    if (invite.project.owner_id !== req.user.id) {
      console.error('❌ Non autorisé');
      return res.status(403).json({ error: 'Non autorisé' });
    }

    // Vérifier que la personne n'a pas déjà contribué
    if (invite.contributed) {
      console.error('❌ A déjà contribué');
      return res.status(400).json({ 
        error: 'Cette personne a déjà contribué'
      });
    }

    // Vérifier la date limite
    const deadline = new Date(invite.project.contribution_deadline);
    const now = new Date();
    
    if (now > deadline) {
      console.error('❌ Date limite dépassée');
      return res.status(400).json({ 
        error: 'Date limite dépassée'
      });
    }

    const inviteLink = `${process.env.FRONTEND_URL}/contribute/${invite.token}`;
    
    console.log(`   ✅ Renvoi à ${invite.email}`);
    console.log(`   🔗 Lien: ${inviteLink}`);

    // Mettre à jour la date du dernier rappel
    await supabase
      .from('invites')
      .update({ last_reminder_sent: new Date().toISOString() })
      .eq('id', inviteId);

    res.json({ 
      success: true,
      message: 'Invitation renvoyée avec succès',
      email: invite.email,
      link: inviteLink
    });
    
  } catch (error) {
    console.error('❌ Erreur:', error);
    res.status(500).json({ error: error.message });
  }
};

// ============================================
// SUPPRIMER UNE INVITATION
// ============================================
exports.deleteInvite = async (req, res) => {
  const { inviteId } = req.params;

  try {
    console.log('\n🗑️ SUPPRESSION D\'INVITATION');
    console.log('   - Invitation ID:', inviteId);

    // Vérifier que l'invitation existe et récupérer le projet
    const { data: invite, error: inviteError } = await supabase
      .from('invites')
      .select('*, project:projects(owner_id)')
      .eq('id', inviteId)
      .single();

    if (inviteError) {
      console.error('❌ Erreur récupération invitation:', inviteError);
      return res.status(404).json({ error: 'Invitation non trouvée' });
    }

    // Vérifier que l'utilisateur est propriétaire du projet
    if (invite.project.owner_id !== req.user.id) {
      console.error('❌ Non autorisé');
      return res.status(403).json({ error: 'Non autorisé' });
    }

    // Supprimer l'invitation
    const { error } = await supabase
      .from('invites')
      .delete()
      .eq('id', inviteId);

    if (error) {
      console.error('❌ Erreur suppression:', error);
      return res.status(500).json({ error: error.message });
    }

    console.log('✅ Invitation supprimée');
    res.json({ 
      success: true,
      message: 'Invitation supprimée avec succès' 
    });
    
  } catch (error) {
    console.error('❌ Erreur:', error);
    res.status(500).json({ error: error.message });
  }
};

// ============================================
// STATISTIQUES DES INVITATIONS
// ============================================
exports.getInviteStats = async (req, res) => {
  const { projectId } = req.params;

  try {
    const { data, error } = await supabase
      .from('invites')
      .select('contributed')
      .eq('project_id', projectId);

    if (error) throw error;

    const stats = {
      total: data.length,
      contributed: data.filter(i => i.contributed).length,
      pending: data.filter(i => !i.contributed).length,
      contributionRate: data.length > 0 
        ? Math.round((data.filter(i => i.contributed).length / data.length) * 100) 
        : 0
    };

    res.json(stats);
  } catch (error) {
    console.error('❌ Erreur stats:', error);
    res.status(500).json({ error: error.message });
  }
};