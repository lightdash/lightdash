import { type Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Adds nullable search vector columns and a trigger that fills ai_prompt.search_vector on write. No table is rewritten for ai_prompt, older app versions never read the columns, and no existing column changes.',
};

// ai_prompt.search_vector is a plain column kept by a trigger, not a stored
// generated column: adding a generated column rewrites the table under an
// ACCESS EXCLUSIVE lock, and computing every tsvector took 112 s on 119k
// prompts. Existing rows are not backfilled: a prompt gets its vector when it
// is next written.
// ai_thread only indexes the short title, so its rewrite takes about a second.
//
// The vector also carries one lexeme naming the thread's organization
// (org<uuid without dashes>). A search ANDs it into the tsquery, so the GIN
// index returns one organization's matches without reading other rows. It
// only narrows the index scan: queries still join ai_thread and filter on
// organization_uuid, which is what enforces tenancy.
//
// Inputs are cut with left() so a very long prompt or response can never reach
// the 1 MB tsvector limit, which would fail the insert or update of that row.
export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '60s'");
    await knex.raw(
        'ALTER TABLE ai_prompt ADD COLUMN IF NOT EXISTS search_vector tsvector',
    );
    await knex.raw(`
        CREATE OR REPLACE FUNCTION ai_prompt_search_vector(
            organization_uuid uuid, prompt text, response text, human_feedback text, error_message text
        ) RETURNS tsvector LANGUAGE sql IMMUTABLE AS $$
            SELECT
                setweight(to_tsvector('lightdash_english_config', left(coalesce(prompt, ''), 20000)), 'A') ||
                setweight(to_tsvector('lightdash_english_config', left(coalesce(response, ''), 20000)), 'B') ||
                setweight(to_tsvector('lightdash_english_config', left(coalesce(human_feedback, ''), 5000)), 'C') ||
                setweight(to_tsvector('lightdash_english_config', left(coalesce(error_message, ''), 5000)), 'C') ||
                to_tsvector('simple', coalesce('org' || replace(organization_uuid::text, '-', ''), ''))
        $$
    `);
    await knex.raw(`
        CREATE OR REPLACE FUNCTION ai_prompt_set_search_vector() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
            NEW.search_vector := ai_prompt_search_vector(
                (SELECT t.organization_uuid FROM ai_thread t WHERE t.ai_thread_uuid = NEW.ai_thread_uuid),
                NEW.prompt, NEW.response, NEW.human_feedback, NEW.error_message
            );
            RETURN NEW;
        END
        $$
    `);
    await knex.raw(
        'DROP TRIGGER IF EXISTS ai_prompt_search_vector_trigger ON ai_prompt',
    );
    await knex.raw(`
        CREATE TRIGGER ai_prompt_search_vector_trigger
        BEFORE INSERT OR UPDATE OF prompt, response, human_feedback, error_message
        ON ai_prompt
        FOR EACH ROW EXECUTE FUNCTION ai_prompt_set_search_vector()
    `);
    await knex.raw(`
        ALTER TABLE ai_thread ADD COLUMN IF NOT EXISTS search_vector tsvector
        GENERATED ALWAYS AS (
            setweight(to_tsvector('lightdash_english_config', left(coalesce(title, ''), 1000)), 'A')
        ) STORED
    `);
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '60s'");
    await knex.raw(
        'DROP TRIGGER IF EXISTS ai_prompt_search_vector_trigger ON ai_prompt',
    );
    await knex.raw('DROP FUNCTION IF EXISTS ai_prompt_set_search_vector()');
    await knex.raw(
        'DROP FUNCTION IF EXISTS ai_prompt_search_vector(uuid, text, text, text, text)',
    );
    await knex.raw('ALTER TABLE ai_prompt DROP COLUMN IF EXISTS search_vector');
    await knex.raw('ALTER TABLE ai_thread DROP COLUMN IF EXISTS search_vector');
}
