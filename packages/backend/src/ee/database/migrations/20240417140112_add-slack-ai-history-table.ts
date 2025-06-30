import { Knex } from 'knex';

const AI_THREAD_TABLE_NAME = 'ai_thread';
const AI_SLACK_THREAD_TABLE_NAME = 'ai_slack_thread';
const AI_PROMPT_TABLE_NAME = 'ai_prompt';
const AI_SLACK_PROMPT_TABLE_NAME = 'ai_slack_prompt';

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable(AI_THREAD_TABLE_NAME))) {
        await knex.schema.createTable(AI_THREAD_TABLE_NAME, (tableBuilder) => {
            tableBuilder
                .uuid('ai_thread_uuid')
                .notNullable()
                .primary()
                .defaultTo(knex.raw('uuid_generate_v4()'));
            tableBuilder
                .timestamp('created_at', { useTz: false })
                .notNullable()
                .defaultTo(knex.fn.now());
            tableBuilder
                .uuid('organization_uuid')
                .notNullable()
                .references('organization_uuid')
                .inTable('organizations')
                .onDelete('CASCADE');
            tableBuilder
                .text('created_from') // slack, web, etc
                .notNullable();
        });
    }

    if (!(await knex.schema.hasTable(AI_SLACK_THREAD_TABLE_NAME))) {
        await knex.schema.createTable(
            AI_SLACK_THREAD_TABLE_NAME,
            (tableBuilder) => {
                tableBuilder
                    .uuid('ai_slack_thread_uuid')
                    .notNullable()
                    .primary()
                    .defaultTo(knex.raw('uuid_generate_v4()'));
                tableBuilder
                    .uuid('ai_thread_uuid')
                    .unique()
                    .notNullable()
                    .references('ai_thread_uuid')
                    .inTable(AI_THREAD_TABLE_NAME)
                    .onDelete('CASCADE');
                tableBuilder.text('slack_user_id').notNullable();
                tableBuilder.text('slack_channel_id').notNullable();
                tableBuilder.text('slack_thread_ts').notNullable();

                tableBuilder.unique(['slack_channel_id', 'slack_thread_ts']);
            },
        );
    }

    if (!(await knex.schema.hasTable(AI_PROMPT_TABLE_NAME))) {
        await knex.schema.createTable(AI_PROMPT_TABLE_NAME, (tableBuilder) => {
            tableBuilder
                .uuid('ai_prompt_uuid')
                .notNullable()
                .primary()
                .defaultTo(knex.raw('uuid_generate_v4()'));
            tableBuilder
                .timestamp('created_at', { useTz: false })
                .notNullable()
                .defaultTo(knex.fn.now());
            tableBuilder
                .uuid('ai_thread_uuid')
                .notNullable()
                .references('ai_thread_uuid')
                .inTable(AI_THREAD_TABLE_NAME)
                .onDelete('CASCADE');
            tableBuilder
                .uuid('created_by_user_uuid')
                .nullable()
                .references('user_uuid')
                .inTable('users')
                .onDelete('SET NULL');
            tableBuilder.text('prompt').notNullable();
            tableBuilder.text('response').nullable();
            // TODO: remove this column
            tableBuilder
                .uuid('response_project_uuid')
                .nullable()
                .references('project_uuid')
                .inTable('projects')
                .onDelete('CASCADE');
            tableBuilder.jsonb('response_metric_query').nullable();
            tableBuilder.jsonb('response_viz_config').nullable();
            tableBuilder.timestamp('responded_at', { useTz: false }).nullable();
        });
    }

    if (!(await knex.schema.hasTable(AI_SLACK_PROMPT_TABLE_NAME))) {
        await knex.schema.createTable(
            AI_SLACK_PROMPT_TABLE_NAME,
            (tableBuilder) => {
                tableBuilder
                    .uuid('ai_slack_prompt_uuid')
                    .notNullable()
                    .primary()
                    .defaultTo(knex.raw('uuid_generate_v4()'));
                tableBuilder
                    .uuid('ai_prompt_uuid')
                    .unique()
                    .notNullable()
                    .references('ai_prompt_uuid')
                    .inTable(AI_PROMPT_TABLE_NAME)
                    .onDelete('CASCADE');
                tableBuilder.text('slack_user_id').notNullable();
                tableBuilder.text('slack_channel_id').notNullable();
                tableBuilder.text('prompt_slack_ts').notNullable();
                tableBuilder.text('response_slack_ts').nullable();

                tableBuilder.unique(['slack_channel_id', 'prompt_slack_ts']);
                tableBuilder.unique(['slack_channel_id', 'response_slack_ts']);
            },
        );
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(AI_SLACK_PROMPT_TABLE_NAME);
    await knex.schema.dropTableIfExists(AI_PROMPT_TABLE_NAME);
    await knex.schema.dropTableIfExists(AI_SLACK_THREAD_TABLE_NAME);
    await knex.schema.dropTableIfExists(AI_THREAD_TABLE_NAME);
}
