import { Knex } from 'knex';

const TableName = 'ai_writeback_thread';
const ColumnName = 'workstream';

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasColumn(TableName, ColumnName))) {
        await knex.schema.alterTable(TableName, (table) => {
            table.text(ColumnName);
        });
    }
    await knex.raw(`UPDATE ?? SET ?? = ? WHERE ?? IS NULL`, [
        TableName,
        ColumnName,
        'dbt-writeback',
        ColumnName,
    ]);
    await knex.schema.alterTable(TableName, (table) => {
        table.text(ColumnName).notNullable().defaultTo('dbt-writeback').alter();
    });
}

export async function down(knex: Knex): Promise<void> {
    if (await knex.schema.hasColumn(TableName, ColumnName)) {
        await knex.schema.alterTable(TableName, (table) => {
            table.dropColumn(ColumnName);
        });
    }
}
