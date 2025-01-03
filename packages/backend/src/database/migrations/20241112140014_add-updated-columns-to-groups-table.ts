import { Knex } from 'knex';

const GroupsTableName = 'groups';

export async function up(knex: Knex): Promise<void> {
    if (await knex.schema.hasTable(GroupsTableName)) {
        await knex.schema.alterTable(GroupsTableName, (table) => {
            table
                .uuid('created_by_user_uuid')
                .nullable()
                .references('user_uuid')
                .inTable('users')
                .onDelete('SET NULL');
            table
                .timestamp('updated_at', { useTz: false })
                .notNullable()
                .defaultTo(knex.fn.now());
            table
                .uuid('updated_by_user_uuid')
                .nullable()
                .references('user_uuid')
                .inTable('users')
                .onDelete('SET NULL');
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    if (await knex.schema.hasTable(GroupsTableName)) {
        await knex.schema.alterTable(GroupsTableName, (table) => {
            table.dropColumn('created_by_user_uuid');
            table.dropColumn('updated_at');
            table.dropColumn('updated_by_user_uuid');
        });
    }
}
