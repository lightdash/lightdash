import {
    FieldType,
    FilterOperator,
    MetricType,
    NotSupportedError,
    VizAggregationOptions,
    VizIndexType,
    type CompiledMetric,
    type MetricQuery,
} from '@lightdash/common';
import {
    EXPLORE,
    EXPLORE_WITH_DATE_DIMENSION,
    EXPLORE_WITH_DATE_DIMENSION_ZOOMED,
    METRIC_QUERY_WITH_DATE_FILTER,
    METRIC_QUERY_WITH_METRIC_FILTER,
} from './MetricQueryBuilder.mock';
import { buildQuery } from './metricQueryBuilderSnapshots/helpers';
import { TotalQueryBuilder } from './TotalQueryBuilder';

const source: MetricQuery = {
    exploreName: 'table1',
    dimensions: ['table1_dim1', 'table1_shared'],
    metrics: ['table1_metric1'],
    filters: {},
    sorts: [{ fieldId: 'table1_dim1', descending: false }],
    limit: 1,
    tableCalculations: [],
};

const rootLevel = {
    parent: [],
    sorts: [{ fieldId: 'table1_shared', descending: false }],
    limit: 25,
};

const build = (metricQuery: MetricQuery = source) =>
    new TotalQueryBuilder({
        metricQuery,
        pivotConfiguration: null,
        kind: 'columnSubtotal',
        subtotalDimensions: ['table1_shared'],
        subtotalLevel: rootLevel,
    }).compileQuery();

