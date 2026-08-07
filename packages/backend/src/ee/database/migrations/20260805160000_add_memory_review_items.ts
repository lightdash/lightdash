import { Knex } from 'knex';

const reviewItemTable = 'ai_agent_review_item';
const memoryTable = 'ai_agent_memory';
const sourceConstraint = 'ai_agent_review_item_source_check';
const sourceMemoryColumn = 'source_ai_agent_memory_uuid';
const memoryIndex =
    'ai_agent_review_item_source_ai_agent_memory_uuid_unique_index';

export async function up(knex: Knex): Promise<void> {
    await knex.raw('SET statement_timeout = 0');
    try {
        await knex.raw(`
            ALTER TABLE ${reviewItemTable}
            DROP CONSTRAINT IF EXISTS ${sourceConstraint}
        `);
        await knex.schema.alterTable(reviewItemTable, (table) => {
            table
                .uuid(sourceMemoryColumn)
                .nullable()
                .references('ai_agent_memory_uuid')
                .inTable(memoryTable)
                .onDelete('SET NULL');
            table.jsonb('project_context_entry').nullable();
            table.text('nomination_reason').nullable();
            table.unique([sourceMemoryColumn], {
                indexName: memoryIndex,
                predicate: knex.whereNotNull(sourceMemoryColumn),
            });
        });
    } finally {
        await knex.raw('RESET statement_timeout');
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw('SET statement_timeout = 0');
    try {
        // Rolled-back code cannot handle memory-sourced review items.
        await knex(reviewItemTable).where('source', 'memory').delete();
        await knex.schema.alterTable(reviewItemTable, (table) => {
            table.dropColumn('nomination_reason');
            table.dropColumn('project_context_entry');
            table.dropColumn(sourceMemoryColumn);
        });
    } finally {
        await knex.raw('RESET statement_timeout');
    }
}
