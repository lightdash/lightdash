import { Knex } from 'knex';

const AiWritebackThreadTableName = 'ai_writeback_thread';
const PullRequestsTableName = 'pull_requests';
const ColumnName = 'pull_request_uuid';

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
                .references('pull_request_uuid')
                .inTable(PullRequestsTableName)
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
