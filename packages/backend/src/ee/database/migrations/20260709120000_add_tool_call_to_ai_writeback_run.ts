import { Knex } from 'knex';

const AiWritebackRunTableName = 'ai_writeback_run';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(AiWritebackRunTableName, (table) => {
        table.text('prompt_uuid');
        table.text('tool_call_id');
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(AiWritebackRunTableName, (table) => {
        table.dropColumn('prompt_uuid');
        table.dropColumn('tool_call_id');
    });
}
