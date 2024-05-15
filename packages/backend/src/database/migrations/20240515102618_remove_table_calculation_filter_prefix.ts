import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    const versionsWithTableCalculationFilters = await knex(
        'saved_queries_versions',
    )
        .select('saved_queries_version_uuid')
        .whereRaw("jsonb_path_exists(filters, '$.tableCalculations')");

    await knex('saved_queries_versions')
        .update({
            filters: knex.raw(
                `REPLACE(filters::TEXT, '"table_calculation_', '"')::jsonb`,
            ),
        })
        .whereIn(
            'saved_queries_version_uuid',
            versionsWithTableCalculationFilters.map(
                (row: any) => row.saved_queries_version_uuid,
            ),
        );
}

export async function down(_knex: Knex): Promise<void> {
    // no-op - this migration is irreversible
}
