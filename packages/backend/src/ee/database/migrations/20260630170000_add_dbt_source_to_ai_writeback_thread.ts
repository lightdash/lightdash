import { Knex } from 'knex';

const AiWritebackThreadTableName = 'ai_writeback_thread';
const ProjectDbtSourcesTableName = 'project_dbt_sources';
const ColumnName = 'project_dbt_source_uuid';
// Knex derives this name from table + column when the FK is created below; it is
// the constraint that actually exists in already-migrated databases.
const ForeignKeyName = 'ai_writeback_thread_project_dbt_source_uuid_foreign';

async function hasForeignKey(knex: Knex): Promise<boolean> {
    const result = await knex.raw(
        `SELECT 1
           FROM pg_constraint
          WHERE conname = ?
            AND conrelid = to_regclass(?)
            AND contype = 'f'`,
        [ForeignKeyName, AiWritebackThreadTableName],
    );
    return result.rows.length > 0;
}

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
            table.uuid(ColumnName).nullable();
        });
    }

    // Add the FK separately and only when absent, so a fresh install and a
    // reapply after down() (which keeps the column but drops the FK) both end up
    // with the constraint in place.
    if (!(await hasForeignKey(knex))) {
        await knex.schema.alterTable(AiWritebackThreadTableName, (table) => {
            table
                .foreign(ColumnName)
                .references('project_dbt_source_uuid')
                .inTable(ProjectDbtSourcesTableName)
                .onDelete('SET NULL');
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    // Drop ONLY the foreign key, never the column or its data. A full rollback
    // reverts this migration before 20260630140000_add_project_dbt_sources drops
    // project_dbt_sources; the lingering FK would otherwise block that DROP TABLE.
    // The thread→source bindings are preserved and up() restores the FK on reapply.
    if (await hasForeignKey(knex)) {
        await knex.schema.alterTable(AiWritebackThreadTableName, (table) => {
            table.dropForeign([ColumnName]);
        });
    }
}
