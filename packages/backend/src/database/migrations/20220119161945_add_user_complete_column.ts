import { Knex } from 'knex';

const UserTableName = 'users';
const IsCompleteColumnName = 'is_setup_complete';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.table(UserTableName, (table) => {
        table.boolean(IsCompleteColumnName).notNullable().defaultTo(true);
    });
}

export async function down(knex: Knex): Promise<void> {
    if (await knex.schema.hasColumn(UserTableName, IsCompleteColumnName)) {
        await knex.schema.table(UserTableName, (table) => {
            table.dropColumn(IsCompleteColumnName);
        });
    }
}
