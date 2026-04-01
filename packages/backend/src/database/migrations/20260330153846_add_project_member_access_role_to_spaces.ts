import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable('spaces', (table) => {
        table.string('project_member_access_role').nullable().defaultTo(null);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable('spaces', (table) => {
        table.dropColumn('project_member_access_role');
    });
}
