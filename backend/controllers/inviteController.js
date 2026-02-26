// C:\Users\USER\bookfete\backend\controllers\inviteController.js
const supabase = require('../config/supabase');
const { v4: uuidv4 } = require('uuid');
const { sendInviteEmail } = require('../services/emailService');

// ============================================
// INVITER À UN CHAPITRE
// ============================================
const inviteToChapter = async (req, res) => {
  const { chapterId, emails, customMessage } = req.body;

  try {
    console.log('\n' + '='.repeat(60));
    console.log('📨 INVITATION À UN CHAPITRE');
    console.log('='.repeat(60));
    console.log('🔹 Chapter ID:', chapterId);
    console.log('🔹 Emails:', emails);

    const { data: chapter, error: chapterError } = await supabase
      .from('chapters')
      .select('*, book:books(*)')
      .eq('id', chapterId)
      .single();

    if (chapterError || !chapter) {
      return res.status(404).json({ error: 'Chapitre non trouvé' });
    }

    if (chapter.book.owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Non autorisé' });
    }

    const invites = [];
    for (const email of emails) {
      const token = uuidv4();
      
      invites.push({
        chapter_id: chapterId,
        email: email.trim().toLowerCase(),
        token,
        contributed: false
      });

      const inviteLink = `${process.env.FRONTEND_URL}/invite/${token}`;
      await sendInviteEmail({
        to: email,
        bookTitle: chapter.book.title,
        chapterTitle: chapter.title,
        inviteLink,
        customMessage
      });
    }

    const { data, error } = await supabase
      .from('chapter_invites')
      .insert(invites)
      .select();

    if (error) {
      console.error('❌ Erreur insertion:', error);
      return res.status(500).json({ error: error.message });
    }

    res.status(201).json({
      success: true,
      message: `${invites.length} invitation(s) envoyée(s)`,
      invites: data
    });

  } catch (error) {
    console.error('❌ Erreur:', error);
    res.status(500).json({ error: error.message });
  }
};

// ============================================
// ENVOI BATCH D'INVITATIONS
// ============================================
const sendBatchInvites = async (req, res) => {
  const { chapterId, contributorIds } = req.body;

  try {
    console.log('\n' + '='.repeat(60));
    console.log('📨 ENVOI BATCH INVITATIONS');
    console.log('='.repeat(60));

    if (!chapterId || !contributorIds || contributorIds.length === 0) {
      return res.status(400).json({ error: 'Paramètres manquants' });
    }

    const { data: chapter, error: chapterError } = await supabase
      .from('chapters')
      .select('*, book:books(*)')
      .eq('id', chapterId)
      .single();

    if (chapterError || !chapter) {
      return res.status(404).json({ error: 'Chapitre non trouvé' });
    }

    if (chapter.book.owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Non autorisé' });
    }

    const { data: contributors, error: contribError } = await supabase
      .from('book_contributors')
      .select('*')
      .in('id', contributorIds);

    if (contribError) {
      console.error('❌ Erreur récupération contributeurs:', contribError);
      return res.status(500).json({ error: contribError.message });
    }

    if (!contributors || contributors.length === 0) {
      return res.status(404).json({ error: 'Aucun contributeur trouvé' });
    }

    const { data: chapterInfo, error: chapterInfoError } = await supabase
      .from('chapters')
      .select('title, book:books(title)')
      .eq('id', chapterId)
      .single();

    const invites = [];
    for (const contributor of contributors) {
      const token = uuidv4();
      
      const { data: existing } = await supabase
        .from('chapter_invites')
        .select('id')
        .eq('chapter_id', chapterId)
        .eq('email', contributor.email)
        .maybeSingle();

      if (existing) {
        console.log(`⚠️ Invitation déjà existante pour ${contributor.email}`);
        continue;
      }

      invites.push({
        chapter_id: chapterId,
        email: contributor.email,
        token,
        contributed: false
      });
    }

    if (invites.length === 0) {
      return res.status(400).json({ error: 'Tous les contributeurs ont déjà été invités' });
    }

    const { data: savedInvites, error: insertError } = await supabase
      .from('chapter_invites')
      .insert(invites)
      .select();

    if (insertError) {
      console.error('❌ Erreur insertion:', insertError);
      return res.status(500).json({ error: insertError.message });
    }

    for (let i = 0; i < savedInvites.length; i++) {
      const invite = savedInvites[i];
      const contributor = contributors.find(c => c.email === invite.email);
      
      const inviteLink = `${process.env.FRONTEND_URL}/invite/${invite.token}`;
      
      await sendInviteEmail({
        to: contributor.email,
        bookTitle: chapterInfo?.book?.title || 'Votre livre',
        chapterTitle: chapterInfo?.title || 'Chapitre',
        inviteLink,
        customMessage: '',
        contributorName: contributor.name
      });
    }

    await supabase
      .from('book_contributors')
      .update({ invited: true })
      .in('id', contributorIds);

    console.log(`✅ ${savedInvites.length} invitation(s) créée(s)`);
    res.json({
      success: true,
      message: `${savedInvites.length} invitation(s) envoyée(s)`,
      invites: savedInvites
    });

  } catch (error) {
    console.error('❌ Erreur:', error);
    res.status(500).json({ error: error.message });
  }
};

