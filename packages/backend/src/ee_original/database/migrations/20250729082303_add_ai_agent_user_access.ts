import { Knex } from 'knex';

const AiAgentUserAccessTableName = 'ai_agent_user_access';
const AiAgentsTableName = 'ai_agent';
const UsersTableName = 'users';

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable(AiAgentUserAccessTableName))) {
        await knex.schema.createTable(
            AiAgentUserAccessTableName,
            (tableBuilder) => {
                tableBuilder
                    .uuid('user_uuid')
                    .notNullable()
                    .references('user_uuid')
                    .inTable(UsersTableName)
                    .index()
                    .onDelete('CASCADE');
                tableBuilder
                    .uuid('ai_agent_uuid')
                    .index()
                    .notNullable()
                    .references('ai_agent_uuid')
                    .inTable(AiAgentsTableName)
                    .onDelete('CASCADE');
                tableBuilder
                    .timestamp('created_at', { useTz: false })
                    .notNullable()
                    .defaultTo(knex.fn.now());
                tableBuilder.unique(['user_uuid', 'ai_agent_uuid']);
            },
        );
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(AiAgentUserAccessTableName);
}
