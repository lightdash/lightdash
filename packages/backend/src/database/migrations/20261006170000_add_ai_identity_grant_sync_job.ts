import { Knex } from 'knex';

export const classification: { kind: 'safe' | 'breaking'; reason: string } = {
    kind: 'safe',
    reason: 'Allows a new AI grant sync job kind without changing existing jobs.',
};

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.raw(
        'ALTER TABLE ai_identity_jobs DROP CONSTRAINT ai_identity_jobs_kind_check',
    );
    await knex.raw(
        "ALTER TABLE ai_identity_jobs ADD CONSTRAINT ai_identity_jobs_kind_check CHECK (kind IN ('test', 'export', 'sync', 'provision', 'grant_sync'))",
    );
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex('ai_identity_jobs').where('kind', 'grant_sync').delete();
    await knex.raw(
        'ALTER TABLE ai_identity_jobs DROP CONSTRAINT ai_identity_jobs_kind_check',
    );
    await knex.raw(
        "ALTER TABLE ai_identity_jobs ADD CONSTRAINT ai_identity_jobs_kind_check CHECK (kind IN ('test', 'export', 'sync', 'provision'))",
    );
}
