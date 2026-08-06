import { type Knex } from 'knex';

const AiSlackThreadTableName = 'ai_slack_thread';
const AiThreadMessageTableName = 'ai_thread_message';
const AiSlackMessageTableName = 'ai_slack_message';
const AiMessageAnnotationTableName = 'ai_message_annotation';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable(AiSlackMessageTableName, (table) => {
        // The shared primary key enforces a strict 1:1 message satellite.
        table
            .uuid('ai_thread_message_uuid')
            .primary()
            .references('ai_thread_message_uuid')
            .inTable(AiThreadMessageTableName)
            .onDelete('CASCADE');
        table.text('slack_user_id').notNullable();
        table.text('slack_channel_id').notNullable();
        table.text('prompt_slack_ts').notNullable();
        table.text('response_slack_ts').nullable();
        table.unique(['slack_channel_id', 'prompt_slack_ts']);
        // backs the feedback lookup by response ts
        table.unique(['slack_channel_id', 'response_slack_ts']);
    });

    await knex.schema.createTable(AiMessageAnnotationTableName, (table) => {
        table
            .uuid('ai_message_annotation_uuid')
            .primary()
            .defaultTo(knex.raw('uuid_generate_v4()'));
        table
            .uuid('ai_thread_message_uuid')
            .notNullable()
            .references('ai_thread_message_uuid')
            .inTable(AiThreadMessageTableName)
            .onDelete('CASCADE');
        table.text('type').notNullable();
        table.integer('payload_version').notNullable().defaultTo(1);
        table.jsonb('payload').notNullable();
        table.timestamps(true, true);
        table.unique(['ai_thread_message_uuid', 'type']);
    });

    await knex.schema.alterTable(AiSlackThreadTableName, (table) => {
        table.timestamp('archived_notice_sent_at', { useTz: true }).nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(AiSlackThreadTableName, (table) => {
        table.dropColumn('archived_notice_sent_at');
    });
    await knex.schema.dropTableIfExists(AiMessageAnnotationTableName);
    await knex.schema.dropTableIfExists(AiSlackMessageTableName);
}
