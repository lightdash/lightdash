import { Knex } from 'knex';

const AiThreadTableName = 'ai_thread';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(AiThreadTableName, (table) => {
        table.timestamp('pinned_at', { useTz: false }).nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(AiThreadTableName, (table) => {
        table.dropColumn('pinned_at');
    });
}
