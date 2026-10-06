import { Knex } from 'knex';

export const classification: { kind: 'safe' | 'breaking'; reason: string } = {
    kind: 'safe',
    reason: 'Sets the AI identity creation mode to automatic for existing and new accounts, because setup is managed by Lightdash only; older application versions read the same column and values.',
};

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex('ai_identity_accounts').update({ creation_mode: 'automatic' });
    await knex.raw(
        "ALTER TABLE ai_identity_accounts ALTER COLUMN creation_mode SET DEFAULT 'automatic'",
    );
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.raw(
        "ALTER TABLE ai_identity_accounts ALTER COLUMN creation_mode SET DEFAULT 'guided'",
    );
}
