import { Knex } from 'knex';

const usersTable = 'users';
const projectsTable = 'projects';

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasColumn(projectsTable, 'created_by_user_uuid'))) {
        await knex.schema.table(projectsTable, (tableBuilder) => {
            tableBuilder
                .uuid('created_by_user_uuid')
                .references('user_uuid')
                .inTable(usersTable)
                .nullable()
                .onDelete('SET NULL');
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    if (await knex.schema.hasColumn(projectsTable, 'created_by_user_uuid')) {
        await knex.schema.table(projectsTable, (tableBuilder) => {
            tableBuilder.dropColumn('created_by_user_uuid');
        });
    }
}
