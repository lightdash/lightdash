import { Knex } from 'knex';

const AiThreadTableName = 'ai_thread';
const ConstraintName = 'ai_thread_battle_profile_check';

export const classification = {
    kind: 'safe',
    reason: 'Widens the nullable battle_profile CHECK constraint to accept a new value; existing rows already satisfy both the old and new constraint.',
};

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET lock_timeout = '10s'`);
    try {
        await knex.raw(`ALTER TABLE ?? DROP CONSTRAINT ??`, [
            AiThreadTableName,
            ConstraintName,
        ]);
        await knex.raw(
            `ALTER TABLE ?? ADD CONSTRAINT ?? CHECK (battle_profile IS NULL OR battle_profile IN ('fast', 'baseline', 'luna'))`,
            [AiThreadTableName, ConstraintName],
        );
    } finally {
        await knex.raw('RESET lock_timeout');
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`SET lock_timeout = '10s'`);
    try {
        // Fails if any thread still uses the luna profile; data is never rewritten here.
        await knex.raw(`ALTER TABLE ?? DROP CONSTRAINT ??`, [
            AiThreadTableName,
            ConstraintName,
        ]);
        await knex.raw(
            `ALTER TABLE ?? ADD CONSTRAINT ?? CHECK (battle_profile IS NULL OR battle_profile IN ('fast', 'baseline'))`,
            [AiThreadTableName, ConstraintName],
        );
    } finally {
        await knex.raw('RESET lock_timeout');
    }
}