// ============================================
// VÉRIFIER UN TOKEN D'INVITATION
// ============================================
const checkInviteToken = async (req, res) => {
  const { token } = req.params;

  try {
    console.log('\n' + '='.repeat(60));
    console.log('🔍 VÉRIFICATION TOKEN');
    console.log('='.repeat(60));
    console.log('🔹 Token:', token);

    const { data: invite, error } = await supabase
      .from('chapter_invites')
      .select('*, chapter:chapters(*, book:books(*))')
      .eq('token', token)
      .single();

    if (error || !invite) {
      console.error('❌ Token non trouvé');
      return res.status(404).json({ error: 'Lien invalide ou expiré' });
    }

    // Vérifier la contribution existante
    const { data: existingContribution } = await supabase
      .from('contributions')
      .select('*')
      .eq('chapter_id', invite.chapter_id)
      .eq('contributor_email', invite.email)
      .maybeSingle();

    // Si une contribution existe et qu'elle n'est PAS approuvée, on autorise la modification
    if (existingContribution) {
      if (existingContribution.approved) {
        return res.status(400).json({ error: 'Cette contribution a déjà été approuvée' });
      }
      
      return res.json({
        valid: true,
        bookTitle: invite.chapter.book.title,
        chapterTitle: invite.chapter.title,
        chapterId: invite.chapter.id,
        email: invite.email,
        eventType: invite.chapter.book.event_type || 'evenement',
        recipientName: invite.chapter.book.recipient_name,
        organizerName: invite.chapter.book.owner_name,
        questions: invite.chapter.questions_validated ? invite.chapter.questions_ia : [],
        questionsValidated: invite.chapter.questions_validated,
        existingContribution: {
          id: existingContribution.id,
          message: existingContribution.message,
          photo_urls: existingContribution.photo_urls,
          needs_revision: existingContribution.needs_revision,
          moderation_feedback: existingContribution.moderation_feedback
        }
      });
    }

    if (invite.contributed) {
      console.log('⚠️ Token déjà utilisé');
      return res.status(400).json({ error: 'Vous avez déjà contribué' });
    }

    res.json({
      valid: true,
      bookTitle: invite.chapter.book.title,
      chapterTitle: invite.chapter.title,
      chapterId: invite.chapter.id,
      email: invite.email,
      eventType: invite.chapter.book.event_type || 'evenement',
      recipientName: invite.chapter.book.recipient_name,
      organizerName: invite.chapter.book.owner_name,
      questions: invite.chapter.questions_validated ? invite.chapter.questions_ia : [],
      questionsValidated: invite.chapter.questions_validated
    });

  } catch (error) {
    console.error('❌ Erreur:', error);
    res.status(500).json({ error: error.message });
  }
};

