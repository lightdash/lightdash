import { Knex } from 'knex';

const UserTableName = 'users';
const ColumnName = 'timezone';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(UserTableName, (table) => {
        table.string(ColumnName).nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    if (await knex.schema.hasColumn(UserTableName, ColumnName)) {
        await knex.schema.alterTable(UserTableName, (table) => {
            table.dropColumn(ColumnName);
        });
    }
}
