-- chapter_amorce generation mode refactor
-- Creates a new active version of the chapter_amorce template
-- with backend-driven mode sections for generation_mode A/B.

begin;

with current_active as (
  select *
  from public.prompt_templates
  where type = 'chapter_amorce'
    and status = 'active'
  order by version desc
  limit 1
),
next_version as (
  select coalesce(max(version), 0) + 1 as version
  from public.prompt_templates
  where type = 'chapter_amorce'
),
deactivate_previous as (
  update public.prompt_templates
  set status = 'archived'
  where type = 'chapter_amorce'
    and status = 'active'
  returning id
)
insert into public.prompt_templates (
  id,
  type,
  version,
  status,
  label,
  system_prompt,
  context_block,
  data_block,
  output_format,
  forbidden_phrases,
  min_words,
  max_words,
  activated_at,
  created_by
)
select
  gen_random_uuid(),
  current_active.type,
  next_version.version,
  'active',
  current_active.label || ' - mode backend A/B',
  current_active.system_prompt,
  current_active.context_block,
  current_active.data_block
    || E'\n\n{{#if (eq generation_mode "B")}}\n'
    || E'MODE DE GENERATION IMPOSE : B\n'
    || E'- Aucun trait, aucune anecdote signature et aucune phrase signature ne sont disponibles pour ce livre.\n'
    || E'- Tu ne dois pas decider toi-meme d un autre mode.\n'
    || E'- Tu dois partir d UNE SEULE formulation parmi celles-ci, puis l adapter finement au titre du chapitre et a sa place dans le livre :\n'
    || E'{{#each fallback_formulations}}- {{this}}\n{{/each}}'
    || E'- Tu t appuies d abord sur le titre du chapitre, puis sur son theme, puis sur sa position dans le livre.\n'
    || E'- N invente pas une autre famille d ouverture que celles fournies ci-dessus.\n'
    || E'{{/if}}\n\n'
    || E'{{#if (eq generation_mode "A")}}\n'
    || E'MODE DE GENERATION IMPOSE : A\n'
    || E'- Au moins un marqueur personnel est disponible pour ce livre.\n'
    || E'- Tu dois t appuyer en priorite sur character_trait, signature_anecdote et signature_phrase quand ils sont renseignes.\n'
    || E'- Tu ne dois pas utiliser les formulations de secours du mode B.\n'
    || E'- L amorce doit sembler nee de la matiere personnelle disponible, pas d une formule generique.\n'
    || E'{{/if}}\n',
  current_active.output_format,
  current_active.forbidden_phrases,
  current_active.min_words,
  current_active.max_words,
  timezone('utc', now()),
  coalesce(current_active.created_by, 'codex')
from current_active, next_version;

commit;
