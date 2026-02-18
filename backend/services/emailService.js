const supabase = require('../config/supabase');

// Version avec Resend (recommandé)
let resend;
try {
  const { Resend } = require('resend');
  if (process.env.RESEND_API_KEY) {
    resend = new Resend(process.env.RESEND_API_KEY);
  }
} catch (error) {
  console.log('Resend non installé, utilisation du mode debug');
}

const sendEmail = async ({ to, subject, html, from = 'Mémoire Collective <noreply@memoire-collective.fr>' }) => {
  // Mode développement : logger l'email
  if (process.env.NODE_ENV !== 'production') {
    console.log('=================================');
    console.log(`📧 EMAIL envoyé à: ${to}`);
    console.log(`Sujet: ${subject}`);
    console.log(`Contenu: ${html.substring(0, 200)}...`);
    console.log('=================================');
    return { success: true, debug: true };
  }

  // Mode production avec Resend
  if (resend) {
    try {
      const { data, error } = await resend.emails.send({
        from,
        to,
        subject,
        html
      });

      if (error) {
        console.error('Erreur Resend:', error);
        return { success: false, error };
      }

      return { success: true, data };
    } catch (error) {
      console.error('Erreur envoi email:', error);
      return { success: false, error };
    }
  }

  // Fallback : logger l'email
  console.log(`📧 EMAIL (production - pas de service configuré) à: ${to}`);
  return { success: true, fallback: true };
};

// Fonction pour envoyer un email de bienvenue
const sendWelcomeEmail = async (email, name) => {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #764ba2; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; }
        .button { 
          display: inline-block; 
          padding: 12px 24px; 
          background: #764ba2; 
          color: white; 
          text-decoration: none; 
          border-radius: 5px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Bienvenue sur Mémoire Collective !</h1>
        </div>
        <div class="content">
          <p>Bonjour ${name || email},</p>
          <p>Nous sommes ravis de vous accueillir sur Mémoire Collective.</p>
          <p>Vous pouvez dès maintenant créer votre premier projet de livre souvenir.</p>
          <div style="text-align: center;">
            <a href="${process.env.FRONTEND_URL}/create-project" class="button">
              Créer mon premier projet
            </a>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({
    to: email,
    subject: 'Bienvenue sur Mémoire Collective',
    html
  });
};

// Fonction pour envoyer une notification de nouvelle contribution
const sendNewContributionEmail = async (organizerEmail, projectName, contributorEmail) => {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #28a745; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Nouvelle contribution !</h1>
        </div>
        <div class="content">
          <p>Bonjour,</p>
          <p><strong>${contributorEmail}</strong> vient de contribuer à votre projet :</p>
          <h2>${projectName}</h2>
          <p>Connectez-vous pour voir sa contribution.</p>
          <div style="text-align: center;">
            <a href="${process.env.FRONTEND_URL}/dashboard" style="color: #764ba2;">
              Voir mon tableau de bord
            </a>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({
    to: organizerEmail,
    subject: `Nouvelle contribution - ${projectName}`,
    html
  });
};

// Fonction pour envoyer un rappel aux contributeurs
const sendReminderEmail = async (email, projectName, deadline, token) => {
  const daysLeft = Math.ceil((new Date(deadline) - new Date()) / (1000 * 60 * 60 * 24));
  const inviteLink = `${process.env.FRONTEND_URL}/contribute/${token}`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #ffc107; color: #333; padding: 20px; text-align: center; }
        .content { padding: 20px; }
        .button { 
          display: inline-block; 
          padding: 12px 24px; 
          background: #764ba2; 
          color: white; 
          text-decoration: none; 
          border-radius: 5px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Rappel : Contribuez au projet !</h1>
        </div>
        <div class="content">
          <p>Bonjour,</p>
          <p>Vous avez été invité à contribuer au projet :</p>
          <h2>${projectName}</h2>
          <p><strong>Plus que ${daysLeft} jour${daysLeft > 1 ? 's' : ''} pour participer !</strong></p>
          <p>Date limite : ${new Date(deadline).toLocaleDateString('fr-FR')}</p>
          <div style="text-align: center;">
            <a href="${inviteLink}" class="button">Ajouter ma contribution</a>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({
    to: email,
    subject: `Rappel : Contribuez à ${projectName}`,
    html
  });
};

// Fonction pour envoyer une notification de projet terminé
const sendProjectCompletedEmail = async (email, projectName, orderLink) => {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #28a745; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Votre livre est prêt !</h1>
        </div>
        <div class="content">
          <p>Bonjour,</p>
          <p>Le livre pour votre projet <strong>${projectName}</strong> a été généré.</p>
          <p>Vous pouvez maintenant choisir une maquette et commander votre exemplaire.</p>
          <div style="text-align: center;">
            <a href="${orderLink}" style="color: #764ba2;">
              Personnaliser et commander
            </a>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({
    to: email,
    subject: `Votre livre ${projectName} est prêt !`,
    html
  });
};

module.exports = { 
  sendEmail,
  sendWelcomeEmail,
  sendNewContributionEmail,
  sendReminderEmail,
  sendProjectCompletedEmail
};