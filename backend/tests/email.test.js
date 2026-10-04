// Emails transactionnels : transport et redaction.
//
// Aucun test ne touche au reseau : le transport est teste avec `fetch` mocke,
// la redaction est faite de fonctions pures. C'est justement ce qui permet de
// verifier la regle la plus importante — RIEN NE PART SANS CLE — sans jamais
// risquer un envoi reel depuis la suite de tests.

describe('brevoClient — rien ne part sans cle', () => {
  const CLE = process.env.BREVO_API_KEY;
  const FROM = process.env.EMAIL_FROM;
  let fetchOrigine;

  beforeEach(() => {
    jest.resetModules();
    fetchOrigine = global.fetch;
    process.env.EMAIL_FROM = 'Bookipix <bonjour@bookipix.test>';
  });
  afterEach(() => {
    global.fetch = fetchOrigine;
    if (CLE === undefined) delete process.env.BREVO_API_KEY; else process.env.BREVO_API_KEY = CLE;
    if (FROM === undefined) delete process.env.EMAIL_FROM; else process.env.EMAIL_FROM = FROM;
  });

  const charger = () => require('../services/email/brevoClient');

  it('sans cle : aucun appel reseau, et l envoi se declare non effectue', async () => {
    delete process.env.BREVO_API_KEY;
    global.fetch = jest.fn();
    const { sendEmail, isEmailEnabled } = charger();

    expect(isEmailEnabled()).toBe(false);
    const r = await sendEmail({ to: 'test@example.com', subject: 'Bonjour', html: '<p>Bonjour</p>' });
    expect(r.sent).toBe(false);
    expect(r.skipped).toBe('cle_absente');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  // Le .env d'exemple contient un marqueur (« xkeysib-xxx ») : sans ce
  // controle, on enverrait une requete authentifiee avec un texte de
  // remplacement et on croirait a une panne du service.
  it('une cle qui ne commence pas par xkeysib- compte comme absente', async () => {
    process.env.BREVO_API_KEY = 'pas-une-cle-brevo';
    global.fetch = jest.fn();
    const { sendEmail, isEmailEnabled } = charger();

    expect(isEmailEnabled()).toBe(false);
    const r = await sendEmail({ to: 'test@example.com', subject: 'Bonjour', html: '<p>x</p>' });
    expect(r.skipped).toBe('cle_absente');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('sans EMAIL_FROM (expediteur verifie), aucun appel reseau', async () => {
    process.env.BREVO_API_KEY = 'xkeysib-vraie-cle';
    delete process.env.EMAIL_FROM;
    global.fetch = jest.fn();
    const { sendEmail } = charger();

    const r = await sendEmail({ to: 'jean@example.com', subject: 'x', html: '<p>x</p>' });
    expect(r.sent).toBe(false);
    expect(r.skipped).toBe('expediteur_absent');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('une adresse invalide n entraine aucun appel (ni quota ni reputation brules)', async () => {
    process.env.BREVO_API_KEY = 'xkeysib-vraie-cle';
    global.fetch = jest.fn();
    const { sendEmail } = charger();

    for (const mauvaise of ['', 'pas-une-adresse', 'a@b', null, undefined]) {
      // eslint-disable-next-line no-await-in-loop
      const r = await sendEmail({ to: mauvaise, subject: 'x', html: '<p>x</p>' });
      expect(r.sent).toBe(false);
      expect(r.skipped).toBe('destinataire_invalide');
    }
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('une piece jointe (Buffer) part en base64, avec son nom — pour la facture PDF (invoiceService.js)', async () => {
    process.env.BREVO_API_KEY = 'xkeysib-vraie-cle';
    global.fetch = jest.fn(async () => ({ ok: true, status: 201, json: async () => ({ messageId: 'email-2' }) }));
    const { sendEmail } = charger();

    const r = await sendEmail({
      to: 'jean@example.com', subject: 'Votre facture', html: '<p>x</p>',
      attachment: [{ name: 'F-2026-000001.pdf', content: Buffer.from('%PDF-fake') }]
    });
    expect(r.sent).toBe(true);
    const corps = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(corps.attachment).toEqual([{ name: 'F-2026-000001.pdf', content: Buffer.from('%PDF-fake').toString('base64') }]);
  });

  it('sans piece jointe : le champ attachment n apparait pas du tout dans le corps envoye', async () => {
    process.env.BREVO_API_KEY = 'xkeysib-vraie-cle';
    global.fetch = jest.fn(async () => ({ ok: true, status: 201, json: async () => ({ messageId: 'email-3' }) }));
    const { sendEmail } = charger();

    await sendEmail({ to: 'jean@example.com', subject: 'x', html: '<p>x</p>' });
    const corps = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(corps.attachment).toBeUndefined();
  });

  it('avec une cle et un expediteur valides : un seul POST, avec le bon destinataire et le bon sujet', async () => {
    process.env.BREVO_API_KEY = 'xkeysib-vraie-cle';
    global.fetch = jest.fn(async () => ({ ok: true, status: 201, json: async () => ({ messageId: 'email-1' }) }));
    const { sendEmail } = charger();

    const r = await sendEmail({ to: 'jean@example.com', subject: 'Votre livre', html: '<p>Bonjour</p>' });
    expect(r.sent).toBe(true);
    expect(r.id).toBe('email-1');
    expect(global.fetch).toHaveBeenCalledTimes(1);

    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe('https://api.brevo.com/v3/smtp/email');
    expect(options.headers['api-key']).toBe('xkeysib-vraie-cle');
    const corps = JSON.parse(options.body);
    expect(corps.sender).toEqual({ name: 'Bookipix', email: 'bonjour@bookipix.test' });
    expect(corps.to).toEqual([{ email: 'jean@example.com' }]);
    expect(corps.subject).toBe('Votre livre');
  });

  // JAMAIS BLOQUANT : une commande payee reste payee meme si l'email echoue.
  it('un echec du service ne leve jamais — il est rapporte, pas propage', async () => {
    process.env.BREVO_API_KEY = 'xkeysib-vraie-cle';
    global.fetch = jest.fn(async () => ({ ok: false, status: 403, json: async () => ({ message: 'Sender not registered' }) }));
    const { sendEmail } = charger();

    const r = await sendEmail({ to: 'jean@example.com', subject: 'x', html: '<p>x</p>' });
    expect(r.sent).toBe(false);
    expect(r.error).toBe('Sender not registered');
  });

  it('une panne reseau ne leve jamais non plus', async () => {
    process.env.BREVO_API_KEY = 'xkeysib-vraie-cle';
    global.fetch = jest.fn(async () => { throw new Error('ECONNREFUSED'); });
    const { sendEmail } = charger();

    const r = await sendEmail({ to: 'jean@example.com', subject: 'x', html: '<p>x</p>' });
    expect(r.sent).toBe(false);
    expect(r.error).toBe('ECONNREFUSED');
  });
});

// Supervision des echecs d'envoi CLIENT (2026-10-04) : jusqu'ici, un email
// commande/PDF/expedition qui echouait vraiment (pas juste "aucun
// destinataire connu", benin et frequent) n'etait visible que dans le
// journal des evenements. On verifie ici que l'envoi passe desormais par
// une alerte admin — via la MEME alerte que paiement/PDF/Gelato, pas un
// second systeme — et surtout qu'une panne Brevo totale (l'alerte elle-meme
// echoue) ne boucle jamais indefiniment.
describe('transactionalEmails — un echec d\'envoi CLIENT alerte l\'administration', () => {
  const ADMIN = process.env.ADMIN_EMAILS;
  beforeEach(() => {
    jest.resetModules();
    process.env.ADMIN_EMAILS = 'patron@bookipix.test';
  });
  afterEach(() => {
    if (ADMIN === undefined) delete process.env.ADMIN_EMAILS; else process.env.ADMIN_EMAILS = ADMIN;
    // jest.doMock reste actif au-dela de resetModules() tant qu'on ne le
    // retire pas explicitement — sans ca, les describe suivants de ce
    // fichier (ex. emailService, plus bas) heriteraient de ce brevoClient
    // simule a la place du vrai.
    jest.dontMock('../services/email/brevoClient');
    jest.dontMock('../services/i18n/resolveLanguageForUserId');
  });

  const charger = (sendEmailMock) => {
    jest.doMock('../services/email/brevoClient', () => ({
      sendEmail: sendEmailMock,
      isEmailEnabled: () => true
    }));
    jest.doMock('../services/i18n/resolveLanguageForUserId', () => ({
      resolveLanguageForUserId: jest.fn(async () => 'fr')
    }));
    return require('../services/email/transactionalEmails');
  };

  it('un vrai echec d\'envoi (pas juste "destinataire inconnu") declenche une alerte admin', async () => {
    const sendEmailMock = jest.fn()
      .mockResolvedValueOnce({ sent: false, error: 'Sender not registered' }) // l'email client
      .mockResolvedValueOnce({ sent: true, id: 'alerte-1' }); // l'alerte admin
    const emails = charger(sendEmailMock);

    await emails.envoyerCommandeConfirmee({
      order: { id: 'o1', order_number: 'CMD-1', total_cents: 4300, owner_id: 'u1' },
      book: { title: 'Montreal', print_format: 'standard', page_count: 30 },
      ownerEmail: 'jean@example.com'
    });

    // Laisse partir l'alerte declenchee en arriere-plan (non attendue par envoyer()).
    await new Promise((r) => setImmediate(r));

    expect(sendEmailMock).toHaveBeenCalledTimes(2);
    const [, alerteArgs] = sendEmailMock.mock.calls;
    expect(alerteArgs[0].to).toBe('patron@bookipix.test');
    expect(alerteArgs[0].subject).toMatch(/non remis/i);
  });

  it('un echec "benin" (aucun destinataire connu) n\'alerte PAS — sinon chaque envoi sans adresse spammerait l\'admin', async () => {
    const sendEmailMock = jest.fn();
    const emails = charger(sendEmailMock);

    await emails.envoyerCommandeConfirmee({
      order: { id: 'o1', order_number: 'CMD-1', owner_id: 'u1' },
      book: { title: 'Montreal' },
      ownerEmail: null
    });
    await new Promise((r) => setImmediate(r));

    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('si l\'alerte elle-meme echoue (panne Brevo totale), elle ne se re-declenche jamais sur elle-meme', async () => {
    const sendEmailMock = jest.fn().mockResolvedValue({ sent: false, error: 'ECONNREFUSED' });
    const emails = charger(sendEmailMock);

    await emails.envoyerCommandeConfirmee({
      order: { id: 'o1', order_number: 'CMD-1', owner_id: 'u1' },
      book: { title: 'Montreal' },
      ownerEmail: 'jean@example.com'
    });
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));

    // Exactement 2 : l'email client (echoue) + une seule tentative d'alerte
    // (echouee aussi) — jamais une troisieme tentative pour signaler l'echec
    // de la seconde.
    expect(sendEmailMock).toHaveBeenCalledTimes(2);
  });
});

describe('emailTemplates — redaction', () => {
  const gabarits = require('../services/email/emailTemplates');

  it('chaque email a un sujet, une version HTML ET une version texte', () => {
    // Certains clients ne lisent que le texte, et c'est lui qui est indexe
    // par les filtres anti-spam : un email sans version texte part mal.
    const messages = [
      gabarits.retrouverSonLivre({ lien: 'https://x.test/b/1', titreLivre: 'Montreal' }),
      gabarits.commandeConfirmee({ numero: 'CMD-1', totalCents: 4300, lien: 'https://x.test/orders' }),
      gabarits.paiementRecu({ numero: 'CMD-1', totalCents: 4300 }),
      gabarits.etapeDeFabrication({ statut: 'shipped', numero: 'CMD-1' }),
      gabarits.essai({ destinataire: 'jean@example.com' })
    ];
    messages.forEach((m) => {
      expect(typeof m.subject).toBe('string');
      expect(m.subject.length).toBeGreaterThan(0);
      expect(m.html).toContain('<html');
      expect(typeof m.text).toBe('string');
      expect(m.text.length).toBeGreaterThan(0);
    });
  });

  it('un statut sans message dedie ne produit RIEN plutot qu un email vague', () => {
    expect(gabarits.etapeDeFabrication({ statut: 'draft', numero: 'CMD-1' })).toBeNull();
    expect(gabarits.etapeDeFabrication({ statut: 'pdf_generating', numero: 'CMD-1' })).toBeNull();
  });

  it('echappe le HTML : un titre de livre ne peut pas injecter de balise', () => {
    const m = gabarits.retrouverSonLivre({ lien: 'https://x.test/b/1', titreLivre: '<script>alert(1)</script>' });
    expect(m.html).not.toContain('<script>alert(1)</script>');
    expect(m.html).toContain('&lt;script&gt;');
  });

  it('affiche les prix en euros, virgule francaise', () => {
    expect(gabarits.prix(4300)).toBe('43,00 €');
    expect(gabarits.prix(52000)).toBe('520,00 €');
  });

  it('le numero de suivi prend la place du lien de commande quand il existe', () => {
    // A l'expedition, c'est l'information la plus utile : elle doit primer.
    const m = gabarits.etapeDeFabrication({
      statut: 'shipped',
      numero: 'CMD-1',
      lien: 'https://x.test/orders',
      suivi: { code: 'AB123', url: 'https://transporteur.test/AB123' }
    });
    expect(m.html).toContain('https://transporteur.test/AB123');
    expect(m.text).toContain('AB123');
  });

  // Chantier bilingue, phase 6 : chaque gabarit client bascule en anglais
  // sur lang:'en', et reste en francais par defaut (lang omis) pour ne
  // jamais casser un appelant existant.
  it('sans lang (ou lang omis) : francais, comme avant le chantier bilingue', () => {
    const m = gabarits.commandeConfirmee({ numero: 'CMD-1', totalCents: 4300, lien: 'https://x.test/orders' });
    expect(m.subject).toContain('enregistrée');
    expect(m.html).toContain('lang="fr"');
  });

  it('lang:"en" bascule sujet, corps et <html lang> sur les gabarits client', () => {
    const cas = [
      gabarits.retrouverSonLivre({ lien: 'https://x.test/b/1', titreLivre: 'Montreal', lang: 'en' }),
      gabarits.commandeConfirmee({ numero: 'CMD-1', totalCents: 4300, lien: 'https://x.test/orders', lang: 'en' }),
      gabarits.paiementRecu({ numero: 'CMD-1', totalCents: 4300, lang: 'en' }),
      gabarits.factureEmise({ numeroFacture: 'F-1', numeroCommande: 'CMD-1', totalCents: 4300, lang: 'en' }),
      gabarits.pdfPret({ titreLivre: 'Montreal', lien: 'https://x.test/b/1', pages: 32, lang: 'en' }),
      gabarits.etapeDeFabrication({ statut: 'shipped', numero: 'CMD-1', lang: 'en' }),
      gabarits.essai({ destinataire: 'jean@example.com', lang: 'en' })
    ];
    cas.forEach((m) => {
      expect(m.html).toContain('lang="en"');
      expect(m.html).not.toContain('lang="fr"');
    });
    expect(gabarits.commandeConfirmee({ numero: 'CMD-1', lien: 'x', lang: 'en' }).subject).toContain('recorded');
    expect(gabarits.paiementRecu({ numero: 'CMD-1', lang: 'en' }).subject).toContain('Payment received');
    expect(gabarits.pdfPret({ titreLivre: 'Montreal', lang: 'en' }).subject).toContain('ready');
  });

  it('mode collectif : lang:"en" traduit invitation/relance/nouvelle-contribution', () => {
    const invitation = gabarits.invitationParticipant({
      lien: 'https://x.test/collectif/tok', titreLivre: 'Anniv', pourQui: 'Jean', lang: 'en'
    });
    expect(invitation.subject).toContain('Take part');
    expect(invitation.html).toContain('lang="en"');

    const relance = gabarits.relanceParticipant({
      lien: 'https://x.test/collectif/tok', pourQui: 'Jean', dejaCommence: false, lang: 'en'
    });
    expect(relance.subject).toContain('Reminder');

    const contribution = gabarits.nouvelleContribution({
      lien: 'https://x.test/b/1', titreLivre: 'Anniv', contributeur: 'Marie', photos: 2, lang: 'en'
    });
    expect(contribution.subject).toContain('Marie contributed');
  });

  it('alerteAdmin reste francais-seul, meme avec lang:"en" (hors perimetre bilingue)', () => {
    const m = gabarits.alerteAdmin({ sujet: 'Test', lignes: ['x'], lang: 'en' });
    expect(m.html).toContain('lang="fr"');
  });
});

describe('emailService (ancien flux chapitres) — delegue a Brevo', () => {
  const CLE = process.env.BREVO_API_KEY;
  const FROM = process.env.EMAIL_FROM;
  let fetchOrigine;

  beforeEach(() => {
    jest.resetModules();
    fetchOrigine = global.fetch;
    process.env.EMAIL_FROM = 'Bookipix <bonjour@bookipix.test>';
  });
  afterEach(() => {
    global.fetch = fetchOrigine;
    if (CLE === undefined) delete process.env.BREVO_API_KEY; else process.env.BREVO_API_KEY = CLE;
    if (FROM === undefined) delete process.env.EMAIL_FROM; else process.env.EMAIL_FROM = FROM;
  });

  // Le transport nodemailer a ete retire : deux systemes d'envoi paralleles
  // auraient voulu dire deux configurations, deux endroits ou un email se
  // perd, et deux habillages qui divergent.
  it('n utilise plus nodemailer', () => {
    const source = require('fs').readFileSync(require.resolve('../services/emailService'), 'utf8');
    expect(source).not.toMatch(/require\(['"]nodemailer['"]\)/);
  });

  it('passe bien par Brevo, avec la signature d origine inchangee', async () => {
    process.env.BREVO_API_KEY = 'xkeysib-vraie-cle';
    global.fetch = jest.fn(async () => ({ ok: true, status: 201, json: async () => ({ messageId: 'e-1' }) }));
    const { sendInviteEmail } = require('../services/emailService');

    const r = await sendInviteEmail({
      to: 'proche@example.com',
      bookTitle: 'Les 60 ans de Jean',
      chapterTitle: 'Souvenirs',
      inviteLink: 'https://x.test/invite/abc',
      customMessage: 'Merci de participer'
    });

    expect(r.sent).toBe(true);
    const corps = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(corps.to).toEqual([{ email: 'proche@example.com' }]);
    expect(corps.htmlContent).toContain('https://x.test/invite/abc');
    expect(corps.htmlContent).toContain('Merci de participer');
  });

  it('respecte le meme garde-fou : sans cle, aucun appel reseau', async () => {
    delete process.env.BREVO_API_KEY;
    global.fetch = jest.fn();
    const { sendNewContributionEmail } = require('../services/emailService');

    const r = await sendNewContributionEmail({ to: 'createur@example.com', bookTitle: 'X', contributorName: 'Marie' });
    expect(r.sent).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
