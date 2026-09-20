// Le PDF et l'impression ne partagent pas le meme compteur.
//
// `orders.status` est une colonne UNIQUE pour deux produits qui n'avancent
// pas au meme rythme. Depuis que l'envoi a l'imprimeur fait avancer la
// commande (2026-09-20), y ecrire aussi l'etat du PDF fait se marcher dessus
// les deux parcours — et c'est exactement ce qui a fait disparaitre le PDF
// d'une vraie commande Pack : son statut etait passe a `sent_to_printer`,
// donc plus rien ne relancait ni ne suivait la fabrication du fichier.
const booksRouter = require('../routes/books');

const cibleApresPdf = booksRouter.__getPdfCompletionTargetStatusForTests;

describe('statut de commande apres la fin d\'un PDF', () => {
  it('une commande PDF SEULE passe bien a pdf_ready : ce statut la decrit entierement', () => {
    expect(cibleApresPdf('pdf')).toBe('pdf_ready');
  });

  it('une commande imprimee ne touche PAS au statut : il appartient a l\'impression', () => {
    expect(cibleApresPdf('print')).toBeNull();
  });

  it('un Pack non plus — c\'est le cas qui a casse en production', () => {
    expect(cibleApresPdf('pack')).toBeNull();
  });

  it('un type inconnu ou absent se comporte comme une commande PDF, jamais une exception', () => {
    expect(cibleApresPdf(undefined)).toBe('pdf_ready');
    expect(cibleApresPdf('')).toBe('pdf_ready');
  });
});
