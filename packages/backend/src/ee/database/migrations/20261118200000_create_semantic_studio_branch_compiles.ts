import { Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Creates a new empty table keyed by an existing table, with no change to existing rows',
} as const;

const BranchCompilesTableName = 'semantic_studio_branch_compiles';

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '60s'");
    await knex.schema.createTable(BranchCompilesTableName, (table) => {
        table
            .uuid('semantic_studio_workspace_uuid')
            .primary()
            .references('semantic_studio_workspace_uuid')
            .inTable('semantic_studio_workspaces')
            .onDelete('CASCADE');
        table.uuid('compile_request_uuid').notNullable();
        table.text('status').notNullable();
        table.text('branch').nullable();
        table.text('error').nullable();
        table.jsonb('explores').nullable();
        table
            .timestamp('requested_at', { useTz: true })
            .notNullable()
            .defaultTo(knex.fn.now());
        table.timestamp('compiled_at', { useTz: true }).nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '60s'");
    await knex.schema.dropTableIfExists(BranchCompilesTableName);
}
