import { Knex } from 'knex';

const AiThreadTableName = 'ai_thread';
const ConstraintName = 'ai_thread_battle_profile_check';

export const classification = {
    kind: 'safe',
    reason: 'Widens the nullable battle_profile CHECK constraint to accept new values; added NOT VALID so no row is scanned, and existing rows already satisfy both the old and new constraint.',
};

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '5s'`);
    await knex.raw(
        `ALTER TABLE ?? DROP CONSTRAINT ??, ADD CONSTRAINT ?? CHECK (battle_profile IS NULL OR battle_profile IN ('fast', 'baseline', 'luna', 'classic', 'composer')) NOT VALID`,
        [AiThreadTableName, ConstraintName, ConstraintName],
    );
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '5s'`);
    // Fails if any thread still uses a query path profile; data is never rewritten here.
    await knex.raw(
        `ALTER TABLE ?? DROP CONSTRAINT ??, ADD CONSTRAINT ?? CHECK (battle_profile IS NULL OR battle_profile IN ('fast', 'baseline', 'luna'))`,
        [AiThreadTableName, ConstraintName, ConstraintName],
    );
}
