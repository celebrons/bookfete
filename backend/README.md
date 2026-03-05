# Backend Memoire Collective

API Node.js/Express pour l'application de livres souvenirs collaboratifs.

## Installation

```bash
npm install
```

## Lancement

```bash
npm run dev
```

## Prompt Templates (chapitres + questions)

Les prompts IA sont maintenant versionnes en base (Supabase), avec fallback sur des prompts par defaut dans le code.

### 1) Creer les tables

Dans Supabase SQL editor, executer:

- [sql/ai_prompt_templates.sql](/c:/Users/USER/bookfete/backend/sql/ai_prompt_templates.sql)

### 2) Initialiser les templates par defaut

```bash
npm run prompts:seed
```

### 3) Modifier un prompt dans le futur

Option A (recommandee): via API backend (versionnee)

- `GET /api/ai/prompt-templates/:promptKey?eventType=*&locale=fr`
- `POST /api/ai/prompt-templates/:promptKey/test`
- `POST /api/ai/prompt-templates/:promptKey/versions`
- `POST /api/ai/prompt-templates/cache/clear`

Corps JSON pour publier une nouvelle version:

```json
{
  "eventType": "*",
  "locale": "fr",
  "systemPrompt": "Votre system prompt",
  "userPromptTemplate": "Votre prompt avec {{variables}}",
  "temperature": 0.7,
  "maxTokens": 900,
  "status": "published",
  "publish": true
}
```

Option B: edition directe dans Supabase (`ai_prompt_versions` + `ai_prompt_templates.active_version`).

### 4) Generer des variantes questions par evenement

```bash
npm run prompts:seed:question-variants
```

Ce script publie `question_generation` pour:
- `anniversaire`
- `mariage`
- `naissance`
- `depart`
- `projet`
- `retraite`
- `vacances`

## Variables d'environnement utiles

- `MISTRAL_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `AI_PROMPT_ADMIN_EMAILS` (liste d'emails separes par des virgules pour proteger la gestion des prompts)
