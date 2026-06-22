import { Knex } from 'knex';

const AiPromptSteerTableName = 'ai_prompt_steer';
const AiPromptTableName = 'ai_prompt';
const UserTableName = 'users';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable(AiPromptSteerTableName, (table) => {
        table
            .uuid('ai_prompt_steer_uuid')
            .primary()
            .defaultTo(knex.raw('uuid_generate_v4()'));
        table
            .uuid('ai_prompt_uuid')
            .notNullable()
            .references('ai_prompt_uuid')
            .inTable(AiPromptTableName)
            .onDelete('CASCADE');
        table
            .uuid('created_by_user_uuid')
            .notNullable()
            .references('user_uuid')
            .inTable(UserTableName)
            .onDelete('CASCADE');
        table.text('message').notNullable();
        table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
        table.timestamp('consumed_at').nullable();
        table.integer('consumed_step').nullable();

        table.index(['ai_prompt_uuid', 'consumed_at']);
        table.index('created_at');
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(AiPromptSteerTableName);
}
