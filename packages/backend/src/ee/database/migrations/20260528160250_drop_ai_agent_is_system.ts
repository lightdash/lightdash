import { Knex } from 'knex';

const AI_AGENT_TABLE = 'ai_agent';
const ONE_SYSTEM_PER_PROJECT_INDEX = 'ai_agent_one_system_agent_per_project';

export async function up(knex: Knex): Promise<void> {
    // Purge any rows that were created as the built-in fallback agent before
    // dropping the column. FKs on ai_thread / ai_agent_integration / etc. all
    // cascade, so threads owned by the system agent are removed too. This was
    // a flag-gated, never-GA fallback, so losing those threads is acceptable —
    // and necessary, since the listing filter that hid these rows has been
    // removed, so without this delete they would surface in the UI as
    // unexpected "Lightdash Assistant" agents.
    await knex(AI_AGENT_TABLE).where('is_system', true).delete();

    await knex.raw(`DROP INDEX IF EXISTS ${ONE_SYSTEM_PER_PROJECT_INDEX}`);
    await knex.schema.alterTable(AI_AGENT_TABLE, (table) => {
        table.dropColumn('is_system');
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(AI_AGENT_TABLE, (table) => {
        table.boolean('is_system').notNullable().defaultTo(false);
    });

    await knex.raw(`
        CREATE UNIQUE INDEX ${ONE_SYSTEM_PER_PROJECT_INDEX}
        ON ${AI_AGENT_TABLE} (organization_uuid, project_uuid)
        WHERE is_system
    `);
}
