import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.table(
        'saved_queries_version_additional_metrics',
        (table) => {
            table.integer('percentile');
        },
    );
}

export async function down(knex: Knex): Promise<void> {
    if (
        await knex.schema.hasColumn(
            'saved_queries_version_additional_metrics',
            'percentile',
        )
    ) {
        await knex.schema.table(
            'saved_queries_version_additional_metrics',
            (table) => {
                table.dropColumn('percentile');
            },
        );
    }
}
