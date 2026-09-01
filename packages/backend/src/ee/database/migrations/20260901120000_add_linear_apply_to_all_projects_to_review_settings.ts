import type { Knex } from 'knex';

const settingsTable = 'ai_agent_review_notification_settings';
const column = 'linear_apply_to_all_projects';

export const classification = {
    kind: 'safe',
    reason: 'Adds a defaulted boolean column to a small org-scoped settings table so Linear review export can cover every project.',
} as const;

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '5s'`);

    await knex.schema.alterTable(settingsTable, (table) => {
        table.boolean(column).notNullable().defaultTo(false);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '5s'`);

    await knex.schema.alterTable(settingsTable, (table) => {
        table.dropColumn(column);
    });
}
