import { Knex } from 'knex';

const AiAgentGroupAccessTableName = 'ai_agent_group_access';
const AiAgentsTableName = 'ai_agent';
const GroupsTableName = 'groups';

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable(AiAgentGroupAccessTableName))) {
        await knex.schema.createTable(
            AiAgentGroupAccessTableName,
            (tableBuilder) => {
                tableBuilder
                    .uuid('group_uuid')
                    .notNullable()
                    .references('group_uuid')
                    .inTable(GroupsTableName)
                    .onDelete('CASCADE');
                tableBuilder
                    .uuid('ai_agent_uuid')
                    .notNullable()
                    .references('ai_agent_uuid')
                    .inTable(AiAgentsTableName)
                    .onDelete('CASCADE');
                tableBuilder
                    .timestamp('created_at', { useTz: false })
                    .notNullable()
                    .defaultTo(knex.fn.now());
                tableBuilder.unique(['group_uuid', 'ai_agent_uuid']);
            },
        );
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(AiAgentGroupAccessTableName);
}
