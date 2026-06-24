import { Knex } from 'knex';

const SCHEDULER_TABLE = 'scheduler';
const CHECK_NAME = 'scheduler_check';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(SCHEDULER_TABLE, (table) => {
        table.uuid('agent_uuid').nullable().index();
        table.text('prompt').nullable();
        table.uuid('source_thread_uuid').nullable().index();

        // Exactly one content resource, and an agent always implies a prompt
        // (the reverse need not hold — a prompt may outlive a detached agent).
        table.dropChecks(CHECK_NAME);
        table.check(
            `num_nonnulls(saved_chart_uuid, dashboard_uuid, saved_sql_uuid, app_uuid) = 1
             AND (agent_uuid IS NULL OR prompt IS NOT NULL)`,
            {},
            CHECK_NAME,
        );
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(SCHEDULER_TABLE, (table) => {
        table.dropChecks(CHECK_NAME);
    });

    await knex.schema.alterTable(SCHEDULER_TABLE, (table) => {
        table.dropColumn('agent_uuid');
        table.dropColumn('prompt');
        table.dropColumn('source_thread_uuid');
        // Restore the original "exactly one resource" constraint.
        table.check(
            `num_nonnulls(saved_chart_uuid, dashboard_uuid, saved_sql_uuid, app_uuid) = 1`,
            {},
            CHECK_NAME,
        );
    });
}