// ============================================
// UTILISER UN TOKEN (SOUMETTRE UNE CONTRIBUTION)
// ============================================
const useInviteToken = async (req, res) => {
  const { token } = req.params;
  const { name, message, photoUrls, contributionId } = req.body;

  try {
    console.log('\n' + '='.repeat(60));
    console.log('📝 UTILISATION TOKEN');
    console.log('='.repeat(60));
    console.log('🔹 Token:', token);
    console.log('🔹 Nom:', name);
    console.log('🔹 ContributionId:', contributionId);

    const { data: invite, error: inviteError } = await supabase
      .from('chapter_invites')
      .select('*')
      .eq('token', token)
      .single();

    if (inviteError || !invite) {
      return res.status(404).json({ error: 'Lien invalide' });
    }

    // Vérifier s'il y a une contribution existante
    const { data: existingContribution } = await supabase
      .from('contributions')
      .select('*')
      .eq('chapter_id', invite.chapter_id)
      .eq('contributor_email', invite.email)
      .maybeSingle();

    if (existingContribution) {
      // Mise à jour de la contribution existante
      if (existingContribution.approved) {
        return res.status(400).json({ error: 'Cette contribution ne peut plus être modifiée' });
      }

      const { error: updateError } = await supabase
        .from('contributions')
        .update({
          message,
          photo_urls: photoUrls || [],
          needs_revision: false,
          moderation_feedback: null
        })
        .eq('id', existingContribution.id);

      if (updateError) throw updateError;

      return res.json({
        success: true,
        message: 'Contribution mise à jour avec succès'
      });
    }

    // Créer une nouvelle contribution
    const { data: contribution, error: contribError } = await supabase
      .from('contributions')
      .insert([{
        chapter_id: invite.chapter_id,
        contributor_name: name,
        contributor_email: invite.email,
        message,
        photo_urls: photoUrls || [],
        approved: false,
        needs_revision: false
      }])
      .select()
      .single();

    if (contribError) throw contribError;

    // Marquer l'invitation comme utilisée
    await supabase
      .from('chapter_invites')
      .update({ 
        contributed: true, 
        contributed_at: new Date().toISOString() 
      })
      .eq('id', invite.id);

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
const getChapterInvites = async (req, res) => {
  const { chapterId } = req.params;

  try {
    const { data, error } = await supabase
      .from('chapter_invites')
      .select('*')
      .eq('chapter_id', chapterId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const stats = {
      total: data.length,
      contributed: data.filter(i => i.contributed).length,
      pending: data.filter(i => !i.contributed).length
    };

    res.json({ invites: data, stats });

  } catch (error) {
    console.error('❌ Erreur:', error);
    res.status(500).json({ error: error.message });
  }
};

// ============================================
// RENVOYER UNE INVITATION
// ============================================
const resendInvite = async (req, res) => {
  const { inviteId } = req.params;

  try {
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
    
    await sendInviteEmail({
      to: invite.email,
      bookTitle: invite.chapter.book.title,
      chapterTitle: invite.chapter.title,
      inviteLink,
      customMessage: ''
    });

    await supabase
      .from('chapter_invites')
      .update({ last_reminder_sent: new Date().toISOString() })
      .eq('id', inviteId);

    res.json({ 
      success: true,
      message: 'Invitation renvoyée avec succès'
    });

  } catch (error) {
    console.error('❌ Erreur:', error);
    res.status(500).json({ error: error.message });
  }
};

// ============================================
// SUPPRIMER UNE INVITATION
// ============================================
const deleteInvite = async (req, res) => {
  const { inviteId } = req.params;

  try {
    const { error } = await supabase
      .from('chapter_invites')
      .delete()
      .eq('id', inviteId);

    if (error) throw error;

    res.json({ success: true });

  } catch (error) {
    console.error('❌ Erreur:', error);
    res.status(500).json({ error: error.message });
  }
};

// ============================================
// DEBUG : VOIR TOUTES LES INVITATIONS
// ============================================
const debugInvites = async (req, res) => {
  const { token } = req.params;
  
  try {
    console.log('\n' + '='.repeat(60));
    console.log('🔍 DEBUG INVITATIONS');
    console.log('='.repeat(60));
    
    const { data: allInvites, error: allError } = await supabase
      .from('chapter_invites')
      .select('*');
      
    console.log('📋 Toutes les invitations:', allInvites);
    
    const { data: tokenSearch, error: tokenError } = await supabase
      .from('chapter_invites')
      .select('*, chapter:chapters(*)')
      .eq('token', token);
      
    console.log('🔎 Recherche du token:', token);
    console.log('📦 Résultat:', tokenSearch);
    
    res.json({
      total: allInvites?.length || 0,
      allInvites: allInvites || [],
      tokenSearched: token,
      tokenResult: tokenSearch || []
    });
    
  } catch (error) {
    console.error('❌ Erreur debug:', error);
    res.status(500).json({ error: error.message });
  }
};

// ============================================
// DEBUG SIMPLE (sans token)
// ============================================
const debugSimple = async (req, res) => {
  try {
    const { count, error: countError } = await supabase
      .from('chapter_invites')
      .select('*', { count: 'exact', head: true });
    
    const { data: recent, error: recentError } = await supabase
      .from('chapter_invites')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);
    
    const { data: sample, error: sampleError } = await supabase
      .from('chapter_invites')
      .select('*')
      .limit(1);
      
    const columns = sample && sample.length > 0 ? Object.keys(sample[0]) : [];
    
    res.json({
      totalInvitations: count || 0,
      recentInvitations: recent || [],
      columns: columns,
      sample: sample || []
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ============================================
// EXPORTS - VERSION FINALE
// ============================================
module.exports = {
  inviteToChapter,
  sendBatchInvites,
  checkInviteToken,
  useInviteToken,
  getChapterInvites,
  resendInvite,
  deleteInvite,
  debugInvites,
  debugSimple
};