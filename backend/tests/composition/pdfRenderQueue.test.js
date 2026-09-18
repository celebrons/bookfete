// Un seul rendu PDF a la fois.
//
// Le 2026-09-19, le serveur Scaleway (2 Go) est devenu injoignable — ni site,
// ni SSH, alors qu il repondait encore au ping. Chaque rendu lance son propre
// Chrome ; deux rendus en parallele suffisent a asphyxier la machine. Rien
// dans le code ne l empechait : le compteur de rendus actifs ne servait qu a
// l affichage dans l admin.
//
// Ces tests verifient la file elle-meme, sans lancer de navigateur : ils
// remplacent le lanceur par une fonction qui note quand elle commence et
// quand elle finit.

const path = require('path');

// spawn/execFile ne doivent JAMAIS partir depuis un test : on ne veut pas
// d un Chrome oublie sur la machine d integration.
jest.mock('child_process', () => ({
  spawn: jest.fn(() => { throw new Error('spawn interdit dans ce test'); }),
  execFile: jest.fn(() => { throw new Error('execFile interdit dans ce test'); })
}));

const pdfService = require(path.join('..', '..', 'services', 'composition', 'pdfService'));

// Deux appels simultanes a la meme primitive : le second ne doit pas
// commencer avant que le premier ait fini.
const suivre = (journal, nom, dureeMs) => async () => {
  journal.push(`${nom}:debut`);
  await new Promise((resolve) => setTimeout(resolve, dureeMs));
  journal.push(`${nom}:fin`);
  return nom;
};

describe('File d attente des rendus PDF', () => {
  it('serialise deux rendus lances en meme temps', async () => {
    const journal = [];
    const { unSeulRenduALaFois } = pdfService.__filePourLesTests;

    await Promise.all([
      unSeulRenduALaFois(suivre(journal, 'A', 30)),
      unSeulRenduALaFois(suivre(journal, 'B', 5))
    ]);

    // Sans file, on lirait A:debut, B:debut, B:fin, A:fin.
    expect(journal).toEqual(['A:debut', 'A:fin', 'B:debut', 'B:fin']);
  });

  it('un rendu qui echoue ne bloque pas les suivants', async () => {
    const journal = [];
    const { unSeulRenduALaFois } = pdfService.__filePourLesTests;

    const casse = unSeulRenduALaFois(async () => {
      journal.push('casse');
      throw new Error('rendu impossible');
    });

    await expect(casse).rejects.toThrow('rendu impossible');
    await unSeulRenduALaFois(suivre(journal, 'apres', 1));

    expect(journal).toEqual(['casse', 'apres:debut', 'apres:fin']);
  });

  it('rend compte de ce qui attend, pour la supervision', async () => {
    const { unSeulRenduALaFois } = pdfService.__filePourLesTests;
    expect(pdfService.nombreDeRendusEnFile()).toBe(0);

    const lent = unSeulRenduALaFois(() => new Promise((resolve) => setTimeout(resolve, 20)));
    const suivant = unSeulRenduALaFois(async () => {});

    expect(pdfService.nombreDeRendusEnFile()).toBe(2);
    await Promise.all([lent, suivant]);
    expect(pdfService.nombreDeRendusEnFile()).toBe(0);
  });
});
