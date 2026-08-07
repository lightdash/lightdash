import { type Knex } from 'knex';

const TableName = 'ai_agent_review_turn_signal';
const MessageTableName = 'ai_thread_message';
const TargetConstraintName = 'ai_agent_review_turn_signal_target_check';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(TableName, (table) => {
        table
            .uuid('ai_thread_message_uuid')
            .nullable()
            .references('ai_thread_message_uuid')
            .inTable(MessageTableName)
            .onDelete('CASCADE')
            .index();
    });
    await knex.raw('ALTER TABLE ?? ALTER COLUMN ai_prompt_uuid DROP NOT NULL', [
        TableName,
    ]);
    // every existing row keeps exactly one target: ai_prompt_uuid was NOT NULL
    // and ai_thread_message_uuid is null on the column just added
    await knex.raw(
        'ALTER TABLE ?? ADD CONSTRAINT ?? CHECK (num_nonnulls(ai_prompt_uuid, ai_thread_message_uuid) = 1)',
        [TableName, TargetConstraintName],
    );
}

export async function down(knex: Knex): Promise<void> {
    const deletedV3Signals = await knex(TableName)
        .whereNotNull('ai_thread_message_uuid')
        .delete();
    console.log(
        `[ai-agent-v3-review-signals] deleted ${deletedV3Signals} v3 signals`,
    );
    await knex.raw('ALTER TABLE ?? DROP CONSTRAINT IF EXISTS ??', [
        TableName,
        TargetConstraintName,
    ]);
    // dropping the column also drops its index and foreign key
    await knex.schema.alterTable(TableName, (table) => {
        table.dropColumn('ai_thread_message_uuid');
    });
    await knex.raw('ALTER TABLE ?? ALTER COLUMN ai_prompt_uuid SET NOT NULL', [
        TableName,
    ]);
}
