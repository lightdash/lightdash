import { Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Adds a nullable column with no default, its foreign key and an index on a small table; the previous release ignores the column',
} as const;

const DRAFT_CHANGES = 'project_model_draft_changes';
const COLUMN = 'workspace_uuid';

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '60s'");
    await knex.schema.alterTable(DRAFT_CHANGES, (table) => {
        table
            .uuid(COLUMN)
            .nullable()
            .references('semantic_studio_workspace_uuid')
            .inTable('semantic_studio_workspaces')
            .onDelete('SET NULL')
            .index();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '60s'");
    await knex.schema.alterTable(DRAFT_CHANGES, (table) => {
        table.dropColumn(COLUMN);
    });
}
