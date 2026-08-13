import type { Knex } from 'knex';

const tableName = 'ai_prompt';
const columnName = 'execution_mode';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(tableName, (table) => {
        table
            .enu(columnName, ['standard', 'deep_research'], {
                useNative: false,
                enumName: 'ai_prompt_execution_mode',
            })
            .nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(tableName, (table) => {
        table.dropColumn(columnName);
    });
}
