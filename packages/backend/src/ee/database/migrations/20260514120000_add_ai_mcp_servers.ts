import { Knex } from 'knex';

const AI_MCP_SERVER_TABLE = 'ai_mcp_server';
const AI_AGENT_MCP_SERVER_TABLE = 'ai_agent_mcp_server';

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable(AI_MCP_SERVER_TABLE))) {
        await knex.schema.createTable(AI_MCP_SERVER_TABLE, (table) => {
            table
                .uuid('ai_mcp_server_uuid')
                .primary()
                .defaultTo(knex.raw('uuid_generate_v4()'));

            table
                .uuid('project_uuid')
                .notNullable()
                .references('project_uuid')
                .inTable('projects')
                .onDelete('CASCADE');

            table.string('name').notNullable();
            table.text('url').notNullable();
            table.string('auth_type').notNullable();
            table.binary('encrypted_credentials');

            table
                .timestamp('created_at', { useTz: false })
                .notNullable()
                .defaultTo(knex.fn.now());
            table
                .timestamp('updated_at', { useTz: false })
                .notNullable()
                .defaultTo(knex.fn.now());

            table.index(['project_uuid']);
        });
    }

    if (!(await knex.schema.hasTable(AI_AGENT_MCP_SERVER_TABLE))) {
        await knex.schema.createTable(AI_AGENT_MCP_SERVER_TABLE, (table) => {
            table
                .uuid('ai_agent_uuid')
                .notNullable()
                .references('ai_agent_uuid')
                .inTable('ai_agent')
                .onDelete('CASCADE');

            table
                .uuid('ai_mcp_server_uuid')
                .notNullable()
                .references('ai_mcp_server_uuid')
                .inTable(AI_MCP_SERVER_TABLE)
                .onDelete('CASCADE');

            table
                .timestamp('created_at', { useTz: false })
                .notNullable()
                .defaultTo(knex.fn.now());

            table.primary(['ai_agent_uuid', 'ai_mcp_server_uuid']);
            table.index(['ai_mcp_server_uuid']);
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    if (await knex.schema.hasTable(AI_AGENT_MCP_SERVER_TABLE)) {
        await knex.schema.dropTable(AI_AGENT_MCP_SERVER_TABLE);
    }

    if (await knex.schema.hasTable(AI_MCP_SERVER_TABLE)) {
        await knex.schema.dropTable(AI_MCP_SERVER_TABLE);
    }
}
