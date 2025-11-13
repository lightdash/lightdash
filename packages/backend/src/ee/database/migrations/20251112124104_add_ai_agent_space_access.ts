import { Knex } from 'knex';

const AiAgentSpaceAccessTableName = 'ai_agent_space_access';
const AiAgentsTableName = 'ai_agent';
const SpacesTableName = 'spaces';

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable(AiAgentSpaceAccessTableName))) {
        await knex.schema.createTable(
            AiAgentSpaceAccessTableName,
            (tableBuilder) => {
                tableBuilder
                    .uuid('ai_agent_uuid')
                    .notNullable()
                    .references('ai_agent_uuid')
                    .inTable(AiAgentsTableName)
                    .onDelete('CASCADE');
                tableBuilder
                    .uuid('space_uuid')
                    .notNullable()
                    .references('space_uuid')
                    .inTable(SpacesTableName)
                    .onDelete('CASCADE');
                tableBuilder
                    .timestamp('created_at', { useTz: false })
                    .notNullable()
                    .defaultTo(knex.fn.now());
                tableBuilder.primary(['ai_agent_uuid', 'space_uuid']);
                tableBuilder.index('ai_agent_uuid');
            },
        );
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(AiAgentSpaceAccessTableName);
}
