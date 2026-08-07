import { type Knex } from 'knex';

const AiToolApprovalTableName = 'ai_tool_approval';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable(AiToolApprovalTableName, (table) => {
        table
            .uuid('ai_message_part_uuid')
            .primary()
            .references('ai_message_part_uuid')
            .inTable('ai_message_part')
            .onDelete('CASCADE');
        table.text('approval_id').notNullable();
        table.text('decision').notNullable();
        table.text('reason').nullable();
        table
            .uuid('decided_by_user_uuid')
            .nullable()
            .references('user_uuid')
            .inTable('users')
            .onDelete('SET NULL')
            .index('ai_tool_approval_decided_by_user_uuid_idx');
        table
            .timestamp('decided_at', { useTz: true })
            .notNullable()
            .defaultTo(knex.fn.now());
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(AiToolApprovalTableName);
}
