import { Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Adds a nullable column with no default, which rewrites nothing and is ignored by the previous release',
} as const;

const DRAFT_CHANGES = 'project_model_draft_changes';
const COLUMN = 'base_versions';

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '60s'");
    await knex.schema.alterTable(DRAFT_CHANGES, (table) => {
        table.jsonb(COLUMN).nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '60s'");
    await knex.schema.alterTable(DRAFT_CHANGES, (table) => {
        table.dropColumn(COLUMN);
    });
}
