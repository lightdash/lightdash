import { Knex } from 'knex';

const AiThreadTableName = 'ai_thread';
const UpdatedAtIndexName = 'ai_thread_updated_at_idx';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(AiThreadTableName, (table) => {
        table.timestamp('updated_at', { useTz: false }).nullable();
    });

    await knex.schema.alterTable(AiThreadTableName, (table) => {
        table.index(['updated_at'], UpdatedAtIndexName);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(AiThreadTableName, (table) => {
        table.dropIndex(['updated_at'], UpdatedAtIndexName);
        table.dropColumn('updated_at');
    });
}
