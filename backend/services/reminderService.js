const cron = require('node-cron');
const supabase = require('../config/supabase');
const { sendReminderEmail } = require('./emailService');

// Tâche planifiée : tous les jours à 8h
const startReminderCron = () => {
  cron.schedule('0 8 * * *', async () => {
    console.log('🔔 Vérification des rappels à envoyer...');
    
    try {
      const today = new Date();
      const twoDaysFromNow = new Date();
      twoDaysFromNow.setDate(today.getDate() + 2);

      // Récupérer les projets en cours de collecte
      const { data: projects, error: projectsError } = await supabase
        .from('projects')
        .select('*')
        .eq('status', 'collecting');

      if (projectsError) {
        console.error('Erreur récupération projets:', projectsError);
        return;
      }

      for (const project of projects) {
        const deadline = new Date(project.contribution_deadline);
        const daysUntilDeadline = Math.ceil((deadline - today) / (1000 * 60 * 60 * 24));

        // Envoyer un rappel 2 jours avant la deadline
        if (daysUntilDeadline === 2) {
          await sendRemindersForProject(project);
        }
      }
    } catch (error) {
      console.error('Erreur dans le cron des rappels:', error);
    }
  });

  console.log('✅ Service de rappels démarré');
};

const sendRemindersForProject = async (project) => {
  try {
    // Récupérer les invitations en attente
    const { data: invites, error: invitesError } = await supabase
      .from('invites')
      .select('*')
      .eq('project_id', project.id)
      .eq('contributed', false);

    if (invitesError) {
      console.error('Erreur récupération invitations:', invitesError);
      return;
    }

    console.log(`📧 Envoi de ${invites.length} rappels pour le projet ${project.name}`);

    for (const invite of invites) {
      // Vérifier si un rappel a déjà été envoyé récemment (7 jours)
      if (invite.last_reminder_sent) {
        const lastReminder = new Date(invite.last_reminder_sent);
        const daysSinceLastReminder = Math.ceil((new Date() - lastReminder) / (1000 * 60 * 60 * 24));
        
        if (daysSinceLastReminder < 7) {
          continue; // Ne pas renvoyer si moins de 7 jours
        }
      }

      // Envoyer le rappel
      await sendReminderEmail(
        invite.email,
        project.name,
        project.contribution_deadline,
        invite.token
      );

      // Mettre à jour la date du dernier rappel
      await supabase
        .from('invites')
        .update({ last_reminder_sent: new Date().toISOString() })
        .eq('id', invite.id);

      // Pause pour éviter de surcharger le service d'email
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  } catch (error) {
    console.error('Erreur envoi rappels pour projet:', error);
  }
};

// Fonction pour vérifier les projets terminés et notifier les organisateurs
const checkCompletedProjects = async () => {
  try {
    const today = new Date();

    const { data: projects, error } = await supabase
      .from('projects')
      .select('*, owner:profiles(*)')
      .eq('status', 'collecting')
      .lt('contribution_deadline', today.toISOString());

    if (error) {
      console.error('Erreur récupération projets terminés:', error);
      return;
    }

    for (const project of projects) {
      // Mettre à jour le statut du projet
      await supabase
        .from('projects')
        .update({ status: 'reviewing' })
        .eq('id', project.id);

      // Envoyer un email à l'organisateur
      if (project.owner) {
        const html = `
          <h2>La collecte est terminée !</h2>
          <p>Votre projet "${project.name}" a atteint sa date limite.</p>
          <p>Connectez-vous pour réviser les contributions et générer votre livre.</p>
          <a href="${process.env.FRONTEND_URL}/project/${project.id}/review">Réviser maintenant</a>
        `;

        await sendEmail({
          to: project.owner.email,
          subject: `Collecte terminée - ${project.name}`,
          html
        });
      }
    }
  } catch (error) {
    console.error('Erreur vérification projets terminés:', error);
  }
};

// Lancer la vérification des projets terminés une fois par jour
cron.schedule('0 9 * * *', checkCompletedProjects);

module.exports = { startReminderCron };