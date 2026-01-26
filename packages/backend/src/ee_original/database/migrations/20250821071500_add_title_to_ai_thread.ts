import { Knex } from 'knex';

const AiThreadTableName = 'ai_thread';

export async function up(knex: Knex): Promise<void> {
    const hasTitle = await knex.schema.hasColumn(AiThreadTableName, 'title');

    if (hasTitle) {
        return;
    }

    await knex.schema.alterTable(AiThreadTableName, (table) => {
        table.string('title').nullable();
        table.timestamp('title_generated_at', { useTz: false }).nullable();
    });

    await knex.schema.alterTable(AiThreadTableName, (table) => {
        table.index(['title'], 'ai_thread_title_idx');
    });
}

export async function down(knex: Knex): Promise<void> {
    if (await knex.schema.hasColumn(AiThreadTableName, 'title')) {
        await knex.schema.alterTable(AiThreadTableName, (table) => {
            table.dropIndex(['title'], 'ai_thread_title_idx');
            table.dropColumn('title_generated_at');
            table.dropColumn('title');
        });
    }
}
