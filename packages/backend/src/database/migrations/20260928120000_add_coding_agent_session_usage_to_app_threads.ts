import { type Knex } from 'knex';

const AppThreadsTableName = 'app_threads';
const Column = 'coding_agent_session_usage';

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.alterTable(AppThreadsTableName, (table) => {
        // The coding agent CLI's running totals for the thread's session,
        // subtracted from the next run's result so it reports its own share.
        table.jsonb(Column).nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.alterTable(AppThreadsTableName, (table) => {
        table.dropColumn(Column);
    });
}
