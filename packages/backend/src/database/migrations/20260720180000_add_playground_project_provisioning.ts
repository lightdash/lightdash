import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable('projects', (table) => {
        table.text('provisioning_source').nullable();
    });
    await knex.schema.alterTable('onboarding', (table) => {
        table
            .timestamp('playground_project_deleted_at', { useTz: false })
            .nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable('onboarding', (table) => {
        table.dropColumn('playground_project_deleted_at');
    });
    await knex.schema.alterTable('projects', (table) => {
        table.dropColumn('provisioning_source');
    });
}
