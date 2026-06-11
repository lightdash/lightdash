import { Knex } from 'knex';

const AI_AGENT_TABLE = 'ai_agent';
const ONE_SYSTEM_PER_PROJECT_INDEX = 'ai_agent_one_system_agent_per_project';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(AI_AGENT_TABLE, (table) => {
        // System agents are the built-in fallback used when an org has no
        // configured agents. They are hidden from normal agent listings so they
        // never count as "an agent configured".
        table.boolean('is_system').notNullable().defaultTo(false);
    });

    // At most one system agent per (organization, project).
    await knex.raw(`
        CREATE UNIQUE INDEX ${ONE_SYSTEM_PER_PROJECT_INDEX}
        ON ${AI_AGENT_TABLE} (organization_uuid, project_uuid)
        WHERE is_system
    `);
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`DROP INDEX IF EXISTS ${ONE_SYSTEM_PER_PROJECT_INDEX}`);
    await knex.schema.alterTable(AI_AGENT_TABLE, (table) => {
        table.dropColumn('is_system');
    });
}