describe('subtotal level queries', () => {
    it('builds a root query at the requested grain, order, and limit without a source page', () => {
        const result = build();

        expect(result.metricQuery.dimensions).toEqual(['table1_shared']);
        expect(result.metricQuery.sorts).toEqual(rootLevel.sorts);
        expect(result.metricQuery.limit).toBe(25);
        expect(result.sourceQuery).toBeUndefined();
    });

    it.each([false, true])(
        'recomputes average, distinct count, and ratio metrics at root grain (pivoted: %s)',
        (pivoted) => {
            const explore = {
                ...EXPLORE,
                tables: {
                    ...EXPLORE.tables,
                    table1: {
                        ...EXPLORE.tables.table1,
                        metrics: {
                            ...EXPLORE.tables.table1.metrics,
                            avg_value: {
                                type: MetricType.AVERAGE,
                                fieldType: FieldType.METRIC,
                                table: 'table1',
                                tableLabel: 'table1',
                                name: 'avg_value',
                                label: 'Average value',
                                sql: '${TABLE}.number_column',
                                compiledSql: 'AVG("table1".number_column)',
                                tablesReferences: ['table1'],
                                hidden: false,
                            } as CompiledMetric,
                            unique_values: {
                                type: MetricType.COUNT_DISTINCT,
                                fieldType: FieldType.METRIC,
                                table: 'table1',
                                tableLabel: 'table1',
                                name: 'unique_values',
                                label: 'Unique values',
                                sql: '${TABLE}.shared',
                                compiledSql: 'COUNT(DISTINCT "table1".shared)',
                                tablesReferences: ['table1'],
                                hidden: false,
                            } as CompiledMetric,
                            average_per_unique: {
                                type: MetricType.NUMBER,
                                fieldType: FieldType.METRIC,
                                table: 'table1',
                                tableLabel: 'table1',
                                name: 'average_per_unique',
                                label: 'Average per unique',
                                sql: '${avg_value} / NULLIF(${unique_values}, 0)',
                                compiledSql:
                                    'AVG("table1".number_column) / NULLIF(COUNT(DISTINCT "table1".shared), 0)',
                                tablesReferences: ['table1'],
                                hidden: false,
                            } as CompiledMetric,
                        },
                    },
                },
            };
            const query = buildQuery({
                explore,
                pivotDimensions: pivoted ? ['table1_dim1'] : undefined,
                compiledMetricQuery: {
                    ...METRIC_QUERY_WITH_METRIC_FILTER,
                    dimensions: source.dimensions,
                    metrics: [
                        'table1_avg_value',
                        'table1_unique_values',
                        'table1_average_per_unique',
                    ],
                    filters: {},
                    sorts: source.sorts,
                    limit: 1,
                },
                totalConfiguration: {
                    kind: 'columnSubtotal',
                    subtotalDimensions: ['table1_shared'],
                    subtotalLevel: rootLevel,
                },
            });

            if (pivoted) {
                expect(query).toContain('AS "table1_dim1"');
                expect(query).toMatch(/GROUP BY[\s\S]*1,[\s\S]*2/);
            }
            expect(query).toContain('AVG("table1".number_column)');
            expect(query).toContain('COUNT(DISTINCT "table1".shared)');
            expect(query).toContain(
                'AVG("table1".number_column) / NULLIF(COUNT(DISTINCT "table1".shared), 0)',
            );
            expect(query).not.toContain('source_rows');
            expect(query).toMatch(/LIMIT\s+25/);
            expect(query).not.toMatch(/LIMIT\s+1\b/);
        },
    );

    it('filters a child by a raw parent value and preserves source metric eligibility', () => {
        const result = new TotalQueryBuilder({
            metricQuery: {
                ...source,
                filters: METRIC_QUERY_WITH_METRIC_FILTER.filters,
            },
            pivotConfiguration: null,
            kind: 'columnSubtotal',
            subtotalDimensions: ['table1_shared'],
            subtotalLevel: {
                ...rootLevel,
                parent: [{ dimensionId: 'table1_dim1', value: 7 }],
            },
        }).compileQuery();

        expect(result.metricQuery.filters.metrics).toBeUndefined();
        expect(result.metricQuery.filters.dimensions).toMatchObject({
            and: [
                {
                    target: { fieldId: 'table1_dim1' },
                    operator: FilterOperator.EQUALS,
                    values: [7],
                },
            ],
        });
        expect(result.sourceQuery?.metricQuery.filters.metrics).toEqual(
            METRIC_QUERY_WITH_METRIC_FILTER.filters.metrics,
        );
        expect(result.sourceQuery?.metricQuery.filters.dimensions).toEqual(
            result.metricQuery.filters.dimensions,
        );
    });

    it('uses an isNull filter for a null parent', () => {
        const result = new TotalQueryBuilder({
            metricQuery: source,
            pivotConfiguration: null,
            kind: 'columnSubtotal',
            subtotalDimensions: ['table1_shared'],
            subtotalLevel: {
                ...rootLevel,
                parent: [{ dimensionId: 'table1_dim1', value: null }],
            },
        }).compileQuery();

        expect(result.metricQuery.filters.dimensions).toMatchObject({
            and: [
                {
                    target: { fieldId: 'table1_dim1' },
                    operator: FilterOperator.NULL,
                },
            ],
        });
    });

    it.each([
        [
            'unknown parent',
            [{ dimensionId: 'missing', value: 'x' }],
            rootLevel.sorts,
            25,
        ],
        [
            'duplicate parent',
            [
                { dimensionId: 'table1_dim1', value: 1 },
                { dimensionId: 'table1_dim1', value: 2 },
            ],
            rootLevel.sorts,
            25,
        ],
        [
            'grouping parent',
            [{ dimensionId: 'table1_shared', value: 'x' }],
            rootLevel.sorts,
            25,
        ],
        [
            'dropped sort',
            [],
            [{ fieldId: 'table1_dim1', descending: false }],
            25,
        ],
        ['invalid limit', [], rootLevel.sorts, 0],
    ])('rejects %s', (_name, parent, sorts, limit) => {
        expect(() =>
            new TotalQueryBuilder({
                metricQuery: source,
                pivotConfiguration: null,
                kind: 'columnSubtotal',
                subtotalDimensions: ['table1_shared'],
                subtotalLevel: { parent, sorts, limit },
            }).compileQuery(),
        ).toThrow(NotSupportedError);
    });

    it('rejects level mode for grand totals', () => {
        expect(() =>
            new TotalQueryBuilder({
                metricQuery: source,
                pivotConfiguration: null,
                kind: 'grandTotal',
                subtotalLevel: rootLevel,
            }).compileQuery(),
        ).toThrow(NotSupportedError);
    });

    it.each([false, true])(
        'retains pivot series at root and child grain (explicit configuration: %s)',
        (explicit) => {
            const pivotConfiguration = explicit
                ? {
                      indexColumn: {
                          reference: 'table1_dim1',
                          type: VizIndexType.CATEGORY,
                      },
                      groupByColumns: [{ reference: 'table1_shared' }],
                      valuesColumns: [],
                      sortBy: undefined,
                  }
                : null;
            const metricQuery = {
                ...source,
                dimensions: [...source.dimensions, 'table1_child'],
                pivotDimensions: ['table1_shared'],
                filters: METRIC_QUERY_WITH_METRIC_FILTER.filters,
            };
            for (const child of [false, true]) {
                const result = new TotalQueryBuilder({
                    metricQuery,
                    pivotConfiguration,
                    kind: 'columnSubtotal',
                    subtotalDimensions: [
                        child ? 'table1_child' : 'table1_dim1',
                    ],
                    subtotalLevel: {
                        ...rootLevel,
                        parent: child
                            ? [{ dimensionId: 'table1_dim1', value: 7 }]
                            : [],
                    },
                }).compileQuery();
                expect(result.metricQuery.dimensions).toEqual([
                    child ? 'table1_child' : 'table1_dim1',
                    'table1_shared',
                ]);
                expect(result.pivotConfiguration).toBeUndefined();
                expect(result.sourceQuery?.metricQuery.filters.metrics).toEqual(
                    metricQuery.filters.metrics,
                );
                expect(result.metricQuery.filters.metrics).toBeUndefined();
                if (child)
                    expect(result.metricQuery.filters.dimensions).toEqual(
                        expect.objectContaining({
                            and: expect.arrayContaining([
                                expect.objectContaining({
                                    target: { fieldId: 'table1_dim1' },
                                    values: [7],
                                }),
                            ]),
                        }),
                    );
            }
        },
    );

    it('compiles source-group filtering for metric eligibility without visible-page SQL', () => {
        const query = buildQuery({
            explore: EXPLORE,
            compiledMetricQuery: {
                ...METRIC_QUERY_WITH_METRIC_FILTER,
                dimensions: source.dimensions,
                limit: 1,
            },
            totalConfiguration: {
                kind: 'columnSubtotal',
                subtotalDimensions: ['table1_shared'],
                subtotalLevel: {
                    parent: [{ dimensionId: 'table1_dim1', value: 7 }],
                    sorts: rootLevel.sorts,
                    limit: 25,
                },
            },
        });

        expect(query).toContain('source_dimension_groups');
        expect(query).not.toContain('visible_page_rows');
        expect(query).not.toContain('visible_groups');
        expect(query).toMatch(/LIMIT\s+25/);
    });

    it.each([false, true])(
        'compiles a pivoted child with source eligibility and flat series columns (explicit: %s)',
        (explicit) => {
            const query = buildQuery({
                explore: EXPLORE,
                compiledMetricQuery: {
                    ...METRIC_QUERY_WITH_METRIC_FILTER,
                    dimensions: [
                        'table1_dim1',
                        'table1_shared',
                        'table2_shared',
                        'table2_dim2',
                    ],
                },
                pivotDimensions: explicit
                    ? undefined
                    : ['table1_shared', 'table2_shared'],
                pivotConfiguration: explicit
                    ? {
                          indexColumn: {
                              reference: 'table1_dim1',
                              type: VizIndexType.CATEGORY,
                          },
                          groupByColumns: [
                              { reference: 'table1_shared' },
                              { reference: 'table2_shared' },
                          ],
                          valuesColumns: [
                              {
                                  reference: 'table1_metric1',
                                  aggregation: VizAggregationOptions.SUM,
                              },
                          ],
                          sortBy: undefined,
                      }
                    : undefined,
                totalConfiguration: {
                    kind: 'columnSubtotal',
                    subtotalDimensions: ['table2_dim2'],
                    subtotalLevel: {
                        parent: [{ dimensionId: 'table1_dim1', value: 7 }],
                        sorts: [
                            { fieldId: 'table1_shared', descending: false },
                        ],
                        limit: 25,
                    },
                },
            });
            expect(query).toContain('AS "table1_shared"');
            expect(query).toContain('AS "table2_dim2"');
            expect(query).toContain('source_dimension_groups');
            expect(query.match(/IN \(7\)/g)).toHaveLength(2);
            expect(query).toContain('AS "table2_shared"');
            expect(query).toMatch(/GROUP BY\s+1,\s+2,\s+3\s+ORDER BY/);
            expect(query).not.toContain('visible_page_rows');
            expect(query).not.toContain('pivot_values');
            expect(query).toMatch(/LIMIT\s+25/);
        },
    );

    it('filters a date-zoom parent at the displayed bucket grain', () => {
        const query = buildQuery({
            explore: EXPLORE_WITH_DATE_DIMENSION_ZOOMED,
            originalExplore: EXPLORE_WITH_DATE_DIMENSION,
            compiledMetricQuery: {
                ...METRIC_QUERY_WITH_DATE_FILTER,
                dimensions: ['orders_created_at', 'orders_order_id'],
                filters: {},
            },
            totalConfiguration: {
                kind: 'columnSubtotal',
                subtotalDimensions: ['orders_order_id'],
                subtotalLevel: {
                    parent: [
                        {
                            dimensionId: 'orders_created_at',
                            value: '2024-09-01',
                        },
                    ],
                    sorts: [],
                    limit: 25,
                },
            },
        });

        expect(query).toContain(`DATE_TRUNC('month', "orders".created_at)`);
        expect(query).toMatch(
            /WHERE\s+\(\s*\(\s*\(DATE_TRUNC\('month', "orders"\.created_at\)/,
        );
    });

    it('keeps ordinary filter behavior even when its ID matches a generated parent ID', () => {
        const query = buildQuery({
            explore: EXPLORE_WITH_DATE_DIMENSION_ZOOMED,
            originalExplore: EXPLORE_WITH_DATE_DIMENSION,
            compiledMetricQuery: {
                ...METRIC_QUERY_WITH_DATE_FILTER,
                filters: {
                    dimensions: {
                        id: 'original',
                        and: [
                            {
                                id: 'subtotal-parent-0',
                                target: { fieldId: 'orders_created_at' },
                                operator: FilterOperator.EQUALS,
                                values: ['2024-09-01'],
                            },
                        ],
                    },
                },
            },
        });

        expect(query).toMatch(/WHERE\s+\(\s*\(\s*\("orders"\.created_at\)/);
    });

    it('rejects source filter IDs that collide with generated parent rules', () => {
        expect(() =>
            new TotalQueryBuilder({
                metricQuery: {
                    ...source,
                    filters: {
                        dimensions: {
                            id: 'original',
                            and: [
                                {
                                    id: 'subtotal-parent-0',
                                    target: { fieldId: 'table1_dim1' },
                                    operator: FilterOperator.EQUALS,
                                    values: [1],
                                },
                            ],
                        },
                    },
                },
                pivotConfiguration: null,
                kind: 'columnSubtotal',
                subtotalDimensions: ['table1_shared'],
                subtotalLevel: {
                    ...rootLevel,
                    parent: [{ dimensionId: 'table1_dim1', value: 1 }],
                },
            }).compileQuery(),
        ).toThrow(NotSupportedError);
    });
});
