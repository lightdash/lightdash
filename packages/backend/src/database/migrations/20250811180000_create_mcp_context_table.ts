import { Knex } from 'knex';

const MCP_CONTEXT_TABLE = 'mcp_context';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable(MCP_CONTEXT_TABLE, (table) => {
        table.uuid('user_uuid').notNullable();
        table.uuid('organization_uuid').notNullable();
        table.jsonb('context').notNullable().defaultTo('{}');
        table
            .timestamp('created_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());
        table
            .timestamp('updated_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());

        // Primary key on user_uuid and organization_uuid combination
        table.primary(['user_uuid', 'organization_uuid']);

        // Foreign key constraints
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

        // Indexes for faster lookups
        table.index('user_uuid');
        table.index('organization_uuid');
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(MCP_CONTEXT_TABLE);
}
