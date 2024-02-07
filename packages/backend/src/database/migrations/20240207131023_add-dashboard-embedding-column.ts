import { Knex } from 'knex';

const dashboardsTableName = 'dashboards';

export async function up(knex: Knex): Promise<void> {
    await knex.raw(
        `ALTER TABLE ${dashboardsTableName} ADD COLUMN embedding vector(384);`,
    );
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`ALTER TABLE ${dashboardsTableName} DROP COLUMN embedding;`);
}
