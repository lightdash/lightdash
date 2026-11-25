import {
    applyModelFragment,
    DimensionType,
    METRIC_VIEW_TABLE_TYPE,
    parseModelFragment,
    type WarehouseTableMetadata,
} from '@lightdash/common';
import { parse } from 'yaml';
import {
    buildMetricViewModelYaml,
    quoteIdentifier,
    toSentenceCase,
} from './metricViewModel';

type Column = WarehouseTableMetadata['columns'][number];

const dimension = (name: string, comment: string | null = null): Column => ({
    name,
    type: DimensionType.STRING,
    comment,
    isMeasure: false,
});

const measure = (name: string, comment: string | null = null): Column => ({
    name,
    type: DimensionType.NUMBER,
    comment,
    isMeasure: true,
});

// An invented metric view, shaped like a described one
const metadata: WarehouseTableMetadata = {
    tableType: METRIC_VIEW_TABLE_TYPE,
    comment: 'Subscription movements by month',
    columns: [
        {
            ...dimension('record_month', 'First day of the month.'),
            type: DimensionType.DATE,
        },
        dimension('Plan Tier'),
        measure('Opening Base'),
        measure('net_churn_rate'),
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

const build = (
    existingModelYaml: string | null = null,
    described: WarehouseTableMetadata = metadata,
) =>
    parse(
        buildMetricViewModelYaml({
            modelName: 'subscriptions',
            sqlFrom: 'catalog.schema.subscription_metrics',
            metadata: described,
            existingModelYaml,
        }),
    );

const EXISTING = `type: model
name: subscriptions
sql_from: catalog.schema.subscription_metrics
dimensions:
  - name: tier
    type: string
    sql: \${TABLE}.\`Plan Tier\`
    label: Plan
    metrics:
      latest_tier:
        type: max
        sql: \${TABLE}.\`Plan Tier\`
metrics:
  starting_base:
    type: number
    sql: MEASURE(\`Opening Base\`)
    description: The base we report to the board.
  net_churn_rate:
    type: number
    sql: MEASURE(net_churn_rate)
    description: Churn as a share of the opening base.
`;

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
                    label: 'Record month',
                    ai_hint: ['period'],
                    description: 'First day of the month.',
                },
                {
                    name: 'plan_tier',
                    type: 'string',
                    sql: '${TABLE}.`Plan Tier`',
                    label: 'Plan tier',
                    description: 'Commercial tier of the plan.',
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

    it('updates an existing model in place, under the names it already uses', () => {
        const model = build(EXISTING);

        expect(model.sql_from).toBeUndefined();
        expect(
            model.dimensions.map(({ name }: { name: string }) => name),
        ).toEqual(['record_month', 'tier']);
        expect(Object.keys(model.metrics)).toEqual([
            'starting_base',
            'net_churn_rate',
        ]);
    });

    it('leaves a label or description someone wrote where the warehouse has none', () => {
        const model = build(EXISTING);
        const tier = model.dimensions[1];

        // No display name in the warehouse, so the hand-written label is not sent
        expect(tier.label).toBeUndefined();
        // No comment in the warehouse, so the definition alone does not replace it
        expect(model.metrics.net_churn_rate.description).toBeUndefined();
        // A warehouse comment does replace it
        expect(model.metrics.starting_base.description).toContain(
            'Active subscriptions at the start of the period.',
        );
    });

    it('gives columns that reduce to the same or to no name a distinct one', () => {
        const model = build(null, {
            ...metadata,
            metricView: null,
            columns: [
                dimension('Order Date'),
                dimension('order-date'),
                dimension('売上'),
                dimension('数量'),
                measure('order_date'),
            ],
        });

        expect(
            model.dimensions.map(({ name }: { name: string }) => name),
        ).toEqual(['order_date', 'order_date_2', 'field', 'field_2']);
        expect(model.dimensions[2].label).toBe('売上');
        expect(Object.keys(model.metrics)).toEqual(['order_date_3']);
    });

    it('still ports every column when the definition did not parse', () => {
        const model = build(null, { ...metadata, metricView: null });

        expect(model.dimensions).toHaveLength(2);
        expect(model.metrics.opening_base).toEqual({
            type: 'number',
            sql: 'MEASURE(`Opening Base`)',
            label: 'Opening base',
        });
    });

    describe('labels and date parts', () => {
        const field = (
            name: string,
            type: DimensionType,
            label: string | null,
            isMeasure = false,
        ) => ({
            column: { name, type, comment: null, isMeasure },
            defined: { name, expr: name, label, comment: null, synonyms: [] },
        });
        const fields = [
            field('order_date', DimensionType.DATE, 'Month'),
            field('month', DimensionType.NUMBER, 'Month'),
            field('year', DimensionType.NUMBER, null),
            field('region', DimensionType.STRING, 'Region'),
            field(
                'Total Revenue USD',
                DimensionType.NUMBER,
                'Total Revenue USD',
                true,
            ),
            field('api_calls_7d', DimensionType.NUMBER, 'API Calls 7D', true),
            field('region_count', DimensionType.NUMBER, 'Region', true),
        ];
        const orders = (
            picked: typeof fields = fields,
        ): WarehouseTableMetadata => ({
            ...metadata,
            comment: null,
            columns: picked.map(({ column }) => column),
            metricView: {
                source: 'catalog.schema.fct_orders',
                filter: null,
                parameterized: false,
                joins: [],
                dimensions: picked
                    .filter(({ column }) => !column.isMeasure)
                    .map(({ defined }) => defined),
                measures: picked
                    .filter(({ column }) => column.isMeasure)
                    .map(({ defined }) => ({ ...defined, window: [] })),
            },
        });
        const labelsOf = (model: {
            dimensions: { label?: string }[];
            metrics: Record<string, { label?: string }>;
        }) => [
            ...model.dimensions.map(({ label }) => label),
            ...Object.values(model.metrics).map(({ label }) => label),
        ];

        it('hides date-part columns a date dimension covers', () => {
            const model = build(null, orders());

            expect(
                model.dimensions.map(
                    ({ name, hidden }: { name: string; hidden?: boolean }) => [
                        name,
                        hidden ?? false,
                    ],
                ),
            ).toEqual([
                ['order_date', false],
                ['month', true],
                ['year', true],
                ['region', false],
            ]);
        });

        it('keeps date-part columns visible when there is no date dimension', () => {
            const model = build(null, orders(fields.slice(1)));

            expect(model.dimensions[0]).not.toHaveProperty('hidden');
            expect(model.dimensions[0].label).toBe('Month');
        });

        it('gives every field a distinct label in sentence case, acronyms kept', () => {
            expect(labelsOf(build(null, orders()))).toEqual([
                'Order date',
                'Month number',
                'Year number',
                'Region',
                'Total revenue USD',
                'API calls 7D',
                'Region 2',
            ]);
        });

        it('never labels a date dimension with a timeframe word', () => {
            const model = build(
                null,
                orders([field('month', DimensionType.TIMESTAMP, 'Month')]),
            );

            expect(model.dimensions[0].label).toBe('Date');
        });

        it('re-imports in place, keeping names and every field', () => {
            const existing = `type: model
name: subscriptions
sql_from: catalog.schema.orders
dimensions:
  - name: ordered_on
    type: date
    sql: \${TABLE}.order_date
    label: Month
  - name: month_num
    type: number
    sql: \${TABLE}.month
    label: Month
  - name: sales_region
    type: string
    sql: \${TABLE}.legacy_region
    label: Region
metrics:
  revenue:
    type: number
    sql: MEASURE(\`Total Revenue USD\`)
`;
            const yaml = buildMetricViewModelYaml({
                modelName: 'subscriptions',
                sqlFrom: 'catalog.schema.orders',
                metadata: orders(),
                existingModelYaml: existing,
            });
            const model = parse(yaml);

            expect(
                model.dimensions.map(({ name }: { name: string }) => name),
            ).toEqual(['ordered_on', 'month_num', 'year', 'region']);
            expect(Object.keys(model.metrics)).toEqual([
                'revenue',
                'api_calls_7d',
                'region_count',
            ]);
            expect(labelsOf(model)).toEqual([
                'Order date',
                'Month number',
                'Year number',
                'Region 2',
                'Total revenue USD',
                'API calls 7D',
                'Region 3',
            ]);
            expect(model.dimensions[1].hidden).toBe(true);

            const merged = parse(
                applyModelFragment({
                    contents: existing,
                    filename: 'models/subscriptions.yml',
                    fragment: parseModelFragment('subscriptions', yaml),
                }).contents,
            );
            expect(
                merged.dimensions.map(({ name }: { name: string }) => name),
            ).toEqual([
                'ordered_on',
                'month_num',
                'sales_region',
                'year',
                'region',
            ]);
            expect(merged.dimensions[2].label).toBe('Region');
        });
    });
});

describe('toSentenceCase', () => {
    it.each([
        ['Total Revenue USD', 'Total revenue USD'],
        ['API Calls 7D', 'API calls 7D'],
        ['order date', 'Order date'],
        ['Region', 'Region'],
    ])('writes %s as %s', (label, expected) => {
        expect(toSentenceCase(label)).toBe(expected);
    });
});

describe('quoteIdentifier', () => {
    it.each([
        ['orders', 'orders'],
        ['Plan Tier', '`Plan Tier`'],
        ['my-catalog', '`my-catalog`'],
        ['odd`name', '`odd``name`'],
    ])('quotes %s as %s', (name, quoted) => {
        expect(quoteIdentifier(name)).toBe(quoted);
    });
});
