import type { Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Adds nullable columns and an index to a new, still-empty table',
} as const;

const tableName = 'data_app_analyses';

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '5s'`);
    await knex.schema.alterTable(tableName, (table) => {
        // An investigation hangs off the detection it explains one anomaly of.
        table
            .uuid('parent_analysis_uuid')
            .nullable()
            .references('data_app_analysis_uuid')
            .inTable(tableName)
            .onDelete('CASCADE')
            .index();
        table.text('anomaly_id').nullable();
        table.uuid('agent_uuid').nullable();
        table.uuid('thread_uuid').nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '5s'`);
    await knex.schema.alterTable(tableName, (table) => {
        table.dropColumn('thread_uuid');
        table.dropColumn('agent_uuid');
        table.dropColumn('anomaly_id');
        table.dropColumn('parent_analysis_uuid');
    });
}
