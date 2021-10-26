import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    // Cascade will delete all projects with this type
    await knex('dbt_connection_types')
        .where('dbt_connection_type', 'dbt_remote_server')
        .delete();
}

export async function down(knex: Knex): Promise<void> {
    await knex('dbt_connection_types').insert([
        { dbt_connection_type: 'dbt_remote_server' },
    ]);
}
