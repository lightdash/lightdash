import { Knex } from 'knex';

const AiThreadTableName = 'ai_thread';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(AiThreadTableName, (table) => {
        table.text('battle_profile').nullable();
    });
    await knex.raw(
        `ALTER TABLE ?? ADD CONSTRAINT ?? CHECK (battle_profile IS NULL OR battle_profile IN ('fast', 'baseline'))`,
        [AiThreadTableName, 'ai_thread_battle_profile_check'],
    );
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(AiThreadTableName, (table) => {
        table.dropColumn('battle_profile');
    });
}
