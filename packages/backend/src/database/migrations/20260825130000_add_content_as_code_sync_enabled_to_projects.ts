import { Knex } from 'knex';

const ProjectTableName = 'projects';
const ColumnName = 'content_as_code_sync_enabled';

export const classification = {
    kind: 'safe',
    reason: 'Adds an expand-only nullable boolean for persisted content-as-code sync',
} as const;

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.alterTable(ProjectTableName, (table) => {
        table.boolean(ColumnName).nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.alterTable(ProjectTableName, (table) => {
        table.dropColumn(ColumnName);
    });
}
