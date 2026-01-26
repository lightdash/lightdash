import { Knex } from 'knex';

const AIAgentIntegrationTableName = 'ai_agent_integration';
const AIAgentSlackIntegrationTableName = 'ai_agent_slack_integration';

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable(AIAgentIntegrationTableName))) {
        await knex.schema.createTable(AIAgentIntegrationTableName, (table) => {
            table
                .uuid('ai_agent_integration_uuid')
                .primary()
                .defaultTo(knex.raw('uuid_generate_v4()'));
            table
                .uuid('ai_agent_uuid')
                .references('ai_agent_uuid')
                .inTable('ai_agent')
                .onDelete('CASCADE')
                .notNullable();
            table.enum('integration_type', ['slack']).notNullable();
            table
                .timestamp('created_at', { useTz: false })
                .notNullable()
                .defaultTo(knex.fn.now());
        });
    }

    if (!(await knex.schema.hasTable(AIAgentSlackIntegrationTableName))) {
        await knex.schema.createTable(
            AIAgentSlackIntegrationTableName,
            (table) => {
                table
                    .uuid('ai_agent_integration_slack_uuid')
                    .primary()
                    .defaultTo(knex.raw('uuid_generate_v4()'));
                table
                    .uuid('organization_uuid')
                    .notNullable()
                    .references('organization_uuid')
                    .inTable('organizations')
                    .onDelete('CASCADE');
                table
                    .uuid('ai_agent_integration_uuid')
                    .notNullable()
                    .unique()
                    .references('ai_agent_integration_uuid')
                    .inTable('ai_agent_integration')
                    .onDelete('CASCADE');
                table.text('slack_channel_id').notNullable();
                table
                    .timestamp('created_at', { useTz: false })
                    .notNullable()
                    .defaultTo(knex.fn.now());

                table.unique(['organization_uuid', 'slack_channel_id']);
            },
        );
    }
}

export async function down(knex: Knex): Promise<void> {
    // drop in reverse order
    if (await knex.schema.hasTable('ai_agent_slack_integration')) {
        await knex.schema.dropTable('ai_agent_slack_integration');
    }

    if (await knex.schema.hasTable('ai_agent_integration')) {
        await knex.schema.dropTable('ai_agent_integration');
    }
}
