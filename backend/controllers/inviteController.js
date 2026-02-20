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
    console.log('📨 Invitation à un chapitre:', { chapterId, emails });

    // Vérifier que le chapitre existe et récupérer les infos du livre
    const { data: chapter, error: chapterError } = await supabase
      .from('chapters')
      .select('*, book:books(*)')
      .eq('id', chapterId)
      .single();

    if (chapterError || !chapter) {
      return res.status(404).json({ error: 'Chapitre non trouvé' });
    }

    // Vérifier que l'utilisateur est propriétaire du livre
    if (chapter.book.owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Non autorisé' });
    }

    // Créer les invitations avec tokens uniques
    const invites = [];
    for (const email of emails) {
      const token = uuidv4();
      
      invites.push({
        chapter_id: chapterId,
        email: email.trim().toLowerCase(),
        token,
        contributed: false
      });

      // Envoyer l'email
      const inviteLink = `${process.env.FRONTEND_URL}/invite/${token}`;
      await sendInviteEmail({
        to: email,
        bookTitle: chapter.book.title,
        chapterTitle: chapter.title,
        inviteLink,
        customMessage
      });
    }

    // Insérer en base
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
// VÉRIFIER UN TOKEN D'INVITATION
// ============================================
exports.checkInviteToken = async (req, res) => {
  const { token } = req.params;

  try {
    const { data: invite, error } = await supabase
      .from('chapter_invites')
      .select('*, chapter:chapters(*, book:books(*))')
      .eq('token', token)
      .single();

    if (error || !invite) {
      return res.status(404).json({ error: 'Lien invalide ou expiré' });
    }

    if (invite.contributed) {
      return res.status(400).json({ error: 'Vous avez déjà contribué' });
    }

    res.json({
      valid: true,
      bookTitle: invite.chapter.book.title,
      chapterTitle: invite.chapter.title,
      chapterId: invite.chapter.id,
      email: invite.email
    });

  } catch (error) {
    console.error('❌ Erreur:', error);
    res.status(500).json({ error: error.message });
  }
};

// ============================================
// UTILISER UN TOKEN (soumettre contribution)
// ============================================
exports.useInviteToken = async (req, res) => {
  const { token } = req.params;
  const { name, message, photoUrls } = req.body;

  try {
    // Récupérer l'invitation
    const { data: invite, error: inviteError } = await supabase
      .from('chapter_invites')
      .select('*')
      .eq('token', token)
      .single();

    if (inviteError || !invite) {
      return res.status(404).json({ error: 'Lien invalide' });
    }

    if (invite.contributed) {
      return res.status(400).json({ error: 'Vous avez déjà contribué' });
    }

    // Créer la contribution
    const { data: contribution, error: contribError } = await supabase
      .from('contributions')
      .insert([{
        chapter_id: invite.chapter_id,
        contributor_name: name,
        contributor_email: invite.email,
        message,
        photo_urls: photoUrls,
        approved: false
      }])
      .select()
      .single();

    if (contribError) throw contribError;

    // Marquer l'invitation comme utilisée
    await supabase
      .from('chapter_invites')
      .update({ contributed: true, contributed_at: new Date().toISOString() })
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