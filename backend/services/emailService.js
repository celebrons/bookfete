// C:\Users\USER\bookfete\backend\services\emailService.js
const supabase = require('../config/supabase');

// Tentative d'import de nodemailer (peut échouer en développement)
let nodemailer;
try {
  nodemailer = require('nodemailer');
  console.log('📧 Nodemailer chargé avec succès');
} catch (error) {
  console.log('📧 Nodemailer non installé, utilisation du mode debug');
}

// Configuration du transporteur (uniquement si nodemailer est disponible)
let transporter;
if (nodemailer && process.env.NODE_ENV === 'production') {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: process.env.SMTP_PORT || 587,
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
}

/**
 * Envoie un email d'invitation
 */
exports.sendInviteEmail = async ({ to, bookTitle, chapterTitle, inviteLink, customMessage }) => {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { padding: 20px; background: #f9f9f9; border: 1px solid #ddd; border-top: none; }
        .button { 
          display: inline-block; 
          padding: 12px 24px; 
          background: #764ba2; 
          color: white; 
          text-decoration: none; 
          border-radius: 5px;
          margin: 20px 0;
        }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>📚 Mémoire Collective</h1>
        </div>
        <div class="content">
          <h2>Vous êtes invité à contribuer !</h2>
          
          <p>Bonjour,</p>
          
          <p>Vous avez été invité à contribuer au livre :</p>
          <h3>📖 ${bookTitle}</h3>
          <p>Chapitre : <strong>${chapterTitle}</strong></p>
          
          ${customMessage ? `<p><em>Message personnel :<br>${customMessage}</em></p>` : ''}
          
          <div style="text-align: center;">
            <a href="${inviteLink}" class="button">✨ Ajouter ma contribution</a>
          </div>
          
          <p>Vous pourrez :</p>
          <ul>
            <li>Partager un souvenir ou un message</li>
            <li>Ajouter jusqu'à 2 photos</li>
            <li>Répondre aux questions suggérées</li>
          </ul>
        </div>
        <div class="footer">
          <p>Ce lien est personnel et ne peut être utilisé qu'une seule fois.</p>
          <p>© ${new Date().getFullYear()} Mémoire Collective</p>
        </div>
      </div>
    </body>
    </html>
  `;

  // En production, envoyer vraiment l'email
  if (process.env.NODE_ENV === 'production' && transporter) {
    try {
      const mailOptions = {
        from: '"Mémoire Collective" <invitations@memoire-collective.fr>',
        to,
        subject: `Invitation à contribuer : ${bookTitle}`,
        html
      };

      const info = await transporter.sendMail(mailOptions);
      console.log('📧 Email envoyé:', info.messageId);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error('❌ Erreur envoi email:', error);
      return { success: false, error: error.message };
    }
  } 
  // En développement, logger seulement
  else {
    console.log('\n' + '='.repeat(60));
    console.log('📧 EMAIL SIMULÉ');
    console.log('='.repeat(60));
    console.log(`À: ${to}`);
    console.log(`Sujet: Invitation à contribuer : ${bookTitle}`);
    console.log(`Livre: ${bookTitle}`);
    console.log(`Chapitre: ${chapterTitle}`);
    console.log(`Lien: ${inviteLink}`);
    if (customMessage) console.log(`Message: ${customMessage}`);
    console.log('='.repeat(60) + '\n');
    
    return { success: true, simulated: true };
  }
};

/**
 * Envoie un email de notification de nouvelle contribution
 */
exports.sendNewContributionEmail = async ({ to, bookTitle, chapterTitle, contributorName }) => {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>✨ Nouvelle contribution !</h1>
        </div>
        <div class="content">
          <p>Bonjour,</p>
          <p><strong>${contributorName}</strong> vient de contribuer au chapitre :</p>
          <h3>${chapterTitle}</h3>
          <p>du livre <strong>${bookTitle}</strong>.</p>
          <p>Connectez-vous pour voir sa contribution et l'approuver.</p>
          <div style="text-align: center; margin-top: 30px;">
            <a href="${process.env.FRONTEND_URL}/book/${bookTitle}" style="background: #764ba2; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
              Voir la contribution
            </a>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;

  if (process.env.NODE_ENV === 'production' && transporter) {
    try {
      const mailOptions = {
        from: '"Mémoire Collective" <notifications@memoire-collective.fr>',
        to,
        subject: `Nouvelle contribution - ${bookTitle}`,
        html
      };
      await transporter.sendMail(mailOptions);
    } catch (error) {
      console.error('❌ Erreur envoi notification:', error);
    }
  } else {
    console.log(`📧 [SIMULATION] Notification à ${to}: ${contributorName} a contribué`);
  }
};