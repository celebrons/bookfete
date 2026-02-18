// C:\Users\USER\bookfete\backend\services\pdfService.js
const PDFDocument = require('pdfkit');
const fetch = require('node-fetch');  // ← Maintenant ça va fonctionner
// const fs = require('fs');  // Commentez si non utilisé
// const path = require('path');  // Commentez si non utilisé

const generatePDF = async (project, contributions) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margins: {
          top: 50,
          bottom: 50,
          left: 50,
          right: 50
        },
        info: {
          Title: project.name,
          Author: 'Mémoire Collective',
          Subject: 'Livre souvenir collaboratif',
          Keywords: 'souvenirs, photos, livre',
          CreationDate: new Date()
        }
      });

      const buffers = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      // Page de garde
      generateCoverPage(doc, project);

      // Introduction
      generateIntroductionPage(doc, project);

      // Contributions
      contributions.forEach((contribution, index) => {
        generateContributionPage(doc, contribution, index + 1);
      });

      // Page de remerciements
      generateThanksPage(doc, contributions.length);

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
};

const generateCoverPage = (doc, project) => {
  // Fond de couverture
  doc.rect(0, 0, doc.page.width, doc.page.height)
     .fill('#764ba2');

  // Titre
  doc.fontSize(36)
     .fillColor('white')
     .font('Helvetica-Bold')
     .text(project.name, 50, 200, {
       align: 'center',
       width: doc.page.width - 100
     });

  // Type d'événement
  doc.fontSize(18)
     .fillColor('rgba(255,255,255,0.8)')
     .font('Helvetica')
     .text(getProjectTypeLabel(project.type), {
       align: 'center',
       width: doc.page.width - 100
     });

  // Date
  doc.fontSize(14)
     .fillColor('white')
     .text(`Créé le ${new Date().toLocaleDateString('fr-FR')}`, {
       align: 'center',
       width: doc.page.width - 100
     });
};

const generateIntroductionPage = (doc, project) => {
  doc.addPage();

  doc.fontSize(24)
     .fillColor('#764ba2')
     .font('Helvetica-Bold')
     .text('Introduction', { align: 'center' });

  doc.moveDown(2);

  doc.fontSize(12)
     .fillColor('#333')
     .font('Helvetica')
     .text(project.description || 'Un livre souvenir rempli de moments précieux.', {
       align: 'left',
       lineGap: 5
     });

  doc.moveDown(2);

  doc.fontSize(10)
     .fillColor('#666')
     .text(`Projet créé par l'organisateur`, {
       align: 'right'
     });
};

const generateContributionPage = (doc, contribution, index) => {
  doc.addPage();

  // En-tête avec le numéro de contribution
  doc.fontSize(14)
     .fillColor('#764ba2')
     .font('Helvetica-Bold')
     .text(`Contribution #${index}`, { align: 'right' });

  doc.moveDown();

  // Email du contributeur
  doc.fontSize(10)
     .fillColor('#666')
     .font('Helvetica')
     .text(`De : ${contribution.contributor_email}`, { align: 'right' });

  doc.moveDown(2);

  // Message
  if (contribution.message) {
    doc.fontSize(12)
       .fillColor('#333')
       .font('Helvetica')
       .text(contribution.message, {
         align: 'left',
         lineGap: 5,
         paragraphGap: 10
       });
  }

  // Photos
  if (contribution.photo_urls && contribution.photo_urls.length > 0) {
    doc.moveDown(2);
    
    doc.fontSize(10)
       .fillColor('#666')
       .text('Photos :', { align: 'left' });

    doc.moveDown();

    // Afficher les photos (simulé ici)
    contribution.photo_urls.forEach((url, idx) => {
      doc.fontSize(8)
         .fillColor('#999')
         .text(`📷 Photo ${idx + 1}`, { align: 'left' });
    });
  }

  // Date
  doc.moveDown(2);
  doc.fontSize(8)
     .fillColor('#999')
     .text(`Ajouté le ${new Date(contribution.created_at).toLocaleDateString('fr-FR')}`, {
       align: 'right'
     });
};

const generateThanksPage = (doc, totalContributions) => {
  doc.addPage();

  doc.fontSize(30)
     .fillColor('#764ba2')
     .font('Helvetica-Bold')
     .text('Merci !', { align: 'center' });

  doc.moveDown(3);

  doc.fontSize(16)
     .fillColor('#333')
     .text(`Ce livre a été réalisé grâce à la participation de ${totalContributions} contributeur${totalContributions > 1 ? 's' : ''}.`, {
       align: 'center',
       width: doc.page.width - 100
     });

  doc.moveDown(2);

  doc.fontSize(12)
     .fillColor('#666')
     .text('Chaque message, chaque photo a contribué à créer ce souvenir unique.', {
       align: 'center'
     });
};

const getProjectTypeLabel = (type) => {
  const types = {
    pot_depart: 'Pot de départ',
    fin_projet: 'Fin de projet',
    mariage: 'Mariage',
    vacances: 'Souvenirs de vacances',
    anniversaire: 'Anniversaire',
    retraite: 'Départ en retraite',
    autre: 'Événement spécial'
  };
  return types[type] || type;
};

module.exports = { generatePDF };