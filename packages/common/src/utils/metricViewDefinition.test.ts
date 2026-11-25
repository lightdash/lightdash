import { parseMetricViewDefinition } from './metricViewDefinition';

// An invented metric view following the documented YAML reference
const DEFINITION = `
version: 1.1
comment: Subscription movements by month
source: catalog.schema.fct_subscriptions
filter: is_test = false
joins:
  - name: plan
    source: catalog.schema.dim_plan
    'on': source.plan_key = plan.plan_key
    joins:
      - name: family
        source: catalog.schema.dim_plan_family
        using: [family_key]
dimensions:
  - expr: source.*
  - name: record_month
    expr: TO_DATE(CAST(date_key AS STRING), 'yyyyMMdd')
    comment: First day of the month; one row per month.
    display_name: Month
measures:
  - name: Opening Base
    expr: SUM(opening_base)
    window:
      - order: record_month
        semiadditive: first
        range: current
    comment: Active subscriptions at the start of the period.
    display_name: Opening base
    synonyms: [starting subscribers, active base]
  - name: Net Churn
    expr: SUM(net_churn)
  - name: Net Churn Rate
    expr: MEASURE(\`Net Churn\`) / MEASURE(\`Opening Base\`)
`;

describe('parseMetricViewDefinition', () => {
    it('reads source, filter, dimensions, measures and joins', () => {
        expect(parseMetricViewDefinition(DEFINITION)).toEqual({
            source: 'catalog.schema.fct_subscriptions',
            filter: 'is_test = false',
            parameterized: false,
            dimensions: [
                {
                    name: 'source.*',
                    expr: 'source.*',
                    label: null,
                    comment: null,
                    synonyms: [],
                },
                {
                    name: 'record_month',
                    expr: "TO_DATE(CAST(date_key AS STRING), 'yyyyMMdd')",
                    label: 'Month',
                    comment: 'First day of the month; one row per month.',
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
                    name: 'Net Churn',
                    expr: 'SUM(net_churn)',
                    label: null,
                    comment: null,
                    synonyms: [],
                    window: [],
                },
                {
                    name: 'Net Churn Rate',
                    expr: 'MEASURE(`Net Churn`) / MEASURE(`Opening Base`)',
                    label: null,
                    comment: null,
                    synonyms: [],
                    window: [],
                },
            ],
            joins: [
                {
                    name: 'plan',
                    source: 'catalog.schema.dim_plan',
                    on: 'source.plan_key = plan.plan_key',
                    using: [],
                },
                {
                    name: 'plan.family',
                    source: 'catalog.schema.dim_plan_family',
                    on: null,
                    using: ['family_key'],
                },
            ],
        });
    });

    it('reads `fields`, an unquoted `on` key, a window offset and parameters', () => {
        const parsed = parseMetricViewDefinition(`
version: 1.1
source: catalog.schema.orders
parameters:
  - name: currency
    type: string
joins:
  - name: customer
    source: catalog.schema.customers
    on: source.customer_id = customer.customer_id
fields:
  - name: order_date
    expr: order_date
measures:
  - name: revenue_last_year
    expr: SUM(amount)
    window:
      - order: order_date
        range: trailing 12 month
        offset: -12 month
`);

        expect(parsed?.parameterized).toBe(true);
        expect(parsed?.dimensions.map(({ name }) => name)).toEqual([
            'order_date',
        ]);
        expect(parsed?.joins[0].on).toBe(
            'source.customer_id = customer.customer_id',
        );
        expect(parsed?.measures[0].window).toEqual([
            {
                order: 'order_date',
                range: 'trailing 12 month',
                semiAdditive: null,
                offset: '-12 month',
            },
        ]);
    });

    it('reads an early definition with no labels, comments or synonyms', () => {
        expect(
            parseMetricViewDefinition(
                'version: 0.1\nsource: catalog.schema.orders\nmeasures:\n  - name: order_count\n    expr: COUNT(1)',
            )?.measures,
        ).toEqual([
            {
                name: 'order_count',
                expr: 'COUNT(1)',
                label: null,
                comment: null,
                synonyms: [],
                window: [],
            },
        ]);
    });

    it.each([
        ['malformed YAML', 'measures: [unclosed'],
        ['a SQL view', 'SELECT order_id FROM catalog.schema.orders'],
        ['a document with no fields', 'version: 1.1\nsource: a.b.c'],
    ])('returns null for %s', (_, definition) => {
        expect(parseMetricViewDefinition(definition)).toBeNull();
    });
});
