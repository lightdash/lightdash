import { Knex } from 'knex';

const AiWritebackThreadTableName = 'ai_writeback_thread';
const ColumnName = 'pr_url';

export async function up(knex: Knex): Promise<void> {
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

export async function down(knex: Knex): Promise<void> {
    const hasColumn = await knex.schema.hasColumn(
        AiWritebackThreadTableName,
        ColumnName,
    );
    if (!hasColumn) {
        // Re-added as nullable — the original values lived in the column we
        // dropped and are now sourced from the linked pull_requests row, so
        // they can't be reconstructed here.
        await knex.schema.alterTable(AiWritebackThreadTableName, (table) => {
            table.text(ColumnName).nullable();
        });
    }
}
