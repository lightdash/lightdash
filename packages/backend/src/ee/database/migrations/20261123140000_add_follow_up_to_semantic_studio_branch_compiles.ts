import { Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Adds a nullable column and a column with a constant default; both are metadata-only changes',
} as const;

const BranchCompilesTableName = 'semantic_studio_branch_compiles';

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '60s'");
    await knex.schema.alterTable(BranchCompilesTableName, (table) => {
        table.boolean('requested_by_agent').notNullable().defaultTo(false);
        table.timestamp('follow_up_claimed_at', { useTz: true }).nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '60s'");
    await knex.schema.alterTable(BranchCompilesTableName, (table) => {
        table.dropColumn('requested_by_agent');
        table.dropColumn('follow_up_claimed_at');
    });
}
