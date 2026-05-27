import { Knex } from 'knex';

const AiWritebackThreadTableName = 'ai_writeback_thread';

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable(AiWritebackThreadTableName))) {
        await knex.schema.createTable(AiWritebackThreadTableName, (table) => {
            table
                .uuid('ai_writeback_thread_uuid')
                .primary()
                .defaultTo(knex.raw('uuid_generate_v4()'));
            table
                .uuid('ai_thread_uuid')
                .notNullable()
                .unique()
                .references('ai_thread_uuid')
                .inTable('ai_thread')
                .onDelete('CASCADE');
            table.text('sandbox_id').notNullable();
            table.text('pr_url').notNullable();
            table
                .timestamp('created_at', { useTz: false })
                .notNullable()
                .defaultTo(knex.fn.now());
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(AiWritebackThreadTableName);
}
