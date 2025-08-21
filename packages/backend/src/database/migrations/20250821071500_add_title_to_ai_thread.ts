import { Knex } from 'knex';

const AiThreadTableName = 'ai_thread';

export async function up(knex: Knex): Promise<void> {
    const hasTitle = await knex.schema.hasColumn(AiThreadTableName, 'title');
    const hasTitleGeneratedAt = await knex.schema.hasColumn(
        AiThreadTableName,
        'title_generated_at',
    );

    if (hasTitle && hasTitleGeneratedAt) {
        return;
    }

    await knex.schema.alterTable(AiThreadTableName, (table) => {
        if (!hasTitle) {
            table
                .string('title', 255)
                .nullable()
                .comment(
                    'Generated title for the thread based on conversation content',
                );
        }
        if (!hasTitleGeneratedAt) {
            table
                .timestamp('title_generated_at', { useTz: false })
                .nullable()
                .comment('Timestamp when the title was generated');
        }
    });

    // Add index on title for future search functionality
    const hasIndex = await knex.schema.hasColumn(AiThreadTableName, 'title');
    if (hasIndex) {
        await knex.schema.alterTable(AiThreadTableName, (table) => {
            table.index(['title'], 'ai_thread_title_idx');
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(AiThreadTableName, (table) => {
        table.dropIndex(['title'], 'ai_thread_title_idx');
        table.dropColumn('title_generated_at');
        table.dropColumn('title');
    });
}
