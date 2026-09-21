import {
    CustomDimensionType,
    DimensionType,
    extractDataAppDataReferences,
    FilterOperator,
    ForbiddenError,
    MetricType,
    type MetricQuery,
} from '@lightdash/common';
import {
    assertDataAppQueryAllowed,
    type DataAppQueryInputs,
} from './appQueryAuthorization';

const references = extractDataAppDataReferences([
    {
        path: 'src/App.tsx',
        content: `
            import { query } from '@lightdash/query-sdk';
            const report = query('orders')
                .dimensions(['country', 'customers.region'])
                .metrics(['revenue'])
                .filters([{ field: 'status', operator: 'equals', value: 'completed' }])
                .parameters({ currency: 'EUR' });
            const calculated = query('orders')
                .metrics(['custom_revenue'])
                .dimensions(['custom_country'])
                .additionalMetrics([{ name: 'custom_revenue', table: 'orders', type: 'sum', sql: '\${TABLE}.revenue' }])
                .customDimensions([{ id: 'custom_country', name: 'Custom country', table: 'orders', type: 'sql', sql: 'UPPER(\${TABLE}.country)' }])
                .tableCalculations([{ name: 'double_revenue', displayName: 'Double revenue', sql: '\${orders.revenue} * 2' }]);
        `,
    },
]);

const metricQuery: MetricQuery = {
    exploreName: 'orders',
    dimensions: ['orders_country'],
    metrics: ['orders_revenue'],
    filters: {},
    sorts: [],
    limit: 500,
    tableCalculations: [],
};
const filter = (fieldId: string) => ({
    id: 'filter',
    target: { fieldId },
    operator: FilterOperator.EQUALS,
    values: ['pending'],
});

describe('data app consumer query authorization', () => {
    it('permits regrouping, filter changes, limits and recorded parameters', () => {
        expect(() =>
            assertDataAppQueryAllowed(references, {
                metricQuery: {
                    ...metricQuery,
                    dimensions: ['customers_region'],
                    filters: {
                        dimensions: {
                            id: 'root',
                            and: [filter('orders_status')],
                        },
                    },
                },
                parameters: { currency: 'USD' },
            }),
        ).not.toThrow();
    });

    it.each<[string, Partial<DataAppQueryInputs>]>([
        [
            'another explore',
            { metricQuery: { ...metricQuery, exploreName: 'customers' } },
        ],
        [
            'selected field',
            { metricQuery: { ...metricQuery, dimensions: ['orders_email'] } },
        ],
        [
            'sort field',
            {
                metricQuery: {
                    ...metricQuery,
                    sorts: [{ fieldId: 'orders_email', descending: false }],
                },
            },
        ],
        [
            'nested filter',
            {
                metricQuery: {
                    ...metricQuery,
                    filters: {
                        dimensions: {
                            id: 'root',
                            and: [
                                { id: 'nested', or: [filter('orders_email')] },
                            ],
                        },
                    },
                },
            },
        ],
        [
            'dashboard filter',
            {
                dashboardFilters: {
                    dimensions: [
                        {
                            ...filter('orders_email'),
                            target: {
                                fieldId: 'orders_email',
                                tableName: 'orders',
                            },
                            label: undefined,
                        },
                    ],
                    metrics: [],
                    tableCalculations: [],
                },
            },
        ],
        ['date zoom', { dateZoom: { xAxisFieldId: 'orders_secret_date' } }],
        [
            'pivot field',
            {
                metricQuery: {
                    ...metricQuery,
                    pivotDimensions: ['orders_email'],
                },
            },
        ],
        ['parameter', { parameters: { secret_parameter: 'anything' } }],
        [
            'unbacked local name',
            {
                metricQuery: {
                    ...metricQuery,
                    metrics: ['orders_custom_revenue'],
                },
            },
        ],
        [
            'formula calculation',
            {
                metricQuery: {
                    ...metricQuery,
                    tableCalculations: [
                        {
                            name: 'double_revenue',
                            displayName: 'Double',
                            formula: 'orders_email',
                        },
                    ],
                },
            },
        ],
    ])('denies an unrecorded %s', (_name, overrides) => {
        expect(() =>
            assertDataAppQueryAllowed(references, {
                metricQuery,
                ...overrides,
            }),
        ).toThrow(ForbiddenError);
    });

    it('does not treat unresolved references as permission to query arbitrary fields', () => {
        const unresolved = extractDataAppDataReferences([
            {
                path: 'src/App.tsx',
                content:
                    "import { query } from '@lightdash/query-sdk'; query('orders').dimensions(window.fields).metrics(['revenue']);",
            },
        ]);
        expect(() =>
            assertDataAppQueryAllowed(unresolved, { metricQuery }),
        ).toThrow(ForbiddenError);
    });

    it('does not authorize a modeled field through a joined-table local alias', () => {
        const joined = extractDataAppDataReferences([
            {
                path: 'src/App.tsx',
                content: `import { query } from '@lightdash/query-sdk';
                query('orders').metrics(['customers.secret']).additionalMetrics([
                    { name: 'secret', table: 'customers', type: 'sum', sql: '1' }
                ]);`,
            },
        ]);
        expect(() =>
            assertDataAppQueryAllowed(joined, {
                metricQuery: {
                    ...metricQuery,
                    dimensions: [],
                    metrics: ['customers_secret'],
                },
            }),
        ).toThrow(ForbiddenError);
    });

    it('permits recorded SQL definitions but rejects replacement SQL and extra SQL inputs', () => {
        const customQuery: MetricQuery = {
            ...metricQuery,
            metrics: ['orders_custom_revenue'],
            dimensions: ['custom_country'],
            additionalMetrics: [
                {
                    name: 'custom_revenue',
                    table: 'orders',
                    type: MetricType.SUM,
                    sql: '${TABLE}.revenue',
                },
            ],
            customDimensions: [
                {
                    id: 'custom_country',
                    name: 'Custom country',
                    table: 'orders',
                    type: CustomDimensionType.SQL,
                    sql: 'UPPER(${TABLE}.country)',
                    dimensionType: DimensionType.STRING,
                },
            ],
            tableCalculations: [
                {
                    name: 'double_revenue',
                    displayName: 'Double',
                    sql: '${orders.revenue} * 2',
                },
            ],
        };
        expect(() =>
            assertDataAppQueryAllowed(references, { metricQuery: customQuery }),
        ).not.toThrow();
        for (const override of [
            { sql: '(SELECT password FROM secrets)' },
            { table: 'secrets' },
            { distinctKeys: ['orders.email'] },
            { baseDimensionName: 'email' },
            {
                filters: [
                    {
                        ...filter('unused'),
                        target: { fieldRef: 'orders.email' },
                    },
                ],
            },
        ]) {
            expect(() =>
                assertDataAppQueryAllowed(references, {
                    metricQuery: {
                        ...customQuery,
                        additionalMetrics: [
                            {
                                ...customQuery.additionalMetrics![0],
                                ...override,
                            },
                        ],
                    },
                }),
            ).toThrow(ForbiddenError);
        }
    });
});
