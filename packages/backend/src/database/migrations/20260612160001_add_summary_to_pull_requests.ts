import { Knex } from 'knex';

const pullRequestsTable = 'pull_requests';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(pullRequestsTable, (table) => {
        table.text('summary').nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(pullRequestsTable, (table) => {
        table.dropColumn('summary');
    });
}
