import { Knex } from 'knex';

const ADDITIONAL_METRICS_TABLE_NAME =
    'saved_queries_version_additional_metrics';

const CompactColumnName = 'compact';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.table(ADDITIONAL_METRICS_TABLE_NAME, (table) => {
        table.string(CompactColumnName);
    });
}

export async function down(knex: Knex): Promise<void> {
    if (
        await knex.schema.hasColumn(
            ADDITIONAL_METRICS_TABLE_NAME,
            CompactColumnName,
        )
    ) {
        await knex.schema.table(ADDITIONAL_METRICS_TABLE_NAME, (table) => {
            table.dropColumn(CompactColumnName);
        });
    }
}
