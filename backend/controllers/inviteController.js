// C:\Users\USER\bookfete\backend\controllers\inviteController.js
const supabase = require('../config/supabase');
const { v4: uuidv4 } = require('uuid');
const { sendInviteEmail } = require('../services/emailService');

const CHAPTER_STATE_EMAIL = '__chapter_state__@system.local';

const areContributionsClosed = (workflowState) =>
  workflowState === 'contributions_closed' || workflowState === 'closed';

const getChapterWorkflowState = async (chapterId) => {
  const { data, error } = await supabase
    .from('contributions')
    .select('message')
    .eq('chapter_id', chapterId)
    .eq('contributor_email', CHAPTER_STATE_EMAIL)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data?.message || null;
};

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

    const workflowState = await getChapterWorkflowState(invite.chapter_id);

    if (areContributionsClosed(workflowState)) {
      return res.status(400).json({
        error: 'Les contributions pour ce chapitre sont closes'
      });
    }

    const { data: organizerProfile } = await supabase
      .from('profiles')
      .select('full_name, email')
      .eq('id', invite.chapter.book.owner_id)
      .maybeSingle();

    const organizerName = organizerProfile?.full_name
      || organizerProfile?.email?.split('@')[0]
      || "L'organisateur";

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

      if (existingContribution.is_finalized && !existingContribution.needs_revision) {
        return res.status(400).json({
          error: 'Cette contribution a déjà été envoyée et ne peut plus être modifiée'
        });
      }
      
      const amorceReady = Boolean(invite.chapter.amorce_validated || invite.chapter.questions_validated);
      return res.json({
        valid: true,
        bookTitle: invite.chapter.book.title,
        chapterTitle: invite.chapter.title,
        chapterId: invite.chapter.id,
        email: invite.email,
        eventType: invite.chapter.book.event_type || 'evenement',
        recipientName: invite.chapter.book.recipient_name,
        organizerName,
        amorceText: amorceReady ? invite.chapter.amorce_text : '',
        triggers: amorceReady && Array.isArray(invite.chapter.triggers)
          ? invite.chapter.triggers
          : [],
        amorceValidated: amorceReady,
        existingContribution: {
          id: existingContribution.id,
          message: existingContribution.message,
          photo_urls: existingContribution.photo_urls,
          is_finalized: existingContribution.is_finalized,
          needs_revision: existingContribution.needs_revision,
          moderation_feedback: existingContribution.moderation_feedback
        }
      });
    }

    if (invite.contributed) {
      console.log('⚠️ Token déjà utilisé');
      return res.status(400).json({ error: 'Vous avez déjà contribué' });
    }

    const amorceReady = Boolean(invite.chapter.amorce_validated || invite.chapter.questions_validated);
    res.json({
      valid: true,
      bookTitle: invite.chapter.book.title,
      chapterTitle: invite.chapter.title,
      chapterId: invite.chapter.id,
      email: invite.email,
      eventType: invite.chapter.book.event_type || 'evenement',
      recipientName: invite.chapter.book.recipient_name,
      organizerName,
      amorceText: amorceReady ? invite.chapter.amorce_text : '',
      triggers: amorceReady && Array.isArray(invite.chapter.triggers)
        ? invite.chapter.triggers
        : [],
      amorceValidated: amorceReady
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
  const { name, message, photoUrls, contributionId, isDraft } = req.body;
  const isFinalized = !isDraft;

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

    const workflowState = await getChapterWorkflowState(invite.chapter_id);

    if (areContributionsClosed(workflowState)) {
      return res.status(400).json({
        error: 'Les contributions pour ce chapitre sont closes'
      });
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

      if (existingContribution.is_finalized && !existingContribution.needs_revision) {
        return res.status(400).json({
          error: 'Cette contribution a déjà été envoyée et ne peut plus être modifiée'
        });
      }

      const { data: updatedContribution, error: updateError } = await supabase
        .from('contributions')
        .update({
          message,
          photo_urls: photoUrls || [],
          is_finalized: isFinalized,
          needs_revision: false,
          moderation_feedback: null
        })
        .eq('id', existingContribution.id)
        .select()
        .single();

      if (updateError) throw updateError;

      await supabase
        .from('chapter_invites')
        .update({
          contributed: isFinalized,
          contributed_at: isFinalized ? new Date().toISOString() : null
        })
        .eq('id', invite.id);

      return res.json({
        success: true,
        message: isFinalized
          ? 'Contribution mise à jour avec succès'
          : 'Brouillon sauvegardé avec succès',
        contributionId: updatedContribution.id,
        isDraft: !isFinalized
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
        is_finalized: isFinalized,
        needs_revision: false
      }])
      .select()
      .single();

    if (contribError) throw contribError;

    // Marquer l'invitation comme utilisée
    await supabase
      .from('chapter_invites')
      .update({ 
        contributed: isFinalized, 
        contributed_at: isFinalized ? new Date().toISOString() : null
      })
      .eq('id', invite.id);

    res.json({
      success: true,
      message: isFinalized
        ? 'Contribution enregistrée avec succès'
        : 'Brouillon sauvegardé avec succès',
      contributionId: contribution.id,
      isDraft: !isFinalized
    });

  } catch (error) {
    console.error('❌ Erreur:', error);
    res.status(500).json({ error: error.message });
  }
};

