import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    // Add new chart type
    await knex('chart_types').insert({ chart_type: 'cartesian' });

    // Add new column for chart config and pivot config
    await knex.schema.alterTable('saved_queries_versions', (tableBuilder) => {
        tableBuilder.jsonb('chart_config').nullable();
        tableBuilder.specificType('pivot_dimensions', 'TEXT[]').nullable();
    });

    // Migrate configs for big_number and table
    await knex.raw(`
    UPDATE saved_queries_version
    SET chart_config = '{}'::jsonb
    WHERE chart_type in ('big_number', 'table')`);

    // Migrate pivot_config, chart_type and chart_config for bar, line, scatter, column
    await knex.raw(`
    UPDATE saved_queries_version
    SET chart_type = 'cartesian',
        pivot_dimensions = (CASE 
            WHEN sqv.group_dimension is NULL THEN NULL
            ELSE ARRAY[sqv.group_dimension]::TEXT[] 
            END),
        chart_config = jsonb_build_object(
            'series', (
                CASE
                    WHEN sqv.x_dimension is NULL THEN '[]'::jsonb
                    ELSE COALESCE((
                        select jsonb_agg(jsonb_build_object(
                            'type', CASE 
                                WHEN sqv.chart_type in ('bar', 'column') THEN 'bar'
                                ELSE sqv.chart_type
                                END,
                            'yField', ym.field_name,
                            'xField', sqv.x_dimension
                            'flipAxes', sqv.chart_type == 'bar'
                        ))
                        ), '[]'::jsonb)
                    )
            )
    WHERE chart_type not in ('big_number', 'table');
    `);

    // Delete y_metrics
    await knex.schema.dropTableIfExists('saved_queries_version_y_metrics');

    // Make config required
    await knex.schema.alterTable('saved_queries_version', (tableBuilder) => {
        tableBuilder.jsonb('chart_config').notNullable().alter();
    });

    // Drop unused types from chart_types
    await knex('chart_types')
        .whereIn('chart_type', ['bar', 'line', 'scatter', 'column'])
        .delete();
}

export async function down(knex: Knex): Promise<void> {
    throw new Error('Not implemented');
}
