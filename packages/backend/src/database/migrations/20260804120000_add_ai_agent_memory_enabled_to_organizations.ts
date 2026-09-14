import { Knex } from 'knex';

const OrganizationsTableName = 'organizations';
const FeatureFlagOverridesTableName = 'feature_flag_overrides';
const AiAgentMemoryFlag = 'ai-agent-memory';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(OrganizationsTableName, (table) => {
        table.boolean('ai_agent_memory_enabled').nullable();
    });

    if (await knex.schema.hasTable(FeatureFlagOverridesTableName)) {
        await knex.raw(`
            UPDATE ${OrganizationsTableName} o
            SET ai_agent_memory_enabled = true
            FROM ${FeatureFlagOverridesTableName} ffo
            WHERE ffo.organization_uuid = o.organization_uuid
              AND ffo.user_uuid IS NULL
              AND ffo.flag_id = '${AiAgentMemoryFlag}'
              AND ffo.enabled = true
        `);
    }

    await knex.raw(`
        ALTER TABLE ${OrganizationsTableName}
        ALTER COLUMN ai_agent_memory_enabled SET DEFAULT true
    `);
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(OrganizationsTableName, (table) => {
        table.dropColumn('ai_agent_memory_enabled');
    });
}