// ============================================
// DEMANDER UNE MODIFICATION
// ============================================
const requestRevision = async (req, res) => {
  const { contributionId, feedback } = req.body;

  try {
    if (!contributionId || !feedback || !feedback.trim()) {
      return res.status(400).json({ error: 'Paramètres manquants' });
    }

    const { data: contribution, error: contributionError } = await supabase
      .from('contributions')
      .select(`
        *,
        chapter:chapters(
          id,
          title,
          book:books(
            id,
            title,
            owner_id
          )
        )
      `)
      .eq('id', contributionId)
      .single();

    if (contributionError || !contribution) {
      return res.status(404).json({ error: 'Contribution introuvable' });
    }

    if (contribution.chapter?.book?.owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Non autorisé' });
    }

    const { data: invite, error: inviteError } = await supabase
      .from('chapter_invites')
      .select('*')
      .eq('chapter_id', contribution.chapter_id)
      .eq('email', contribution.contributor_email)
      .maybeSingle();

    if (inviteError) {
      throw inviteError;
    }

    const { error: updateContributionError } = await supabase
      .from('contributions')
      .update({
        needs_revision: true,
        moderation_feedback: feedback.trim(),
        approved: false,
        is_finalized: false
      })
      .eq('id', contributionId);

    if (updateContributionError) {
      throw updateContributionError;
    }

    if (invite) {
      const { error: updateInviteError } = await supabase
        .from('chapter_invites')
        .update({
          contributed: false,
          contributed_at: null
        })
        .eq('id', invite.id);

      if (updateInviteError) {
        throw updateInviteError;
      }
    }

    const inviteLink = invite
      ? `${process.env.FRONTEND_URL}/invite/${invite.token}`
      : null;

    if (invite && inviteLink) {
      await sendInviteEmail({
        to: contribution.contributor_email,
        bookTitle: contribution.chapter?.book?.title || 'Votre livre',
        chapterTitle: contribution.chapter?.title || 'Chapitre',
        inviteLink,
        customMessage: `Modification demandée : ${feedback.trim()}`
      });
    }

    res.json({
      success: true,
      message: 'Demande de modification envoyée',
      inviteLink
    });
  } catch (error) {
    console.error('❌ Erreur demande de modification:', error);
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

    const workflowState = await getChapterWorkflowState(invite.chapter_id);

    if (areContributionsClosed(workflowState)) {
      return res.status(400).json({ error: 'Les contributions pour ce chapitre sont closes' });
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
// EXPORTS - VERSION FINALE
// ============================================
module.exports = {
  inviteToChapter,
  sendBatchInvites,
  checkInviteToken,
  useInviteToken,
  requestRevision,
  getChapterInvites,
  resendInvite,
  deleteInvite
};
