// C:\Users\USER\bookfete\backend\controllers\inviteController.js
const supabase = require('../config/supabase');
const { v4: uuidv4 } = require('uuid');
const { sendInviteEmail } = require('../services/emailService');

// ============================================
// INVITER À UN CHAPITRE
// ============================================
exports.inviteToChapter = async (req, res) => {
  const { chapterId, emails, customMessage } = req.body;

  try {
    console.log('\n' + '='.repeat(60));
    console.log('📨 INVITATION À UN CHAPITRE');
    console.log('='.repeat(60));
    console.log('🔹 Chapter ID:', chapterId);
    console.log('🔹 Emails:', emails);
    console.log('🔹 Utilisateur:', req.user?.id);

    // Vérifier que le chapitre existe
    console.log('🔍 Vérification du chapitre...');
    const { data: chapter, error: chapterError } = await supabase
      .from('chapters')
      .select('*, book:books(*)')
      .eq('id', chapterId)
      .single();

    if (chapterError || !chapter) {
      console.error('❌ Chapitre non trouvé:', chapterError);
      return res.status(404).json({ error: 'Chapitre non trouvé' });
    }

    console.log('✅ Chapitre trouvé:', chapter.title);
    console.log('📖 Livre:', chapter.book.title);

    // Vérifier que l'utilisateur est propriétaire
    if (chapter.book.owner_id !== req.user.id) {
      console.error('❌ Non autorisé - owner:', chapter.book.owner_id, 'user:', req.user.id);
      return res.status(403).json({ error: 'Non autorisé' });
    }

    // Créer les invitations
    const invites = [];
    for (const email of emails) {
      const token = uuidv4();
      console.log(`   - Création invitation pour: ${email}`);
      console.log(`   - Token généré: ${token}`);
      
      invites.push({
        chapter_id: chapterId,
        email: email.trim().toLowerCase(),
        token,
        contributed: false,
        custom_message: customMessage || ''
      });

      // Simuler l'envoi d'email
      const inviteLink = `${process.env.FRONTEND_URL}/invite/${token}`;
      console.log(`   📧 Email à ${email}:`);
      console.log(`   🔗 Lien: ${inviteLink}`);
    }

    console.log('📦 Insertion de', invites.length, 'invitations dans la DB...');
    
    const { data, error } = await supabase
      .from('chapter_invites')
      .insert(invites)
      .select();

    if (error) {
      console.error('❌ Erreur insertion DB:', error);
      return res.status(500).json({ error: error.message });
    }

    console.log('✅', invites.length, 'invitations créées avec succès');
    res.status(201).json({
      success: true,
      message: `${invites.length} invitation(s) envoyée(s)`,
      invites: data
    });

  } catch (error) {
    console.error('❌ Erreur générale:', error);
    res.status(500).json({ error: error.message });
  }
};

// ============================================
// VÉRIFIER UN TOKEN D'INVITATION
// ============================================
exports.checkInviteToken = async (req, res) => {
  const { token } = req.params;

  try {
    console.log('\n' + '='.repeat(60));
    console.log('🔍 VÉRIFICATION TOKEN');
    console.log('='.repeat(60));
    console.log('🔹 Token reçu:', token);

    const { data: invite, error } = await supabase
      .from('chapter_invites')
      .select('*, chapter:chapters(*, book:books(*))')
      .eq('token', token)
      .single();

    if (error || !invite) {
      console.error('❌ Token non trouvé dans la DB');
      console.error('🔍 Erreur SQL:', error);
      return res.status(404).json({ error: 'Lien invalide ou expiré' });
    }

    console.log('✅ Token trouvé!');
    console.log('   📧 Email:', invite.email);
    console.log('   📖 Livre:', invite.chapter.book.title);
    console.log('   📑 Chapitre:', invite.chapter.title);
    console.log('   ✓ Déjà utilisé:', invite.contributed);

    if (invite.contributed) {
      console.log('⚠️ Token déjà utilisé');
      return res.status(400).json({ error: 'Vous avez déjà contribué' });
    }

    // Récupérer les infos personnalisées du livre
    const book = invite.chapter.book;
    
    // Extraire le nom du destinataire depuis le titre (ex: "Anniversaire de Gégé")
    let recipientName = 'la personne';
    if (book.title.toLowerCase().includes('de ')) {
      const parts = book.title.split('de ');
      if (parts.length > 1) {
        recipientName = parts[1].trim();
      }
    }

    // Déterminer le type d'événement
    let eventType = 'événement';
    if (book.event_type) {
      eventType = book.event_type;
    } else if (book.title.toLowerCase().includes('anniversaire')) {
      eventType = 'anniversaire';
    } else if (book.title.toLowerCase().includes('mariage')) {
      eventType = 'mariage';
    } else if (book.title.toLowerCase().includes('départ')) {
      eventType = 'départ';
    } else if (book.title.toLowerCase().includes('retraite')) {
      eventType = 'retraite';
    }

    res.json({
      valid: true,
      bookTitle: book.title,
      chapterTitle: invite.chapter.title,
      chapterId: invite.chapter.id,
      email: invite.email,
      ownerName: book.owner_name || 'Fred', // À ajouter dans la table books plus tard
      recipientName: recipientName,
      eventType: eventType,
      customMessage: invite.custom_message || ''
    });

  } catch (error) {
    console.error('❌ Erreur:', error);
    res.status(500).json({ error: error.message });
  }
};

