import { Knex } from 'knex';

const AI_MCP_SERVER_TABLE = 'ai_mcp_server';

export async function up(knex: Knex): Promise<void> {
    const hasConnectionStatus = await knex.schema.hasColumn(
        AI_MCP_SERVER_TABLE,
        'connection_status',
    );
    const hasError = await knex.schema.hasColumn(AI_MCP_SERVER_TABLE, 'error');

    await knex.schema.alterTable(AI_MCP_SERVER_TABLE, (table) => {
        if (!hasConnectionStatus) {
            table.string('connection_status').nullable();
        }
        if (!hasError) {
            table.text('error').nullable();
        }
    });
}

export async function down(knex: Knex): Promise<void> {
    const hasConnectionStatus = await knex.schema.hasColumn(
        AI_MCP_SERVER_TABLE,
        'connection_status',
    );
    const hasError = await knex.schema.hasColumn(AI_MCP_SERVER_TABLE, 'error');

    await knex.schema.alterTable(AI_MCP_SERVER_TABLE, (table) => {
        if (hasConnectionStatus) {
            table.dropColumn('connection_status');
        }
        if (hasError) {
            table.dropColumn('error');
        }
    });
}
