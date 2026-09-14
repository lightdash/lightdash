import { type Knex } from 'knex';

const PROJECTS_TABLE = 'projects';
const AGENT_SQL_SCOPE = 'agent_sql_scope';

// Restricts which schemas/catalogs the AI agent may read via raw SQL.
// NULL means unrestricted, which is the behaviour every existing project
// keeps after this migration.
export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(PROJECTS_TABLE, (table) => {
        table.jsonb(AGENT_SQL_SCOPE).nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(PROJECTS_TABLE, (table) => {
        table.dropColumn(AGENT_SQL_SCOPE);
    });
}