// ============================================
// UTILISER UN TOKEN (SOUMETTRE UNE CONTRIBUTION)
// ============================================
exports.useInviteToken = async (req, res) => {
  const { token } = req.params;
  const { name, message, photoUrls } = req.body;

  try {
    console.log('\n' + '='.repeat(60));
    console.log('📝 UTILISATION TOKEN');
    console.log('='.repeat(60));
    console.log('🔹 Token:', token);
    console.log('🔹 Nom:', name);
    console.log('🔹 Message:', message);
    console.log('🔹 Photos:', photoUrls?.length || 0);

    // Récupérer l'invitation
    const { data: invite, error: inviteError } = await supabase
      .from('chapter_invites')
      .select('*')
      .eq('token', token)
      .single();

    if (inviteError || !invite) {
      console.error('❌ Invitation non trouvée');
      return res.status(404).json({ error: 'Lien invalide' });
    }

    console.log('✅ Invitation trouvée pour:', invite.email);
    console.log('   Déjà utilisé:', invite.contributed);

    if (invite.contributed) {
      console.log('⚠️ Token déjà utilisé');
      return res.status(400).json({ error: 'Vous avez déjà contribué' });
    }

    // Créer la contribution
    console.log('📦 Création de la contribution...');
    const { data: contribution, error: contribError } = await supabase
      .from('contributions')
      .insert([{
        chapter_id: invite.chapter_id,
        contributor_name: name,
        contributor_email: invite.email,
        message,
        photo_urls: photoUrls || [],
        approved: false
      }])
      .select()
      .single();

    if (contribError) {
      console.error('❌ Erreur création contribution:', contribError);
      throw contribError;
    }

    console.log('✅ Contribution créée avec ID:', contribution.id);

    // Marquer l'invitation comme utilisée
    await supabase
      .from('chapter_invites')
      .update({ 
        contributed: true, 
        contributed_at: new Date().toISOString() 
      })
      .eq('id', invite.id);

    console.log('✅ Invitation marquée comme utilisée');
    
    res.json({
      success: true,
      message: 'Contribution enregistrée avec succès'
    });

  } catch (error) {
    console.error('❌ Erreur:', error);
    res.status(500).json({ error: error.message });
  }
};

// ============================================
// RÉCUPÉRER LES INVITATIONS D'UN CHAPITRE
// ============================================
exports.getChapterInvites = async (req, res) => {
  const { chapterId } = req.params;

  try {
    console.log('📋 Récupération des invitations pour le chapitre:', chapterId);

    const { data, error } = await supabase
      .from('chapter_invites')
      .select('*')
      .eq('chapter_id', chapterId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ Erreur récupération:', error);
      return res.status(500).json({ error: error.message });
    }

    const stats = {
      total: data.length,
      contributed: data.filter(i => i.contributed).length,
      pending: data.filter(i => !i.contributed).length
    };

    res.json({
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
    console.log('📧 Renvoi d\'invitation:', inviteId);

    const { data: invite, error: inviteError } = await supabase
      .from('chapter_invites')
      .select('*, chapter:chapters(*, book:books(*))')
      .eq('id', inviteId)
      .single();

    if (inviteError || !invite) {
      return res.status(404).json({ error: 'Invitation non trouvée' });
    }

    if (invite.contributed) {
      return res.status(400).json({ error: 'Cette personne a déjà contribué' });
    }

    const inviteLink = `${process.env.FRONTEND_URL}/invite/${invite.token}`;
    
    console.log(`   📧 Renvoi d'email à ${invite.email}`);
    console.log(`   🔗 Lien: ${inviteLink}`);
    console.log(`   📝 Projet: ${invite.chapter.book.title}`);

    // Mettre à jour la date du dernier rappel
    await supabase
      .from('chapter_invites')
      .update({ last_reminder_sent: new Date().toISOString() })
      .eq('id', inviteId);

    res.json({ 
      success: true,
      message: 'Invitation renvoyée avec succès',
      email: invite.email
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
    console.log('🗑️ Suppression d\'invitation:', inviteId);

    const { data: invite, error: inviteError } = await supabase
      .from('chapter_invites')
      .select('*, chapter:chapters(book:books(owner_id))')
      .eq('id', inviteId)
      .single();

    if (inviteError || !invite) {
      return res.status(404).json({ error: 'Invitation non trouvée' });
    }

    // Vérifier que l'utilisateur est propriétaire du livre
    if (invite.chapter.book.owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Non autorisé' });
    }

    const { error } = await supabase
      .from('chapter_invites')
      .delete()
      .eq('id', inviteId);

    if (error) {
      console.error('❌ Erreur suppression:', error);
      return res.status(500).json({ error: error.message });
    }

    console.log('✅ Invitation supprimée avec succès');
    res.json({ 
      success: true,
      message: 'Invitation supprimée avec succès' 
    });

  } catch (error) {
    console.error('❌ Erreur:', error);
    res.status(500).json({ error: error.message });
  }
};