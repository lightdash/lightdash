import { Knex } from 'knex';

const MCP_TOOL_CALL_TABLE = 'mcp_tool_call';

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '60s'");
    await knex.schema.alterTable(MCP_TOOL_CALL_TABLE, (table) => {
        table.text('error_kind').nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '60s'");
    await knex.schema.alterTable(MCP_TOOL_CALL_TABLE, (table) => {
        table.dropColumn('error_kind');
    });
}
