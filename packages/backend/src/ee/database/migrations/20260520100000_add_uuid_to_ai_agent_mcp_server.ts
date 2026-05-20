import { Knex } from 'knex';

const AiAgentMcpServerTableName = 'ai_agent_mcp_server';
const AiAgentMcpServerUuidUniqueIndexName = 'ai_agent_mcp_server_uuid_unique';

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable(AiAgentMcpServerTableName))) {
        return;
    }

    const hasUuidColumn = await knex.schema.hasColumn(
        AiAgentMcpServerTableName,
        'ai_agent_mcp_server_uuid',
    );

    if (!hasUuidColumn) {
        await knex.schema.alterTable(AiAgentMcpServerTableName, (table) => {
            table
                .uuid('ai_agent_mcp_server_uuid')
                .notNullable()
                .defaultTo(knex.raw('uuid_generate_v4()'));
        });
    }

    await knex.raw(`
        CREATE UNIQUE INDEX IF NOT EXISTS ${AiAgentMcpServerUuidUniqueIndexName}
        ON ${AiAgentMcpServerTableName} (ai_agent_mcp_server_uuid)
    `);
}

export async function down(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable(AiAgentMcpServerTableName))) {
        return;
    }

    await knex.raw(`
        DROP INDEX IF EXISTS ${AiAgentMcpServerUuidUniqueIndexName}
    `);

    const hasUuidColumn = await knex.schema.hasColumn(
        AiAgentMcpServerTableName,
        'ai_agent_mcp_server_uuid',
    );

    if (hasUuidColumn) {
        await knex.schema.alterTable(AiAgentMcpServerTableName, (table) => {
            table.dropColumn('ai_agent_mcp_server_uuid');
        });
    }
}
