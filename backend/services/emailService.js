// C:\Users\USER\bookfete\backend\services\emailService.js
const nodemailer = require('nodemailer');

// Configuration pour Resend (ou autre service)
let transporter;

if (process.env.NODE_ENV === 'production') {
  // En production, utiliser un vrai service
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: true,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
} else {
  // En développement, logger seulement
  console.log('📧 Mode développement - emails simulés');
}

exports.sendInviteEmail = async ({ to, bookTitle, chapterTitle, inviteLink, customMessage }) => {
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
        </div>
      </div>
    </body>
    </html>
  `;

  if (process.env.NODE_ENV === 'production') {
    // Envoyer vraiment l'email
    await transporter.sendMail({
      from: '"Mémoire Collective" <invitations@memoire-collective.fr>',
      to,
      subject: `Invitation à contribuer : ${bookTitle}`,
      html
    });
  } else {
    // En développement, logger
    console.log('\n' + '='.repeat(60));
    console.log('📧 EMAIL SIMULÉ');
    console.log('='.repeat(60));
    console.log(`À: ${to}`);
    console.log(`Sujet: Invitation à contribuer : ${bookTitle}`);
    console.log(`Lien: ${inviteLink}`);
    console.log('='.repeat(60) + '\n');
  }
};