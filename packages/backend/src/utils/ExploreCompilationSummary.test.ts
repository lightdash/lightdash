import {
    calculateCompilationReport,
    type Explore,
    type ExploreError,
} from '@lightdash/common';
import * as compilationReport from '@lightdash/common';
import { ExploreCompilationSummary } from './ExploreCompilationSummary';

const table = (
    name: string,
    dimensions: Record<string, object>,
    metrics: Record<string, object>,
    sqlWhere?: string,
) =>
    ({
        name,
        dimensions,
        metrics,
        sqlWhere,
    }) as Explore['tables'][string];

const explore = (
    name: string,
    baseTable: string,
    tables: Explore['tables'],
    overrides: Partial<Explore> = {},
) =>
    ({
        name,
        label: name,
        tags: [],
        baseTable,
        joinedTables: [],
        tables,
        targetDatabase: 'postgres',
        ...overrides,
    }) as Explore;

describe('ExploreCompilationSummary', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('accumulates reports, analytics, and case-sensitive values in input order', () => {
        const orders = explore(
            'orders',
            'orders',
            {
                orders: table(
                    'orders',
                    {
                        order_id: {
                            name: 'order_id',
                            round: 2,
                            urls: [{ url: 'https://example.com/one' }],
                            format: '0,0',
                            requiredAttributes: ['region'],
                            caseSensitive: false,
                        },
                        order_override: {
                            name: 'order_override',
                            isAdditionalDimension: true,
                            format: '0.0',
                            caseSensitive: true,
                        },
                    },
                    {
                        order_count: {
                            name: 'order_count',
                            round: 0,
                            urls: [
                                { url: 'https://example.com/two' },
                                { url: 'https://example.com/three' },
                            ],
                            format: '0',
                        },
                    },
                    'status = 1',
                ),
                customers: table(
                    'customers',
                    {
                        customer_id: {
                            name: 'customer_id',
                            round: 1,
                            urls: [{ url: 'https://example.com/four' }],
                            format: '0,0',
                            caseSensitive: true,
                        },
                    },
                    {
                        customer_count: { name: 'customer_count' },
                    },
                ),
            },
            { groupLabel: 'Sales', caseSensitive: true },
        );
        const error = {
            name: 'broken',
            label: 'broken',
            groupLabel: 'Errors',
            baseTable: 'broken',
            caseSensitive: false,
            tables: {
                broken: table(
                    'broken',
                    {
                        broken_id: {
                            name: 'broken_id',
                            caseSensitive: false,
                        },
                    },
                    {},
                    'invalid = true',
                ),
            },
            errors: [{ type: 'METADATA_PARSE_ERROR', message: 'broken' }],
        } as ExploreError;
        const duplicateOrders = explore(
            'orders',
            'orders_override',
            {
                orders_override: table(
                    'orders_override',
                    {
                        order_id: {
                            name: 'order_id',
                            round: 3,
                            urls: [{ url: 'https://example.com/five' }],
                            format: '0.00',
                            requiredAttributes: [],
                            isAdditionalDimension: true,
                            caseSensitive: true,
                        },
                    },
                    {
                        order_total: {
                            name: 'order_total',
                            urls: [{ url: 'https://example.com/six' }],
                            format: '0.00',
                        },
                    },
                ),
            },
            { caseSensitive: false },
        );
        const explores = [orders, error, duplicateOrders];
        const expectedReport = calculateCompilationReport({ explores });
        const calculateReport = vi.mocked(
            vi.spyOn(compilationReport, 'calculateCompilationReport'),
        );
        const summary = new ExploreCompilationSummary();

        explores.forEach((item) => summary.add(item, true));

        expect(calculateReport).toHaveBeenCalledTimes(explores.length);
        expect(summary.report).toEqual(expectedReport);
        expect(summary.names).toEqual(['orders', 'broken', 'orders']);
        expect(summary.analytics).toEqual({
            modelsCount: 3,
            modelsWithErrorsCount: 1,
            modelsWithGroupLabelCount: 2,
            metricsCount: 3,
            roundCount: 4,
            urlsCount: 6,
            formattedFieldsCount: 5,
            modelsWithSqlFiltersCount: 2,
            columnAccessFiltersCount: 2,
            additionalDimensionsCount: 2,
        });
        expect(summary.caseSensitiveExplores).toEqual([
            { name: 'orders', value: true },
            { name: 'broken', value: false },
            { name: 'orders', value: false },
        ]);
        expect(summary.caseSensitiveDimensions).toEqual([
            { table: 'orders', name: 'order_id', value: false },
            { table: 'orders', name: 'order_override', value: true },
            { table: 'customers', name: 'customer_id', value: true },
            { table: 'broken', name: 'broken_id', value: false },
            { table: 'orders_override', name: 'order_id', value: true },
        ]);
    });
});
