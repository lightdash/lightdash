import { Knex } from 'knex';

const MCP_TOOL_CALL_TABLE = 'mcp_tool_call';
const AI_MCP_SERVER_TABLE = 'ai_mcp_server';

export const classification = {
    kind: 'safe',
    reason: 'Adds a defaulted direction column and a nullable indexed FK to an append-only activity log; existing rows and readers are unaffected.',
} as const;

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET lock_timeout = '10s'`);
    try {
        await knex.schema.alterTable(MCP_TOOL_CALL_TABLE, (table) => {
            // Existing rows are all inbound calls into Lightdash's MCP server
            table.text('direction').notNullable().defaultTo('inbound');
            table
                .uuid('ai_mcp_server_uuid')
                .nullable()
                .references('ai_mcp_server_uuid')
                .inTable(AI_MCP_SERVER_TABLE)
                .onDelete('SET NULL')
                .index();
        });
    } finally {
        await knex.raw('RESET lock_timeout');
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`SET lock_timeout = '10s'`);
    try {
        await knex.schema.alterTable(MCP_TOOL_CALL_TABLE, (table) => {
            table.dropColumn('ai_mcp_server_uuid');
            table.dropColumn('direction');
        });
    } finally {
        await knex.raw('RESET lock_timeout');
    }
}
