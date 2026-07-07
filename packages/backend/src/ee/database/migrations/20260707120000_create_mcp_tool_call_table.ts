import { Knex } from 'knex';

const McpToolCallTableName = 'mcp_tool_call';
const McpClientInfoTableName = 'mcp_client_info';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable(McpToolCallTableName, (table) => {
        table
            .uuid('mcp_tool_call_uuid')
            .primary()
            .defaultTo(knex.raw('uuid_generate_v4()'));
        table.uuid('organization_uuid').notNullable();
        table.uuid('user_uuid').notNullable();
        table.uuid('project_uuid').nullable();
        table.uuid('agent_uuid').nullable();
        table.text('tool_name').notNullable();
        table.jsonb('tool_args').notNullable();
        table.text('status').notNullable();
        table.text('error_message').nullable();
        table.integer('duration_ms').notNullable();
        table.jsonb('result_metadata').nullable();
        table.text('client_name').nullable();
        table.text('client_version').nullable();
        table.text('user_agent').nullable();
        table.text('auth_type').notNullable();
        table.text('protocol_version').nullable();
        table.timestamp('created_at').defaultTo(knex.fn.now()).notNullable();

        table
            .foreign('organization_uuid')
            .references('organization_uuid')
            .inTable('organizations')
            .onDelete('CASCADE');
        table
            .foreign('user_uuid')
            .references('user_uuid')
            .inTable('users')
            .onDelete('CASCADE');
        // Rows outlive their project/agent so org-level usage history is
        // preserved; the 90-day retention job is the real bound on growth.
        table
            .foreign('project_uuid')
            .references('project_uuid')
            .inTable('projects')
            .onDelete('SET NULL');
        table
            .foreign('agent_uuid')
            .references('ai_agent_uuid')
            .inTable('ai_agent')
            .onDelete('SET NULL');

        table.index(['organization_uuid', 'created_at']);
        table.index(['project_uuid', 'created_at']);
        // Retention cleanup deletes purely by age
        table.index('created_at');
    });

    // Client identity from the MCP initialize handshake. The transport is
    // stateless (one server per POST), so tool-call requests never carry
    // clientInfo — it only appears on initialize requests. This table keeps
    // the latest handshake per (user, org, user_agent); tool calls attach it
    // by matching their request's user-agent, so concurrent clients of the
    // same user don't overwrite each other.
    await knex.schema.createTable(McpClientInfoTableName, (table) => {
        table.uuid('user_uuid').notNullable();
        table.uuid('organization_uuid').notNullable();
        table.text('user_agent').notNullable();
        table.text('client_name').notNullable();
        table.text('client_version').nullable();
        table.timestamp('created_at').defaultTo(knex.fn.now()).notNullable();
        table.timestamp('updated_at').defaultTo(knex.fn.now()).notNullable();

        table.primary(['user_uuid', 'organization_uuid', 'user_agent']);

        table
            .foreign('user_uuid')
            .references('user_uuid')
            .inTable('users')
            .onDelete('CASCADE');
        table
            .foreign('organization_uuid')
            .references('organization_uuid')
            .inTable('organizations')
            .onDelete('CASCADE');
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(McpClientInfoTableName);
    await knex.schema.dropTableIfExists(McpToolCallTableName);
}
