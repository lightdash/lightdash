import { Knex } from 'knex';

const QUERY_HISTORY_TABLE = 'query_history';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(QUERY_HISTORY_TABLE, (table) => {
        // Add index on created_at for efficient cleanup job queries
        table.index('created_at');

        // Add index on organization_uuid for efficient CASCADE deletions
        table.index('organization_uuid');

        // Add index on created_by_user_uuid for efficient user-based queries
        table.index('created_by_user_uuid');

        // Add index on project_uuid for efficient project-based queries
        table.index('project_uuid');
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(QUERY_HISTORY_TABLE, (table) => {
        // Drop indexes in reverse order
        table.dropIndex('project_uuid');
        table.dropIndex('created_by_user_uuid');
        table.dropIndex('organization_uuid');
        table.dropIndex('created_at');
    });
}
