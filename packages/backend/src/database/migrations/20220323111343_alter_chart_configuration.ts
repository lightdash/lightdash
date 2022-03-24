import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`WITH updates AS (
        SELECT
            sqv.saved_queries_version_id,
            jsonb_build_object(
                'layout', json_build_object(
                    'xField', sqv.chart_config->'series'->0->'xField',
                    'yField', (
                        select jsonb_agg(value->'yField') 
                        from jsonb_array_elements(sqv.chart_config->'series')
                    ),
                    'flipAxes', sqv.chart_config->'series'->0->'flipAxes'
                ), 
                'eChartsConfig', jsonb_build_object(
                    'series', (
                        select jsonb_agg(
                            jsonb_build_object(
                                'type', value->'type',
                                'name', value->'name',
                                'color', value->'color',
                                'label', value->'label',
                                'encode', json_build_object(
                                    'xRef', json_build_object('field', value->'xField'),
                                    'yRef', json_build_object('field', value->'yField')
                                )
                            )     
                        ) 
                        from jsonb_array_elements(sqv.chart_config->'series')
                    ),
                    'xAxis', sqv.chart_config->'xAxes',
                    'yAxis', sqv.chart_config->'yAxes'
                )
            ) as chart_config
        FROM saved_queries_versions sqv
        WHERE chart_type not in ('big_number', 'table')
    )
    UPDATE saved_queries_versions sqv
    SET chart_config = updates.chart_config
    FROM updates
    WHERE sqv.saved_queries_version_id = updates.saved_queries_version_id
        AND chart_type = 'cartesian'
    `);
}

export async function down(knex: Knex): Promise<void> {
    await knex('saved_queries_versions').delete();
}
