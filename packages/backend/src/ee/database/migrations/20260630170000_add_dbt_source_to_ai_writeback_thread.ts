import { Knex } from 'knex';

const AiWritebackThreadTableName = 'ai_writeback_thread';
const ProjectDbtSourcesTableName = 'project_dbt_sources';
const ColumnName = 'project_dbt_source_uuid';

// Bind a writeback thread to the dbt source it targets so every resumed turn
// edits the same repo (one thread, one PR). Null means the project's primary
// dbt connection; a row uuid means an additional source. ON DELETE SET NULL so
// deleting a source degrades a resume back to the primary rather than orphaning
// the thread.
export async function up(knex: Knex): Promise<void> {
    const hasColumn = await knex.schema.hasColumn(
        AiWritebackThreadTableName,
        ColumnName,
    );
    if (!hasColumn) {
        await knex.schema.alterTable(AiWritebackThreadTableName, (table) => {
            table
                .uuid(ColumnName)
                .nullable()
                .references('project_dbt_source_uuid')
                .inTable(ProjectDbtSourcesTableName)
                .onDelete('SET NULL');
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    const hasColumn = await knex.schema.hasColumn(
        AiWritebackThreadTableName,
        ColumnName,
    );
    if (hasColumn) {
        await knex.schema.alterTable(AiWritebackThreadTableName, (table) => {
            table.dropColumn(ColumnName);
        });
    }
}
