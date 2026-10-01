jest.mock('../../config/supabase', () => ({
  auth: { admin: { getUserById: jest.fn() } }
}));

const supabase = require('../../config/supabase');
const { resolveLanguageForUserId } = require('../../services/i18n/resolveLanguageForUserId');

describe('resolveLanguageForUserId', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renvoie la langue stockee dans user_metadata.language', async () => {
    supabase.auth.admin.getUserById.mockResolvedValue({
      data: { user: { user_metadata: { language: 'en' } } },
      error: null
    });
    expect(await resolveLanguageForUserId('user-1')).toBe('en');
  });

  it('repli sur le francais si user_metadata.language est absent', async () => {
    supabase.auth.admin.getUserById.mockResolvedValue({
      data: { user: { user_metadata: {} } },
      error: null
    });
    expect(await resolveLanguageForUserId('user-1')).toBe('fr');
  });

  it('repli sur le francais si userId est absent', async () => {
    expect(await resolveLanguageForUserId(null)).toBe('fr');
    expect(await resolveLanguageForUserId(undefined)).toBe('fr');
    expect(supabase.auth.admin.getUserById).not.toHaveBeenCalled();
  });

  it('repli sur le francais si Supabase renvoie une erreur', async () => {
    supabase.auth.admin.getUserById.mockResolvedValue({ data: null, error: new Error('boom') });
    expect(await resolveLanguageForUserId('user-1')).toBe('fr');
  });

  it('repli sur le francais si Supabase leve une exception', async () => {
    supabase.auth.admin.getUserById.mockRejectedValue(new Error('boom'));
    expect(await resolveLanguageForUserId('user-1')).toBe('fr');
  });

  it('repli sur le francais pour une langue non supportee', async () => {
    supabase.auth.admin.getUserById.mockResolvedValue({
      data: { user: { user_metadata: { language: 'de' } } },
      error: null
    });
    expect(await resolveLanguageForUserId('user-1')).toBe('fr');
  });
});
