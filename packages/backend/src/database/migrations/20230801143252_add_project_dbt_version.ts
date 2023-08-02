import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable('projects', (t) => {
        t.string('dbt_version').nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable('projects', (t) => {
        t.dropColumns('dbt_version');
    });
}
