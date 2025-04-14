import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable('project_memberships', (table) => {
        table.index(['user_id']);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable('project_memberships', (table) => {
        table.dropIndex(['user_id']);
    });
}
