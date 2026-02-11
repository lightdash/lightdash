import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.table(
        'saved_queries_version_additional_metrics',
        (table) => {
            table.jsonb('distinct_keys');
        },
    );
}

export async function down(knex: Knex): Promise<void> {
    if (
        await knex.schema.hasColumn(
            'saved_queries_version_additional_metrics',
            'distinct_keys',
        )
    ) {
        await knex.schema.table(
            'saved_queries_version_additional_metrics',
            (table) => {
                table.dropColumn('distinct_keys');
            },
        );
    }
}
