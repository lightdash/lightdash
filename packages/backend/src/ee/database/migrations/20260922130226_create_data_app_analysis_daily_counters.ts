import { Knex } from 'knex';

const tableName = 'data_app_analysis_daily_counters';

// Model runs per organization, operation and UTC day, for the daily caps.
export async function up(knex: Knex): Promise<void> {
    if (await knex.schema.hasTable(tableName)) return;
    await knex.schema.createTable(tableName, (table) => {
        table
            .uuid('organization_uuid')
            .notNullable()
            .references('organization_uuid')
            .inTable('organizations')
            .onDelete('CASCADE');
        table.text('operation').notNullable();
        table.date('day').notNullable();
        table.integer('request_count').notNullable().defaultTo(0);
        // organization_uuid is covered by the primary key prefix.
        table.primary(['organization_uuid', 'operation', 'day']);
        table.index(['day']);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(tableName);
}
