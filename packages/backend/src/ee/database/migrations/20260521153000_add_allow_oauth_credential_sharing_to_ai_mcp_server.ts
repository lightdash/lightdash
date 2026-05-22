import { Knex } from 'knex';

const AI_MCP_SERVER_TABLE = 'ai_mcp_server';
const COLUMN_NAME = 'allow_oauth_credential_sharing';

export async function up(knex: Knex): Promise<void> {
    const hasColumn = await knex.schema.hasColumn(
        AI_MCP_SERVER_TABLE,
        COLUMN_NAME,
    );

    if (!hasColumn) {
        await knex.schema.alterTable(AI_MCP_SERVER_TABLE, (table) => {
            table.boolean(COLUMN_NAME).notNullable().defaultTo(false);
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    const hasColumn = await knex.schema.hasColumn(
        AI_MCP_SERVER_TABLE,
        COLUMN_NAME,
    );

    if (hasColumn) {
        await knex.schema.alterTable(AI_MCP_SERVER_TABLE, (table) => {
            table.dropColumn(COLUMN_NAME);
        });
    }
}
