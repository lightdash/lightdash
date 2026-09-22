import { Knex } from 'knex';

const AiThreadTableName = 'ai_thread';

export const classification = {
    kind: 'safe',
    reason: 'Adds a nullable battle_profile column with a CHECK constraint; existing rows are NULL and readers are unaffected.',
};

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET lock_timeout = '10s'`);
    try {
        await knex.schema.alterTable(AiThreadTableName, (table) => {
            table.text('battle_profile').nullable();
        });
        await knex.raw(
            `ALTER TABLE ?? ADD CONSTRAINT ?? CHECK (battle_profile IS NULL OR battle_profile IN ('fast', 'baseline'))`,
            [AiThreadTableName, 'ai_thread_battle_profile_check'],
        );
    } finally {
        await knex.raw('RESET lock_timeout');
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`SET lock_timeout = '10s'`);
    try {
        await knex.schema.alterTable(AiThreadTableName, (table) => {
            table.dropColumn('battle_profile');
        });
    } finally {
        await knex.raw('RESET lock_timeout');
    }
}
