import { Knex } from 'knex';

const SCHEDULER_TABLE = 'scheduler';
// This is the name Knex auto-generated when the original migration used table.check()
// in 20230206192228_add_scheduler_tables.ts
const CHECK_NAME = 'scheduler_check';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(SCHEDULER_TABLE, (table) => {
        table
            .uuid('saved_sql_uuid')
            .nullable()
            .references('saved_sql_uuid')
            .inTable('saved_sql')
            .onDelete('CASCADE');

        table.dropChecks(CHECK_NAME);
        table.check(
            `(saved_chart_uuid IS NOT NULL AND dashboard_uuid IS NULL AND saved_sql_uuid IS NULL)
             OR (dashboard_uuid IS NOT NULL AND saved_chart_uuid IS NULL AND saved_sql_uuid IS NULL)
             OR (saved_sql_uuid IS NOT NULL AND saved_chart_uuid IS NULL AND dashboard_uuid IS NULL)`,
            {},
            CHECK_NAME,
        );
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex(SCHEDULER_TABLE).whereNotNull('saved_sql_uuid').delete();

    // Drop the check first since it references saved_sql_uuid
    await knex.schema.alterTable(SCHEDULER_TABLE, (table) => {
        table.dropChecks(CHECK_NAME);
    });

    await knex.schema.alterTable(SCHEDULER_TABLE, (table) => {
        table.dropColumn('saved_sql_uuid');
        table.check(
            `(saved_chart_uuid IS NULL AND dashboard_uuid IS NOT NULL)
             OR (dashboard_uuid IS NULL AND saved_chart_uuid IS NOT NULL)`,
            {},
            CHECK_NAME,
        );
    });
}
