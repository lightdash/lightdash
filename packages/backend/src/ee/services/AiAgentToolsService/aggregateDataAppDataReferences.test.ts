import type {
    ExtractedDataReference,
    PersistedDataAppDataReferences,
} from '@lightdash/common';
import { aggregateDataAppDataReferences } from './aggregateDataAppDataReferences';

const location = { path: 'src/App.tsx', line: 1, column: 1 };

const query = (
    overrides: Partial<Extract<ExtractedDataReference, { kind: 'query' }>>,
): ExtractedDataReference => ({
    kind: 'query',
    explore: 'orders',
    dimensions: [],
    metrics: [],
    dimensionFilterFields: [],
    metricFilterFields: [],
    sortFields: [],
    parameterKeys: [],
    localFields: [],
    unresolved: [],
    location,
    ...overrides,
});

const persisted = (
    references: ExtractedDataReference[],
    stats = {
        callSites: references.length,
        fullyResolved: references.length,
        partiallyResolved: 0,
        unresolved: 0,
    },
): PersistedDataAppDataReferences => ({
    references,
    parseErrors: [],
    stats,
});

describe('aggregateDataAppDataReferences', () => {
    it('unions fields across call sites of the same explore', () => {
        const result = aggregateDataAppDataReferences(
            persisted([
                query({
                    dimensions: ['orders_status'],
                    metrics: ['orders_total'],
                    dimensionFilterFields: ['orders_date'],
                    sortFields: ['orders_total'],
                }),
                query({
                    dimensions: ['orders_status', 'orders_region'],
                    metrics: ['orders_count'],
                    metricFilterFields: ['orders_total'],
                    parameterKeys: ['region'],
                    localFields: ['margin'],
                }),
                query({ explore: 'customers', dimensions: ['customers_id'] }),
            ]),
            {},
        );

        expect(result.explores).toEqual([
            {
                name: 'orders',
                dimensions: ['orders_status', 'orders_region'],
                metrics: ['orders_total', 'orders_count'],
                filterFields: ['orders_date', 'orders_total'],
                sortFields: ['orders_total'],
                parameterKeys: ['region'],
                localFields: ['margin'],
                customSqlFieldCount: 0,
            },
            {
                name: 'customers',
                dimensions: ['customers_id'],
                metrics: [],
                filterFields: [],
                sortFields: [],
                parameterKeys: [],
                localFields: [],
                customSqlFieldCount: 0,
            },
        ]);
    });

    it('folds global filters into the matching explore filter fields', () => {
        const result = aggregateDataAppDataReferences(
            persisted([
                query({ dimensions: ['orders_status'] }),
                {
                    kind: 'globalFilter',
                    explore: 'orders',
                    field: null,
                    fields: ['orders_region', 'orders_status'],
                    unresolved: [],
                    location,
                },
                {
                    kind: 'globalFilter',
                    explore: 'orders',
                    field: 'orders_status',
                    unresolved: [],
                    location,
                },
            ]),
            {},
        );

        expect(result.explores).toHaveLength(1);
        expect(result.explores[0].filterFields).toEqual([
            'orders_region',
            'orders_status',
        ]);
    });

    it('reduces custom SQL to a count and drops locations', () => {
        const result = aggregateDataAppDataReferences(
            persisted([
                query({
                    customSql: {
                        tableCalculations: ['SUM(x)'],
                        customDimensions: [{ sql: 'a', table: 'orders' }],
                        additionalMetrics: [
                            { sql: 'b', table: 'orders' },
                            { sql: 'c', table: 'orders' },
                        ],
                    },
                }),
            ]),
            {},
        );

        expect(result.explores[0].customSqlFieldCount).toBe(4);
        expect(JSON.stringify(result)).not.toContain('SUM(x)');
        expect(JSON.stringify(result)).not.toContain('src/App.tsx');
    });

    it('resolves linked charts by slug and drops charts that no longer exist', () => {
        const result = aggregateDataAppDataReferences(
            persisted([
                {
                    kind: 'savedChart',
                    chartUuid: 'chart-1',
                    filterFields: ['orders_date'],
                    unresolved: [],
                    location,
                },
                {
                    kind: 'savedChart',
                    chartUuid: 'chart-1',
                    filterFields: ['orders_region'],
                    unresolved: [],
                    location,
                },
                {
                    kind: 'savedChart',
                    chartUuid: 'deleted-chart',
                    filterFields: [],
                    unresolved: [],
                    location,
                },
            ]),
            { 'chart-1': 'revenue-by-month' },
        );

        expect(result.linkedCharts).toEqual([
            {
                slug: 'revenue-by-month',
                filterFields: ['orders_date', 'orders_region'],
            },
        ]);
    });

    it('groups external fetch paths by alias', () => {
        const result = aggregateDataAppDataReferences(
            persisted([
                {
                    kind: 'externalFetch',
                    alias: 'crm',
                    path: '/accounts',
                    unresolved: [],
                    location,
                },
                {
                    kind: 'externalFetch',
                    alias: 'crm',
                    path: null,
                    unresolved: [],
                    location,
                },
                {
                    kind: 'externalFetch',
                    alias: 'crm',
                    path: '/deals',
                    unresolved: [],
                    location,
                },
            ]),
            {},
        );

        expect(result.externalConnections).toEqual([
            { alias: 'crm', paths: ['/accounts', '/deals'] },
        ]);
    });

    it('keeps stats and the union of unresolved part names', () => {
        const stats = {
            callSites: 3,
            fullyResolved: 1,
            partiallyResolved: 1,
            unresolved: 1,
        };
        const result = aggregateDataAppDataReferences(
            persisted(
                [
                    query({ dimensions: ['orders_status'] }),
                    query({ unresolved: ['filters', 'sorts'] }),
                    query({
                        explore: null,
                        unresolved: ['explore', 'filters'],
                    }),
                ],
                stats,
            ),
            {},
        );

        expect(result.stats).toEqual(stats);
        expect(result.unresolved).toEqual(['explore', 'filters', 'sorts']);
        expect(result.explores.map((explore) => explore.name)).toEqual([
            'orders',
        ]);
    });
});
