import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '60s'");
    await knex.schema.alterTable('scheduler', (table) => {
        table
            .timestamp('bigquery_last_scheduled_time', { useTz: true })
            .nullable();
        table.text('bigquery_missing_table_hash').nullable();
        table
            .timestamp('bigquery_missing_table_first_at', { useTz: true })
            .nullable();
        table.integer('bigquery_missing_table_count').nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '60s'");
    await knex.schema.alterTable('scheduler', (table) => {
        table.dropColumns(
            'bigquery_last_scheduled_time',
            'bigquery_missing_table_hash',
            'bigquery_missing_table_first_at',
            'bigquery_missing_table_count',
        );
    });
}
