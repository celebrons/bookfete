// Orchestration de generateInvoiceForOrder : numerotation, idempotence,
// resolution de l'acheteur, stockage. Le rendu PDF (pdfService, Chrome
// headless) et le systeme de fichiers sont mockes — ce fichier teste QUI
// appelle QUOI et dans quel ordre, pas le rendu lui-meme (voir
// invoiceTemplate.test.js pour le contenu HTML).

jest.mock('../../services/composition/pdfService', () => ({
  renderPdfFromHtml: jest.fn(async () => '/tmp/facture-fake.pdf')
}));

jest.mock('fs/promises', () => ({
  readFile: jest.fn(async () => Buffer.from('%PDF-fake')),
  unlink: jest.fn(async () => {})
}));

function makeSupabaseMock({ existingInvoice = null, rpcNumber = 1, insertError = null, secondSelectAfterInsertError = null } = {}) {
  const inserted = [];
  const rpc = jest.fn(async () => ({ data: rpcNumber, error: null }));
  const invoicesTable = {
    select: jest.fn(function select() { return this; }),
    eq: jest.fn(function eq() { return this; }),
    maybeSingle: jest.fn(async () => {
      // Premier appel (verification d'idempotence) : ce qu'on nous a demande
      // de simuler. Deuxieme appel eventuel (apres un echec d'insert, pour
      // detecter une course) : secondSelectAfterInsertError.
      invoicesTable.__appels = (invoicesTable.__appels || 0) + 1;
      if (invoicesTable.__appels === 1) return { data: existingInvoice, error: null };
      return { data: secondSelectAfterInsertError, error: null };
    }),
    insert: jest.fn(function insert(payload) {
      this.__insertPayload = payload;
      return this;
    }),
    single: jest.fn(async function single() {
      if (insertError) return { data: null, error: insertError };
      inserted.push(this.__insertPayload);
      return { data: { id: 'invoice-1', ...this.__insertPayload }, error: null };
    })
  };

  const storageBucket = {
    upload: jest.fn(async () => ({ data: { path: 'orders/order-1/F-2026-000001.pdf' }, error: null })),
    createSignedUrl: jest.fn(async () => ({ data: { signedUrl: 'https://x.test/signed' }, error: null }))
  };

  return {
    __inserted: inserted,
    from: jest.fn((table) => {
      if (table === 'invoices') return invoicesTable;
      throw new Error(`table non mockee : ${table}`);
    }),
    rpc,
    auth: {
      admin: {
        getUserById: jest.fn(async () => ({ data: { user: { email: 'proprietaire@example.com', user_metadata: { full_name: 'Jean Test' } } } }))
      }
    },
    storage: {
      getBucket: jest.fn(async () => ({ data: { name: 'invoices' }, error: null })),
      createBucket: jest.fn(async () => ({ data: {}, error: null })),
      from: jest.fn(() => storageBucket)
    }
  };
}

const ORDER = {
  id: 'order-1',
  owner_id: 'owner-1',
  order_number: 'CMD-260927-ABC-123',
  type: 'print',
  quantity: 1,
  unit_cents: 4430,
  total_cents: 4930,
  paid_at: '2026-09-27T21:24:59.000Z',
  shipping_address: { fullName: 'Marie Curie', email: 'marie@example.com', line1: '2 rue de Lyon', postalCode: '69001', city: 'Lyon', country: 'France' },
  metadata: {},
  snapshot: { printFormat: 'standard', pages: 34, title: 'Portugal 2025' }
};

describe('generateInvoiceForOrder', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('emet une facture numerotee, l upload, et retourne un buffer PDF pour l envoi immediat', async () => {
    const mockSupabase = makeSupabaseMock({ rpcNumber: 7 });
    jest.doMock('../../config/supabase', () => mockSupabase);
    const { generateInvoiceForOrder } = require('../../services/invoicing/invoiceService');

    const invoice = await generateInvoiceForOrder(ORDER);

    expect(mockSupabase.rpc).toHaveBeenCalledWith('next_invoice_number', { p_year: 2026 });
    expect(invoice.invoice_number).toBe('F-2026-000007');
    expect(invoice._pdfBuffer).toBeInstanceOf(Buffer);
    expect(invoice.buyer.name).toBe('Marie Curie');
    expect(invoice.buyer.email).toBe('marie@example.com');
    expect(mockSupabase.__inserted).toHaveLength(1);
    expect(mockSupabase.__inserted[0].order_id).toBe('order-1');
    expect(mockSupabase.__inserted[0].storage_path).toBe('orders/order-1/F-2026-000007.pdf');
  });

  it('idempotent : une facture deja existante pour cette commande est retournee SANS regenerer', async () => {
    const dejaLa = { id: 'invoice-existante', order_id: 'order-1', invoice_number: 'F-2026-000003' };
    const mockSupabase = makeSupabaseMock({ existingInvoice: dejaLa });
    jest.doMock('../../config/supabase', () => mockSupabase);
    const { generateInvoiceForOrder } = require('../../services/invoicing/invoiceService');
    const pdfService = require('../../services/composition/pdfService');

    const invoice = await generateInvoiceForOrder(ORDER);

    expect(invoice).toBe(dejaLa);
    expect(invoice._pdfBuffer).toBeUndefined();
    expect(pdfService.renderPdfFromHtml).not.toHaveBeenCalled();
    expect(mockSupabase.rpc).not.toHaveBeenCalled();
  });

  it('course concurrente : un INSERT en echec (contrainte UNIQUE prise entretemps) relit la facture plutot que d echouer', async () => {
    const gagnante = { id: 'invoice-gagnante', order_id: 'order-1', invoice_number: 'F-2026-000001' };
    const mockSupabase = makeSupabaseMock({
      rpcNumber: 1,
      insertError: { message: 'duplicate key value violates unique constraint "invoices_order_id_key"' },
      secondSelectAfterInsertError: gagnante
    });
    jest.doMock('../../config/supabase', () => mockSupabase);
    const { generateInvoiceForOrder } = require('../../services/invoicing/invoiceService');

    const invoice = await generateInvoiceForOrder(ORDER);
    expect(invoice).toBe(gagnante);
  });

  it('commande PDF sans adresse : retombe sur le compte reel (auth.admin.getUserById), jamais une adresse devinee', async () => {
    const mockSupabase = makeSupabaseMock({});
    jest.doMock('../../config/supabase', () => mockSupabase);
    const { generateInvoiceForOrder } = require('../../services/invoicing/invoiceService');

    const commandePdf = { ...ORDER, type: 'pdf', shipping_address: null, unit_cents: 799, total_cents: 799 };
    const invoice = await generateInvoiceForOrder(commandePdf);

    expect(mockSupabase.auth.admin.getUserById).toHaveBeenCalledWith('owner-1');
    expect(invoice.buyer.email).toBe('proprietaire@example.com');
    expect(invoice.buyer.name).toBe('Jean Test');
    expect(invoice.buyer.address).toBeNull();
  });
});
