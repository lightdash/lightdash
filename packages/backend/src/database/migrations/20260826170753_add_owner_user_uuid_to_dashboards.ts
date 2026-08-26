import { Knex } from 'knex';

const DASHBOARDS_TABLE = 'dashboards';
const USERS_TABLE = 'users';
const OWNER_COLUMN = 'owner_user_uuid';

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET lock_timeout = '10s'`);
    await knex.schema.alterTable(DASHBOARDS_TABLE, (table) => {
        table
            .uuid(OWNER_COLUMN)
            .nullable()
            .references('user_uuid')
            .inTable(USERS_TABLE)
            .onDelete('SET NULL')
            .index();
    });
    await knex.raw(`RESET lock_timeout`);
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`SET lock_timeout = '10s'`);
    await knex.schema.alterTable(DASHBOARDS_TABLE, (table) => {
        table.dropColumn(OWNER_COLUMN);
    });
    await knex.raw(`RESET lock_timeout`);
}
