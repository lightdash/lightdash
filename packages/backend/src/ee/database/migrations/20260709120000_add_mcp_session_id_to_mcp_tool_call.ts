import { Knex } from 'knex';

const McpToolCallTableName = 'mcp_tool_call';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(McpToolCallTableName, (table) => {
        // uuid (not text) is safe: the server only ever mints UUID session
        // ids and drops any non-UUID value echoed by clients
        table.uuid('mcp_session_id').nullable();
        table.index(['mcp_session_id']);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(McpToolCallTableName, (table) => {
        table.dropIndex(['mcp_session_id']);
        table.dropColumn('mcp_session_id');
    });
}
