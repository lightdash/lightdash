import { Knex } from 'knex';

const AI_MCP_SERVER_TABLE = 'ai_mcp_server';
const AI_AGENT_TOOL_CALL_TABLE = 'ai_agent_tool_call';

export async function up(knex: Knex): Promise<void> {
    const hasIconUrl = await knex.schema.hasColumn(
        AI_MCP_SERVER_TABLE,
        'icon_url',
    );
    const hasMcpServerUuid = await knex.schema.hasColumn(
        AI_AGENT_TOOL_CALL_TABLE,
        'ai_mcp_server_uuid',
    );

    await knex.schema.alterTable(AI_MCP_SERVER_TABLE, (table) => {
        if (!hasIconUrl) {
            table.text('icon_url').nullable();
        }
    });

    await knex.schema.alterTable(AI_AGENT_TOOL_CALL_TABLE, (table) => {
        if (!hasMcpServerUuid) {
            table
                .uuid('ai_mcp_server_uuid')
                .nullable()
                .references('ai_mcp_server_uuid')
                .inTable(AI_MCP_SERVER_TABLE)
                .onDelete('SET NULL');
            table.index(['ai_mcp_server_uuid']);
        }
    });
}

export async function down(knex: Knex): Promise<void> {
    const hasMcpServerUuid = await knex.schema.hasColumn(
        AI_AGENT_TOOL_CALL_TABLE,
        'ai_mcp_server_uuid',
    );
    const hasIconUrl = await knex.schema.hasColumn(
        AI_MCP_SERVER_TABLE,
        'icon_url',
    );

    await knex.schema.alterTable(AI_AGENT_TOOL_CALL_TABLE, (table) => {
        if (hasMcpServerUuid) {
            table.dropColumn('ai_mcp_server_uuid');
        }
    });

    await knex.schema.alterTable(AI_MCP_SERVER_TABLE, (table) => {
        if (hasIconUrl) {
            table.dropColumn('icon_url');
        }
    });
}
