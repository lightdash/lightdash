import {
    DimensionType,
    METRIC_VIEW_TABLE_TYPE,
    type WarehouseTableMetadata,
} from '@lightdash/common';
import { parse } from 'yaml';
import { buildMetricViewModelYaml } from './metricViewModel';

// An invented metric view, shaped like a described one
const metadata: WarehouseTableMetadata = {
    tableType: METRIC_VIEW_TABLE_TYPE,
    comment: 'Subscription movements by month',
    columns: [
        {
            name: 'record_month',
            type: DimensionType.DATE,
            comment: 'First day of the month.',
            isMeasure: false,
        },
        {
            name: 'Plan Tier',
            type: DimensionType.STRING,
            comment: null,
            isMeasure: false,
        },
        {
            name: 'etl_insert_date',
            type: DimensionType.TIMESTAMP,
            comment: null,
            isMeasure: false,
        },
        {
            name: 'Opening Base',
            type: DimensionType.NUMBER,
            comment: null,
            isMeasure: true,
        },
        {
            name: 'net_churn_rate',
            type: DimensionType.NUMBER,
            comment: null,
            isMeasure: true,
        },
    ],
    definition: null,
    metricView: {
        source: 'catalog.schema.fct_subscriptions',
        filter: null,
        parameterized: false,
        dimensions: [
            {
                name: 'record_month',
                expr: 'DATE(month_key)',
                label: 'Month',
                comment: null,
                synonyms: ['period'],
            },
            {
                name: 'Plan Tier',
                expr: 'plan_tier',
                label: null,
                comment: 'Commercial tier of the plan.',
                synonyms: [],
            },
        ],
        measures: [
            {
                name: 'Opening Base',
                expr: 'SUM(opening_base)',
                label: 'Opening base',
                comment: 'Active subscriptions at the start of the period.',
                synonyms: ['starting subscribers', 'active base'],
                window: [
                    {
                        order: 'record_month',
                        range: 'current',
                        semiAdditive: 'first',
                        offset: null,
                    },
                ],
            },
            {
                name: 'net_churn_rate',
                expr: 'MEASURE(`Net Churn`) / MEASURE(`Opening Base`)',
                label: null,
                comment: null,
                synonyms: [],
                window: [],
            },
        ],
        joins: [],
    },
};

const build = (existingModelYaml: string | null = null) =>
    parse(
        buildMetricViewModelYaml({
            sqlFrom: 'catalog.schema.subscription_metrics',
            metadata,
            existingModelYaml,
        }).yaml,
    );

describe('buildMetricViewModelYaml', () => {
    it('ports every column with its label, description and synonyms', () => {
        expect(build()).toEqual({
            sql_from: 'catalog.schema.subscription_metrics',
            description: 'Subscription movements by month',
            dimensions: [
                {
                    name: 'record_month',
                    type: 'date',
                    sql: '${TABLE}.record_month',
                    label: 'Month',
                    ai_hint: ['period'],
                    description: 'First day of the month.',
                },
                {
                    name: 'plan_tier',
                    type: 'string',
                    sql: '${TABLE}.`Plan Tier`',
                    label: 'Plan Tier',
                    description: 'Commercial tier of the plan.',
                },
                {
                    name: 'etl_insert_date',
                    type: 'timestamp',
                    sql: '${TABLE}.etl_insert_date',
                    hidden: true,
                },
            ],
            metrics: {
                opening_base: {
                    type: 'number',
                    sql: 'MEASURE(`Opening Base`)',
                    label: 'Opening base',
                    ai_hint: ['starting subscribers', 'active base'],
                    description: [
                        'Active subscriptions at the start of the period.',
                        'Defined in the metric view as: SUM(opening_base)',
                        'Window: ordered by record_month, range current, semi-additive (first)',
                    ].join('\n'),
                },
                net_churn_rate: {
                    type: 'number',
                    sql: 'MEASURE(`net_churn_rate`)',
                    description:
                        'Defined in the metric view as: MEASURE(`Net Churn`) / MEASURE(`Opening Base`)',
                },
            },
        });
    });

    it('updates the fields of an existing model in place, under the names it already uses', () => {
        const model = build(
            [
                'sql_from: catalog.schema.subscription_metrics',
                'dimensions:',
                '  - name: tier',
                '    type: string',
                '    sql: ${TABLE}.`Plan Tier`',
                'metrics:',
                '  starting_base:',
                '    type: number',
                '    sql: MEASURE(`Opening Base`)',
            ].join('\n'),
        );

        expect(model.sql_from).toBeUndefined();
        expect(
            model.dimensions.map(({ name }: { name: string }) => name),
        ).toEqual(['record_month', 'tier', 'etl_insert_date']);
        expect(Object.keys(model.metrics)).toEqual([
            'starting_base',
            'net_churn_rate',
        ]);
    });

    it('hides a technical column only when it is new to the model and not named in the definition', () => {
        const technical = (name: string) => ({
            name,
            type: DimensionType.STRING,
            comment: null,
            isMeasure: false,
        });
        const { yaml, hidden } = buildMetricViewModelYaml({
            sqlFrom: 'catalog.schema.subscription_metrics',
            metadata: {
                ...metadata,
                columns: [
                    ...metadata.columns,
                    technical('PLAN_SR_KEY'),
                    technical('IS_DELETED_IND'),
                    technical('INTEGRATION_ID'),
                    technical('updated_reason'),
                ],
            },
            existingModelYaml: [
                'dimensions:',
                '  - name: etl_insert_date',
                '    type: timestamp',
                '    sql: ${TABLE}.etl_insert_date',
            ].join('\n'),
        });

        expect(hidden).toEqual([
            'plan_sr_key',
            'is_deleted_ind',
            'integration_id',
        ]);
        expect(
            parse(yaml)
                .dimensions.filter((d: { hidden?: boolean }) => d.hidden)
                .map(({ name }: { name: string }) => name),
        ).toEqual(hidden);
    });

    it.each([
        ["DATE_TRUNC('MONTH', order_date)", ['MONTH', 'QUARTER', 'YEAR']],
        ["date_trunc('quarter', order_date)", ['QUARTER', 'YEAR']],
        ["DATE_TRUNC('WEEK', order_date)", ['WEEK']],
        ['DATE(month_key)', undefined],
    ])('offers only the grains %s supports', (expr, timeIntervals) => {
        const [dimension] = parse(
            buildMetricViewModelYaml({
                sqlFrom: 'catalog.schema.subscription_metrics',
                metadata: {
                    ...metadata,
                    metricView: metadata.metricView && {
                        ...metadata.metricView,
                        dimensions: [
                            {
                                ...metadata.metricView.dimensions[0],
                                expr,
                            },
                        ],
                    },
                },
                existingModelYaml: null,
            }).yaml,
        ).dimensions;

        expect(dimension.time_intervals).toEqual(timeIntervals);
    });

    it('still ports every column when the definition did not parse', () => {
        const model = parse(
            buildMetricViewModelYaml({
                sqlFrom: 'catalog.schema.subscription_metrics',
                metadata: { ...metadata, metricView: null },
                existingModelYaml: null,
            }).yaml,
        );

        expect(model.dimensions).toHaveLength(3);
        expect(model.metrics.opening_base).toEqual({
            type: 'number',
            sql: 'MEASURE(`Opening Base`)',
            label: 'Opening Base',
        });
    });
});
