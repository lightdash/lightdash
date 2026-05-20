import { Knex } from 'knex';

const AiAgentMcpServerTableName = 'ai_agent_mcp_server';
const AiAgentMcpServerToolTableName = 'ai_agent_mcp_server_tool';
const AiMcpServerTableName = 'ai_mcp_server';
const AiMcpServerToolTableName = 'ai_mcp_server_tool';

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable(AiMcpServerToolTableName))) {
        await knex.schema.createTable(AiMcpServerToolTableName, (table) => {
            table
                .uuid('ai_mcp_server_tool_uuid')
                .primary()
                .defaultTo(knex.raw('uuid_generate_v4()'));

            table
                .uuid('ai_mcp_server_uuid')
                .notNullable()
                .references('ai_mcp_server_uuid')
                .inTable(AiMcpServerTableName)
                .onDelete('CASCADE');

            table.text('tool_name').notNullable();
            table.text('title').nullable();
            table.text('description').nullable();
            table.jsonb('input_schema').notNullable();
            table.jsonb('annotations').nullable();
            table.jsonb('meta').nullable();
            table
                .timestamp('created_at', { useTz: false })
                .notNullable()
                .defaultTo(knex.fn.now());
            table
                .timestamp('updated_at', { useTz: false })
                .notNullable()
                .defaultTo(knex.fn.now());

            table.unique(['ai_mcp_server_uuid', 'tool_name']);
            table.index(['ai_mcp_server_uuid']);
        });
    }

    if (!(await knex.schema.hasTable(AiAgentMcpServerToolTableName))) {
        await knex.schema.createTable(
            AiAgentMcpServerToolTableName,
            (table) => {
                table.uuid('ai_agent_mcp_server_uuid').notNullable();
                table.uuid('ai_mcp_server_tool_uuid').notNullable();
                table.boolean('enabled').notNullable();
                table
                    .timestamp('created_at', { useTz: false })
                    .notNullable()
                    .defaultTo(knex.fn.now());
                table
                    .timestamp('updated_at', { useTz: false })
                    .notNullable()
                    .defaultTo(knex.fn.now());

                table.primary([
                    'ai_agent_mcp_server_uuid',
                    'ai_mcp_server_tool_uuid',
                ]);
                table
                    .foreign(['ai_agent_mcp_server_uuid'])
                    .references(['ai_agent_mcp_server_uuid'])
                    .inTable(AiAgentMcpServerTableName)
                    .onDelete('CASCADE');
                table
                    .foreign(['ai_mcp_server_tool_uuid'])
                    .references(['ai_mcp_server_tool_uuid'])
                    .inTable(AiMcpServerToolTableName)
                    .onDelete('CASCADE');
            },
        );
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(AiAgentMcpServerToolTableName);
    await knex.schema.dropTableIfExists(AiMcpServerToolTableName);
}
