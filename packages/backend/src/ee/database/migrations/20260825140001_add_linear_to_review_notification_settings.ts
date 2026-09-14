import type { Knex } from 'knex';

const settingsTable = 'ai_agent_review_notification_settings';

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '5s'`);

    await knex.schema.alterTable(settingsTable, (table) => {
        table.boolean('linear_enabled').notNullable().defaultTo(false);
        table.text('linear_team_id').nullable();
        table.text('linear_project_id').nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '5s'`);

    await knex.schema.alterTable(settingsTable, (table) => {
        table.dropColumn('linear_enabled');
        table.dropColumn('linear_team_id');
        table.dropColumn('linear_project_id');
    });
}
