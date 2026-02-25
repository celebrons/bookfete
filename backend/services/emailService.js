// C:\Users\USER\bookfete\backend\services\emailService.js
const nodemailer = require('nodemailer');

// Tentative d'import de nodemailer (peut échouer en développement)
let transporter = null;

// Configuration du transporteur UNIQUEMENT si toutes les variables sont présentes
if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
  try {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT || 587,
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      },
      // Timeouts plus longs pour Render
      connectionTimeout: 30000,
      greetingTimeout: 30000,
      socketTimeout: 30000,
      // Désactiver la vérification TLS en cas de problème
      tls: {
        rejectUnauthorized: false
      }
    });
    console.log('📧 Transporteur SMTP configuré avec succès');
  } catch (error) {
    console.log('📧 Erreur configuration SMTP:', error.message);
    console.log('📧 Mode simulation uniquement');
  }
} else {
  console.log('📧 Mode simulation - emails non configurés');
}

/**
 * Envoie un email d'invitation
 */
const sendInviteEmail = async ({ to, bookTitle, chapterTitle, inviteLink, customMessage }) => {
  
  // Template HTML commun
  const htmlTemplate = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 0 auto; background: #f5f5f5; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px 20px; text-align: center; }
        .header h1 { margin: 0; font-size: 28px; font-weight: 600; }
        .content { padding: 30px 20px; background: white; }
        .book-title { font-size: 24px; color: #764ba2; margin-bottom: 10px; font-weight: 600; }
        .chapter-title { font-size: 18px; color: #666; margin-bottom: 20px; }
        .message { background: #f8f9fa; padding: 15px; border-left: 4px solid #764ba2; margin: 20px 0; font-style: italic; }
        .button { 
          display: inline-block; 
          padding: 14px 28px; 
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
          color: white; 
          text-decoration: none; 
          border-radius: 50px;
          margin: 20px 0;
          font-weight: 500;
          box-shadow: 0 4px 10px rgba(118, 75, 162, 0.3);
        }
        .footer { padding: 20px; text-align: center; color: #999; font-size: 12px; border-top: 1px solid #e9ecef; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>📚 Mémoire Collective</h1>
        </div>
        <div class="content">
          <h2 style="margin-top: 0;">Vous êtes invité à contribuer !</h2>
          
          <p style="font-size: 16px;">Bonjour,</p>
          
          <p style="font-size: 16px;">Vous avez été invité à contribuer au livre :</p>
          
          <div class="book-title">📖 ${bookTitle}</div>
          <div class="chapter-title">Chapitre : <strong>${chapterTitle}</strong></div>
          
          ${customMessage ? `
            <div class="message">
              <strong>Message personnel :</strong><br>
              "${customMessage}"
            </div>
          ` : ''}
          
          <div style="text-align: center;">
            <a href="${inviteLink}" class="button">
              ✨ Ajouter ma contribution
            </a>
          </div>
          
          <p style="color: #666; font-size: 14px; margin-top: 30px;">
            Vous pourrez partager vos souvenirs et ajouter jusqu'à 2 photos.
          </p>
        </div>
        <div class="footer">
          <p>© ${new Date().getFullYear()} Mémoire Collective - Tous droits réservés</p>
          <p style="margin-top: 5px;">
            <small>Cet email a été envoyé suite à une invitation sur la plateforme Mémoire Collective.</small>
          </p>
        </div>
      </div>
    </body>
    </html>
  `;

  // Si on a un transporteur configuré, on envoie un vrai email
  if (transporter) {
    try {
      console.log('📧 Tentative d\'envoi d\'email réel à:', to);
      
      const mailOptions = {
        from: `"Mémoire Collective" <${process.env.SMTP_USER}>`,
        to,
        subject: `✨ ${bookTitle} - Vous êtes invité à contribuer !`,
        html: htmlTemplate
      };

      const info = await transporter.sendMail(mailOptions);
      console.log('✅ Email réel envoyé avec succès:', info.messageId);
      return { success: true, messageId: info.messageId };
      
    } catch (error) {
      console.error('❌ Erreur envoi email réel:', error.message);
      console.log('📧 Fallback vers mode simulation');
      
      // En cas d'erreur, on log mais on ne bloque pas
      console.log('\n' + '='.repeat(60));
      console.log('📧 [SIMULATION - Échec réel] Email aurait été envoyé à:', to);
      console.log('Sujet:', `✨ ${bookTitle} - Vous êtes invité à contribuer !`);
      console.log('Livre:', bookTitle);
      console.log('Chapitre:', chapterTitle);
      console.log('Lien:', inviteLink);
      console.log('='.repeat(60) + '\n');
      
      return { success: true, simulated: true };
    }
  } 
  
  // Mode simulation (par défaut)
  console.log('\n' + '='.repeat(60));
  console.log('📧 [SIMULATION] Email envoyé');
  console.log('='.repeat(60));
  console.log(`À: ${to}`);
  console.log(`Sujet: ✨ ${bookTitle} - Vous êtes invité à contribuer !`);
  console.log(`Livre: ${bookTitle}`);
  console.log(`Chapitre: ${chapterTitle}`);
  console.log(`Lien: ${inviteLink}`);
  if (customMessage) console.log(`Message: ${customMessage}`);
  console.log('='.repeat(60) + '\n');
  
  return { success: true, simulated: true };
};

/**
 * Envoie une notification de nouvelle contribution
 */
const sendNewContributionEmail = async ({ to, bookTitle, chapterTitle, contributorName }) => {
  
  if (transporter) {
    try {
      const mailOptions = {
        from: `"Mémoire Collective" <${process.env.SMTP_USER}>`,
        to,
        subject: `✨ Nouvelle contribution - ${bookTitle}`,
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <style>
              body { font-family: 'Inter', sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px 20px; text-align: center; border-radius: 10px 10px 0 0; }
              .content { padding: 30px 20px; background: white; border: 1px solid #e9ecef; border-top: none; border-radius: 0 0 10px 10px; }
              .button { 
                display: inline-block; 
                padding: 12px 24px; 
                background: #764ba2; 
                color: white; 
                text-decoration: none; 
                border-radius: 5px;
                margin: 20px 0;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1 style="margin:0;">✨ Nouvelle contribution !</h1>
              </div>
              <div class="content">
                <p>Bonjour,</p>
                <p><strong>${contributorName}</strong> vient de contribuer au chapitre :</p>
                <h3 style="color:#764ba2;">${chapterTitle}</h3>
                <p>du livre <strong>${bookTitle}</strong>.</p>
                <p>Connectez-vous pour voir sa contribution et l'approuver.</p>
                <div style="text-align: center;">
                  <a href="${process.env.FRONTEND_URL || 'https://bookfete-front.onrender.com'}" class="button">
                    Voir la contribution
                  </a>
                </div>
              </div>
            </div>
          </body>
          </html>
        `
      };

      await transporter.sendMail(mailOptions);
      console.log('✅ Notification envoyée à:', to);
      
    } catch (error) {
      console.error('❌ Erreur envoi notification:', error.message);
      console.log(`📧 [SIMULATION] Notification à ${to}: ${contributorName} a contribué`);
    }
  } else {
    console.log(`📧 [SIMULATION] Notification à ${to}: ${contributorName} a contribué`);
  }
};

module.exports = {
  sendInviteEmail,
  sendNewContributionEmail
};