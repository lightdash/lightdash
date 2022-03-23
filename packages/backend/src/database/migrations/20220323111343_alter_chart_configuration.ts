import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`WITH updates AS (
        SELECT
            sqv.saved_queries_version_id,
            jsonb_build_object(
                'layout', json_build_object(
                    'xField', sqv.chart_config->series->0->xField,
                    'yField', (
                        select jsonb_agg(value->yField) 
                        from jsonb_array_elements(sqv.chart_config->series)
                    ),
                    'flipAxes', sqv.chart_config->series->0->flipAxes
                ), 
                'eChartsConfig', jsonb_build_object(
                    'series', (
                        select jsonb_agg(
                            jsonb_build_object(
                                'type', value->type,
                                'name', value->name,
                                'color', value->color,
                                'label', value->label,
                                'encode', json_build_object(
                                    'x', value->xField,
                                    'y', value->yField
                                )
                            )     
                        ) 
                        from jsonb_array_elements(sqv.chart_config->series)
                    ),
                    'xAxis', null,
                    'yAxis', null,
                )
            ) as chart_config
        FROM saved_queries_versions sqv
        WHERE chart_type not in ('big_number', 'table')
    )`);
}

export async function down(knex: Knex): Promise<void> {}
