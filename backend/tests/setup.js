// Setup global Jest : neutralise l'environnement avant tout require applicatif.
// dotenv n'ecrase pas les variables deja definies, donc ces valeurs factices
// gagnent sur le .env local et garantissent qu'aucun test ne touche la vraie base.
process.env.NODE_ENV = 'test';
process.env.SUPABASE_URL = 'http://supabase.test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.SUPABASE_ANON_KEY = 'test-anon-key';
process.env.MISTRAL_API_KEY = 'test-mistral-key';
process.env.MISTRAL_MODEL = 'mistral-small-latest';
process.env.FRONTEND_URL = 'http://localhost:3000';
process.env.QUIET_STARTUP = '1';
process.env.DEBUG_AUTH = '0';
process.env.DEBUG_PROMPT_TRACE = '0';
process.env.STRIPE_ENABLED = '0';

// Pas de liste blanche d'admin prompts : ensurePromptAdmin laisse passer.
delete process.env.AI_PROMPT_ADMIN_EMAILS;
