import { Knex } from 'knex';

const tableName = 'ai_web_app_thread';
const columnName = 'embed_space_uuid';

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasColumn(tableName, columnName))) {
        await knex.schema.alterTable(tableName, (table) => {
            table.uuid(columnName).nullable();
            table
                .foreign(columnName)
                .references('space_uuid')
                .inTable('spaces')
                .onDelete('SET NULL');
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    if (await knex.schema.hasColumn(tableName, columnName)) {
        await knex.schema.alterTable(tableName, (table) => {
            table.dropForeign([columnName]);
            table.dropColumn(columnName);
        });
    }
}
