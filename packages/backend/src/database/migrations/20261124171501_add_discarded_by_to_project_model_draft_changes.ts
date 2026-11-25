import { Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Adds two nullable columns with no default and a foreign key to users; existing rows are not rewritten and the previous release ignores them',
} as const;

const DRAFT_CHANGES = 'project_model_draft_changes';
const DISCARDED_BY = 'discarded_by_user_uuid';
const DISCARDED_AT = 'discarded_at';

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '60s'");
    await knex.schema.alterTable(DRAFT_CHANGES, (table) => {
        table
            .uuid(DISCARDED_BY)
            .nullable()
            .references('user_uuid')
            .inTable('users')
            .onDelete('SET NULL')
            .index();
        table.timestamp(DISCARDED_AT, { useTz: true }).nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '60s'");
    await knex.schema.alterTable(DRAFT_CHANGES, (table) => {
        table.dropColumn(DISCARDED_AT);
        table.dropColumn(DISCARDED_BY);
    });
}
