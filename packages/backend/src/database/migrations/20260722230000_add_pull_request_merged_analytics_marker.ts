import { Knex } from 'knex';

const PullRequestsTableName = 'pull_requests';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(PullRequestsTableName, (table) => {
        table
            .timestamp('merged_analytics_emitted_at', { useTz: true })
            .nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(PullRequestsTableName, (table) => {
        table.dropColumn('merged_analytics_emitted_at');
    });
}
