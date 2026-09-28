// Emails transactionnels : transport et redaction.
//
// Aucun test ne touche au reseau : le transport est teste avec `fetch` mocke,
// la redaction est faite de fonctions pures. C'est justement ce qui permet de
// verifier la regle la plus importante — RIEN NE PART SANS CLE — sans jamais
// risquer un envoi reel depuis la suite de tests.

describe('resendClient — rien ne part sans cle', () => {
  const CLE = process.env.RESEND_API_KEY;
  let fetchOrigine;

  beforeEach(() => {
    jest.resetModules();
    fetchOrigine = global.fetch;
  });
  afterEach(() => {
    global.fetch = fetchOrigine;
    if (CLE === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = CLE;
  });

  const charger = () => require('../services/email/resendClient');

  it('sans cle : aucun appel reseau, et l envoi se declare non effectue', async () => {
    delete process.env.RESEND_API_KEY;
    global.fetch = jest.fn();
    const { sendEmail, isEmailEnabled } = charger();

    expect(isEmailEnabled()).toBe(false);
    const r = await sendEmail({ to: 'test@example.com', subject: 'Bonjour', html: '<p>Bonjour</p>' });
    expect(r.sent).toBe(false);
    expect(r.skipped).toBe('cle_absente');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  // Le .env d'exemple contient un marqueur (« <ta_cle> ») : sans ce controle,
  // on enverrait une requete authentifiee avec un texte de remplacement et on
  // croirait a une panne du service.
  it('une cle de remplacement (qui ne commence pas par re_) compte comme absente', async () => {
    process.env.RESEND_API_KEY = '<ta_cle_resend>';
    global.fetch = jest.fn();
    const { sendEmail, isEmailEnabled } = charger();

    expect(isEmailEnabled()).toBe(false);
    const r = await sendEmail({ to: 'test@example.com', subject: 'Bonjour', html: '<p>x</p>' });
    expect(r.skipped).toBe('cle_absente');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('une adresse invalide n entraine aucun appel (ni quota ni reputation brules)', async () => {
    process.env.RESEND_API_KEY = 're_vraie_cle';
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

  it('avec une cle valide : un seul POST, avec le bon destinataire et le bon sujet', async () => {
    process.env.RESEND_API_KEY = 're_vraie_cle';
    global.fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({ id: 'email-1' }) }));
    const { sendEmail } = charger();

    const r = await sendEmail({ to: 'jean@example.com', subject: 'Votre livre', html: '<p>Bonjour</p>' });
    expect(r.sent).toBe(true);
    expect(r.id).toBe('email-1');
    expect(global.fetch).toHaveBeenCalledTimes(1);

    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    expect(options.headers.Authorization).toBe('Bearer re_vraie_cle');
    const corps = JSON.parse(options.body);
    expect(corps.to).toEqual(['jean@example.com']);
    expect(corps.subject).toBe('Votre livre');
  });

  // JAMAIS BLOQUANT : une commande payee reste payee meme si l'email echoue.
  it('un echec du service ne leve jamais — il est rapporte, pas propage', async () => {
    process.env.RESEND_API_KEY = 're_vraie_cle';
    global.fetch = jest.fn(async () => ({ ok: false, status: 403, json: async () => ({ message: 'Domaine non verifie' }) }));
    const { sendEmail } = charger();

    const r = await sendEmail({ to: 'jean@example.com', subject: 'x', html: '<p>x</p>' });
    expect(r.sent).toBe(false);
    expect(r.error).toBe('Domaine non verifie');
  });

  it('une panne reseau ne leve jamais non plus', async () => {
    process.env.RESEND_API_KEY = 're_vraie_cle';
    global.fetch = jest.fn(async () => { throw new Error('ECONNREFUSED'); });
    const { sendEmail } = charger();

    const r = await sendEmail({ to: 'jean@example.com', subject: 'x', html: '<p>x</p>' });
    expect(r.sent).toBe(false);
    expect(r.error).toBe('ECONNREFUSED');
  });
});

describe('brevoClient — rien ne part sans cle', () => {
  const CLE = process.env.BREVO_API_KEY;
  const FROM = process.env.EMAIL_FROM;
  let fetchOrigine;

  beforeEach(() => {
    jest.resetModules();
    fetchOrigine = global.fetch;
    process.env.EMAIL_FROM = 'Celebrons <bonjour@celebrons.test>';
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
    expect(corps.sender).toEqual({ name: 'Celebrons', email: 'bonjour@celebrons.test' });
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
});

describe('emailService (ancien flux chapitres) — delegue a Brevo', () => {
  const CLE = process.env.BREVO_API_KEY;
  const FROM = process.env.EMAIL_FROM;
  let fetchOrigine;

  beforeEach(() => {
    jest.resetModules();
    fetchOrigine = global.fetch;
    process.env.EMAIL_FROM = 'Celebrons <bonjour@celebrons.test>';
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
