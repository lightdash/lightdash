import { type Knex } from 'knex';

const tableName = 'usage_processing_status';

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.createTable(tableName, (table) => {
        table
            .uuid('organization_uuid')
            .primary()
            .references('organization_uuid')
            .inTable('organizations')
            .onDelete('CASCADE');
        table.uuid('run_uuid').notNullable();
        table.timestamp('started_at', { useTz: true }).notNullable();
        table.timestamp('finished_at', { useTz: true }).nullable();
        table
            .enu('status', ['running', 'success', 'partial', 'failed'])
            .notNullable();
        table.timestamp('last_successful_at', { useTz: true }).nullable();
        table.jsonb('stats').notNullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.dropTable(tableName);
}
