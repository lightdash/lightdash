import { Knex } from 'knex';

const tableName = 'scheduler_bigquery_attempts';

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '60s'");
    await knex.schema.createTable(tableName, (table) => {
        table
            .uuid('scheduler_uuid')
            .notNullable()
            .references('scheduler_uuid')
            .inTable('scheduler')
            .onDelete('CASCADE');
        table.text('source_job_id').notNullable();
        table.timestamp('scheduled_time', { useTz: true }).notNullable();
        table.integer('highest_queued_attempt').notNullable();
        table.primary(['scheduler_uuid', 'source_job_id']);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '60s'");
    await knex.schema.dropTable(tableName);
}
