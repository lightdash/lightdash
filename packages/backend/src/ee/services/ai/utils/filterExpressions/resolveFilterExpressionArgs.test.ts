import {
    DimensionType,
    FieldType,
    FilterOperator,
    FilterType,
    getTotalFilterRules,
    MetricType,
    toolRunQueryArgsSchemaPersisted,
    toolRunQueryArgsSchemaTransformed,
    toolRunQueryExpressionArgsSchema,
    toolRunQueryExpressionResolvedArgsSchema,
    toolRunQueryExpressionResolvedArgsSchemaTransformed,
    type CompiledDimension,
    type CompiledTable,
    type Explore,
    type FilterRule,
    type Filters,
    type ToolRunQueryExpressionArgs,
    type ToolRunQueryExpressionResolvedArgs,
} from '@lightdash/common';
import { vi } from 'vitest';
import {
    fieldCatalog,
    filterPermutationCases,
    type ExpectedFilter,
} from '../../filterPermutations/filterPermutationCases';
import { mockOrdersExplore } from '../validationExplore.mock';
import { validateFilterRules } from '../validators';
import { formatFilterExpressionError } from './renderFilterExpressionError';
import { resolveFilterExpressionArgs } from './resolveFilterExpressionArgs';

const baseQueryConfig = {
    exploreName: mockOrdersExplore.name,
    dimensions: ['orders_customer_name'],
    metrics: ['orders_total_revenue'],
    sorts: [],
    limit: 500,
    parameters: null,
    customMetrics: null,
    tableCalculations: null,
    filters: null,
};

const expressionArgs = (
    queryConfig: Partial<ToolRunQueryExpressionArgs['queryConfig']> = {},
): ToolRunQueryExpressionArgs =>
    toolRunQueryExpressionArgsSchema.parse({
        title: 'Test query',
        description: 'Resolver test',
        queryConfig: { ...baseQueryConfig, ...queryConfig },
        chartConfig: null,
        mergeConfig: null,
    });

type ExpressionToolArgs = Parameters<
    typeof resolveFilterExpressionArgs
>[0]['toolArgs'];

const resolveArgs = (
    args: ExpressionToolArgs,
    getExplore: (exploreName: string) => Explore | Promise<Explore> = () =>
        mockOrdersExplore,
) => resolveFilterExpressionArgs({ toolArgs: args, getExplore });

const expectResolved = async (
    args: ExpressionToolArgs,
    getExplore?: (exploreName: string) => Explore | Promise<Explore>,
) => {
    const result = await resolveArgs(args, getExplore);
    if (!result.success) {
        throw new Error(formatFilterExpressionError(result.error));
    }
    expect(result.success).toBe(true);
    return result.data;
};

const expectResolutionError = async (
    args: ExpressionToolArgs,
    getExplore?: (exploreName: string) => Explore | Promise<Explore>,
) => {
    const result = await resolveArgs(args, getExplore);
    expect(result.success).toBe(false);
    if (result.success) {
        throw new Error('Expected filter-expression resolution to fail');
    }
    return result.error;
};

const rulesWithoutIds = (filters: Filters): Omit<FilterRule, 'id'>[] =>
    getTotalFilterRules(filters).map(({ id: _id, ...rule }) => rule);

const withoutGeneratedIds = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(withoutGeneratedIds);
    if (value !== null && typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value)
                .filter(([key]) => key !== 'id')
                .map(([key, entry]) => [key, withoutGeneratedIds(entry)]),
        );
    }
    return value;
};

type ResolvedRawFilters =
    ToolRunQueryExpressionResolvedArgs['queryConfig']['filters'];

const expectLegacyRawFilters = (filters: ResolvedRawFilters) => {
    if (!filters || !('type' in filters)) {
        throw new Error('Expected legacy shared-connector raw filters');
    }
    return filters;
};

const expectPerCategoryRawFilters = (filters: ResolvedRawFilters) => {
    if (!filters || 'type' in filters) {
        throw new Error('Expected per-category resolved raw filters');
    }
    return filters;
};

const numericFormula = {
    type: 'formula' as const,
    name: 'profit_margin',
    displayName: 'Profit margin',
    formula: 'orders_total_revenue / orders_order_count',
    format: 'percent' as const,
    resultType: 'number' as const,
};

type AggregationCustomMetricExpression = Extract<
    NonNullable<
        ToolRunQueryExpressionArgs['queryConfig']['customMetrics']
    >[number],
    { kind: 'aggregation' }
>;

const aggregationCustomMetric = {
    kind: 'aggregation' as const,
    name: 'completed_revenue',
    label: 'Completed revenue',
    description: 'Revenue for completed orders',
    baseDimensionName: 'orders_amount',
    table: 'orders',
    type: MetricType.SUM,
    filters: null,
} satisfies AggregationCustomMetricExpression;

const unsupportedAiFilterMetricTypes = [
    MetricType.PERCENT_OF_PREVIOUS,
    MetricType.PERCENT_OF_TOTAL,
    MetricType.RUNNING_TOTAL,
] as const;

const postCalculationMetricName = 'post_calculation_metric';
const postCalculationMetricId = `orders_${postCalculationMetricName}`;

const exploreWithPostCalculationMetric = (type: MetricType): Explore => ({
    ...mockOrdersExplore,
    tables: {
        ...mockOrdersExplore.tables,
        orders: {
            ...mockOrdersExplore.tables.orders,
            metrics: {
                ...mockOrdersExplore.tables.orders.metrics,
                [postCalculationMetricName]: {
                    ...mockOrdersExplore.tables.orders.metrics.total_revenue,
                    name: postCalculationMetricName,
                    label: 'Post-calculation metric',
                    type,
                },
            },
        },
    },
});

describe('resolveFilterExpressionArgs', () => {
    it('resolves every category and returns raw persisted plus transformed args', async () => {
        const data = await expectResolved(
            expressionArgs({
                customMetrics: [
                    {
                        ...aggregationCustomMetric,
                        filters:
                            "orders_customer_name equals='Acme, Inc.' AND orders_order_date inThePast=30{completed:false,unit:days}",
                    },
                ],
                tableCalculations: [numericFormula],
                filters: {
                    dimensions:
                        "orders_customer_name include='Acme, Inc.' AND orders_order_date inBetween=2025-01-01,2025-01-31",
                    metrics: 'orders_total_revenue greaterThan=100',
                    tableCalculations: 'profit_margin lessThan=0.2',
                },
            }),
        );

        expect(
            toolRunQueryArgsSchemaPersisted.safeParse(data.persistedArgs)
                .success,
        ).toBe(true);
        expect(data.persistedArgs.queryConfig.filters).toMatchObject({
            type: 'and',
            dimensions: [
                {
                    fieldId: 'orders_customer_name',
                    operator: FilterOperator.INCLUDE,
                    values: ['Acme, Inc.'],
                },
                {
                    fieldId: 'orders_order_date',
                    operator: FilterOperator.IN_BETWEEN,
                    values: ['2025-01-01', '2025-01-31'],
                },
            ],
            metrics: [
                {
                    fieldId: 'orders_total_revenue',
                    operator: FilterOperator.GREATER_THAN,
                    values: [100],
                },
            ],
            tableCalculations: [
                {
                    fieldId: 'profit_margin',
                    fieldType: DimensionType.NUMBER,
                    fieldFilterType: FilterType.NUMBER,
                    operator: FilterOperator.LESS_THAN,
                    values: [0.2],
                },
            ],
        });
        expect(data.persistedArgs.queryConfig.customMetrics?.[0]).toMatchObject(
            {
                kind: 'aggregation',
                filters: [
                    {
                        table: 'orders',
                        filter: {
                            fieldId: 'orders_customer_name',
                            values: ['Acme, Inc.'],
                        },
                    },
                    {
                        table: 'orders',
                        filter: {
                            fieldId: 'orders_order_date',
                            values: [30],
                            settings: {
                                unitOfTime: 'days',
                                completed: false,
                            },
                        },
                    },
                ],
            },
        );
        expect(rulesWithoutIds(data.transformed.queryConfig.filters)).toEqual([
            expect.objectContaining({
                target: {
                    fieldId: 'orders_customer_name',
                    fieldFilterType: FilterType.STRING,
                },
                operator: FilterOperator.INCLUDE,
                values: ['Acme, Inc.'],
            }),
            expect.objectContaining({
                target: {
                    fieldId: 'orders_order_date',
                    fieldFilterType: FilterType.DATE,
                },
                operator: FilterOperator.IN_BETWEEN,
            }),
            expect.objectContaining({
                target: {
                    fieldId: 'orders_total_revenue',
                    fieldFilterType: FilterType.NUMBER,
                },
                operator: FilterOperator.GREATER_THAN,
            }),
            expect.objectContaining({
                target: {
                    fieldId: 'profit_margin',
                    fieldFilterType: FilterType.NUMBER,
                },
                operator: FilterOperator.LESS_THAN,
            }),
        ]);
    });

    it('omits values in raw presence rules and preserves canonical transformed empty values', async () => {
        const data = await expectResolved(
            expressionArgs({
                customMetrics: [
                    {
                        ...aggregationCustomMetric,
                        filters: 'orders_customer_name notEquals=null',
                    },
                ],
                filters: {
                    dimensions:
                        "orders_customer_name equals=null AND orders_product_category equals='null'",
                    metrics: 'orders_total_revenue notNull',
                    tableCalculations: null,
                },
            }),
        );

        const rawFilters = expectLegacyRawFilters(
            data.persistedArgs.queryConfig.filters,
        );
        const rawPresenceRules = [
            ...(rawFilters.dimensions ?? []),
            ...(rawFilters.metrics ?? []),
        ].filter(({ operator }) =>
            [FilterOperator.NULL, FilterOperator.NOT_NULL].includes(operator),
        );
        rawPresenceRules.forEach((rule) => {
            expect('values' in rule).toBe(false);
        });
        expect(rawFilters.dimensions?.[1]).toMatchObject({
            operator: FilterOperator.EQUALS,
            values: ['null'],
        });

        const transformedRules = rulesWithoutIds(
            data.transformed.queryConfig.filters,
        );
        expect(transformedRules[0]).toMatchObject({
            operator: FilterOperator.NULL,
            values: [],
        });
        expect(transformedRules[2]).toMatchObject({
            operator: FilterOperator.NOT_NULL,
            values: [],
        });

        const rawCustomMetric =
            data.persistedArgs.queryConfig.customMetrics?.[0];
        if (!rawCustomMetric || rawCustomMetric.kind !== 'aggregation') {
            throw new Error('Expected raw aggregation custom metric');
        }
        const rawCustomMetricRule = rawCustomMetric.filters?.[0].filter;
        if (!rawCustomMetricRule) {
            throw new Error('Expected raw custom metric filter');
        }
        expect(rawCustomMetricRule.operator).toBe(FilterOperator.NOT_NULL);
        expect('values' in rawCustomMetricRule).toBe(false);

        const transformedCustomMetric =
            data.transformed.queryConfig.customMetrics?.[0];
        if (!transformedCustomMetric || 'kind' in transformedCustomMetric) {
            throw new Error('Expected transformed aggregation custom metric');
        }
        expect(transformedCustomMetric.filters?.[0]).toMatchObject({
            operator: FilterOperator.NOT_NULL,
            values: [],
        });
    });

    it('uses the connector supplied by multi-rule categories and ignores single rules', async () => {
        const data = await expectResolved(
            expressionArgs({
                filters: {
                    dimensions: 'orders_customer_name equals=Acme',
                    metrics:
                        'orders_total_revenue greaterThan=10 OR orders_order_count lessThan=2',
                    tableCalculations: null,
                },
            }),
        );

        // Agreeing connectors keep the legacy shared-connector raw shape, so
        // resolved data stays byte-compatible with previously persisted
        // artifacts and the legacy persisted contract.
        const persistedFilters = expectLegacyRawFilters(
            data.persistedArgs.queryConfig.filters,
        );
        expect(persistedFilters.type).toBe('or');
        expect(persistedFilters).not.toHaveProperty('schemaVersion');
        expect(
            toolRunQueryArgsSchemaPersisted.safeParse(data.persistedArgs)
                .success,
        ).toBe(true);
        expect(data.transformed.queryConfig.filters.dimensions).toMatchObject({
            or: [{ target: { fieldId: 'orders_customer_name' } }],
        });
        expect(data.transformed.queryConfig.filters.metrics).toMatchObject({
            or: [
                { target: { fieldId: 'orders_total_revenue' } },
                { target: { fieldId: 'orders_order_count' } },
            ],
        });
    });

    const dimensionsExpressionFor = (connector: 'AND' | 'OR') =>
        `orders_customer_name equals=Acme ${connector} orders_product_category equals=Hardware`;
    const metricsExpressionFor = (connector: 'AND' | 'OR') =>
        `orders_total_revenue greaterThan=10 ${connector} orders_order_count lessThan=2`;
    const tableCalculationsExpressionFor = (connector: 'AND' | 'OR') =>
        `profit_margin greaterThan=0 ${connector} profit_margin lessThan=1`;

    it.each([
        { dimensions: 'AND', metrics: 'OR', tableCalculations: null },
        { dimensions: 'OR', metrics: 'AND', tableCalculations: null },
        { dimensions: 'AND', metrics: null, tableCalculations: 'OR' },
        { dimensions: 'OR', metrics: null, tableCalculations: 'AND' },
        { dimensions: null, metrics: 'AND', tableCalculations: 'OR' },
        { dimensions: null, metrics: 'OR', tableCalculations: 'AND' },
        { dimensions: 'AND', metrics: 'OR', tableCalculations: 'AND' },
        { dimensions: 'OR', metrics: 'AND', tableCalculations: 'OR' },
    ] as const)(
        'accepts independent category connectors dimensions=$dimensions metrics=$metrics tableCalculations=$tableCalculations',
        async ({ dimensions, metrics, tableCalculations }) => {
            const data = await expectResolved(
                expressionArgs({
                    tableCalculations:
                        tableCalculations === null ? null : [numericFormula],
                    filters: {
                        dimensions:
                            dimensions === null
                                ? null
                                : dimensionsExpressionFor(dimensions),
                        metrics:
                            metrics === null
                                ? null
                                : metricsExpressionFor(metrics),
                        tableCalculations:
                            tableCalculations === null
                                ? null
                                : tableCalculationsExpressionFor(
                                      tableCalculations,
                                  ),
                    },
                }),
            );

            // Raw resolved data preserves each category connector exactly.
            const rawFilters = expectPerCategoryRawFilters(
                data.persistedArgs.queryConfig.filters,
            );
            expect(rawFilters).not.toHaveProperty('schemaVersion');
            expect(rawFilters.dimensions?.connector ?? null).toBe(
                dimensions === null ? null : dimensions.toLowerCase(),
            );
            expect(rawFilters.metrics?.connector ?? null).toBe(
                metrics === null ? null : metrics.toLowerCase(),
            );
            expect(rawFilters.tableCalculations?.connector ?? null).toBe(
                tableCalculations === null
                    ? null
                    : tableCalculations.toLowerCase(),
            );
            [
                rawFilters.dimensions,
                rawFilters.metrics,
                rawFilters.tableCalculations,
            ]
                .flatMap((group) => (group === null ? [] : [group]))
                .forEach((group) => {
                    expect(group.rules).toHaveLength(2);
                });

            // Transformed domain filters keep one independent group per
            // category, keyed by that category's own connector.
            const transformedFilters = data.transformed.queryConfig.filters;
            const groupEntries = [
                ['dimensions', dimensions],
                ['metrics', metrics],
                ['tableCalculations', tableCalculations],
            ] as const;
            groupEntries.forEach(([category, connector]) => {
                const group = transformedFilters[category];
                if (connector === 'AND') {
                    expect(group).toMatchObject({
                        and: [expect.anything(), expect.anything()],
                    });
                    expect(group).not.toHaveProperty('or');
                } else if (connector === 'OR') {
                    expect(group).toMatchObject({
                        or: [expect.anything(), expect.anything()],
                    });
                    expect(group).not.toHaveProperty('and');
                } else {
                    expect(group).toMatchObject({ and: [] });
                }
            });

            // New-artifact round-trip: the persisted resolved data replays
            // to the exact same domain filters without Explore metadata.
            expect(
                toolRunQueryExpressionResolvedArgsSchema.parse(
                    data.persistedArgs,
                ),
            ).toEqual(data.persistedArgs);
            expect(
                withoutGeneratedIds(
                    toolRunQueryExpressionResolvedArgsSchemaTransformed.parse(
                        data.persistedArgs,
                    ),
                ),
            ).toEqual(withoutGeneratedIds(data.transformed));
        },
    );

    it('classifies mixed connectors within one expression', async () => {
        const error = await expectResolutionError(
            expressionArgs({
                filters: {
                    dimensions:
                        'orders_customer_name equals=Acme AND orders_product_category equals=Hardware OR orders_is_active equals=true',
                    metrics: null,
                    tableCalculations: null,
                },
            }),
        );

        expect(error).toMatchObject({
            code: 'FILTER_EXPRESSION_MIXED_CONNECTORS',
            source: { category: 'dimensions' },
            span: { start: { line: 1, column: 78 } },
        });
    });

    it('reports unknown fields with suggestions and a stable located message', async () => {
        const error = await expectResolutionError(
            expressionArgs({
                filters: {
                    dimensions: 'orders_customer_nam equals=Acme',
                    metrics: null,
                    tableCalculations: null,
                },
            }),
        );

        expect(error).toMatchObject({
            code: 'FILTER_EXPRESSION_UNKNOWN_FIELD',
            fieldId: 'orders_customer_nam',
            reason: 'notFound',
            suggestions: ['orders_customer_name'],
            span: {
                start: { offset: 0, line: 1, column: 1 },
                end: { offset: 19, line: 1, column: 20 },
            },
        });
        expect(formatFilterExpressionError(error)).toMatchInlineSnapshot(`
          "[FILTER_EXPRESSION_UNKNOWN_FIELD]
          Invalid dimension filter expression for field "orders_customer_nam".

          Location: line 1, column 1
          Problem: The field does not exist in explore "test_explore". Did you mean: orders_customer_name?
          How to fix: Replace it with an existing dimension field ID, or use field discovery to find the field.
          Example: orders_customer_name equals=example"
        `);
    });

    it.each([
        ['dimensions', 'orders_total_revenue greaterThan=10', 'metrics'],
        ['metrics', 'orders_customer_name equals=Acme', 'dimensions'],
        ['metrics', 'profit_margin greaterThan=0.2', 'tableCalculations'],
    ] as const)(
        'rejects a field in the wrong %s category',
        async (category, expression, expectedCategory) => {
            const error = await expectResolutionError(
                expressionArgs({
                    tableCalculations: [numericFormula],
                    filters: {
                        dimensions: null,
                        metrics: null,
                        tableCalculations: null,
                        [category]: expression,
                    },
                }),
            );

            expect(error).toMatchObject({
                code: 'FILTER_EXPRESSION_WRONG_CATEGORY',
                source: { category },
                expectedCategory,
            });
            expect(formatFilterExpressionError(error)).toContain(
                `move this rule to queryConfig.filters.${expectedCategory}`,
            );
        },
    );

    it('rejects ambiguous IDs rather than selecting the first field', async () => {
        const error = await expectResolutionError(
            expressionArgs({
                customMetrics: [
                    {
                        ...aggregationCustomMetric,
                        name: 'total_revenue',
                    },
                ],
                filters: {
                    dimensions: null,
                    metrics: 'orders_total_revenue greaterThan=10',
                    tableCalculations: null,
                },
            }),
        );

        expect(error).toMatchObject({
            code: 'FILTER_EXPRESSION_UNKNOWN_FIELD',
            fieldId: 'orders_total_revenue',
            reason: 'ambiguous',
            suggestions: [],
        });
    });

    it('resolves aggregation custom metrics as metric filter fields', async () => {
        const data = await expectResolved(
            expressionArgs({
                customMetrics: [aggregationCustomMetric],
                filters: {
                    dimensions: null,
                    metrics: 'orders_completed_revenue greaterThan=100',
                    tableCalculations: null,
                },
            }),
        );

        expect(
            expectLegacyRawFilters(data.persistedArgs.queryConfig.filters)
                .metrics?.[0],
        ).toMatchObject({
            fieldId: 'orders_completed_revenue',
            fieldFilterType: FilterType.NUMBER,
            operator: FilterOperator.GREATER_THAN,
            values: [100],
        });
    });

    it.each(unsupportedAiFilterMetricTypes)(
        'rejects unsupported AI query filter metric type %s before persistence',
        async (metricType) => {
            const error = await expectResolutionError(
                expressionArgs({
                    filters: {
                        dimensions: null,
                        metrics: `${postCalculationMetricId} greaterThan=100`,
                        tableCalculations: null,
                    },
                }),
                () => exploreWithPostCalculationMetric(metricType),
            );

            expect(error).toMatchObject({
                code: 'FILTER_EXPRESSION_INVALID_VALUE',
                source: { kind: 'queryFilter', category: 'metrics' },
                fieldId: postCalculationMetricId,
                filterType: FilterType.NUMBER,
                problem: `Metric type "${metricType}" is not supported by AI filters.`,
                guidance:
                    'Use another metric whose type is supported by AI filters, or remove this filter rule.',
            });
        },
    );

    it.each(unsupportedAiFilterMetricTypes)(
        'rejects unsupported AI custom metric filter type %s before persistence',
        async (metricType) => {
            const error = await expectResolutionError(
                expressionArgs({
                    customMetrics: [
                        {
                            ...aggregationCustomMetric,
                            filters: `${postCalculationMetricId} greaterThan=100`,
                        },
                    ],
                }),
                () => exploreWithPostCalculationMetric(metricType),
            );

            expect(error).toMatchObject({
                code: 'FILTER_EXPRESSION_INVALID_VALUE',
                source: { kind: 'customMetricFilter' },
                fieldId: postCalculationMetricId,
                filterType: FilterType.NUMBER,
                problem: `Metric type "${metricType}" is not supported by AI filters.`,
                guidance:
                    'Use another metric whose type is supported by AI filters, or remove this filter rule.',
            });
        },
    );

    it('rejects OR in custom metric filters without constraining query connectors', async () => {
        const error = await expectResolutionError(
            expressionArgs({
                customMetrics: [
                    {
                        ...aggregationCustomMetric,
                        filters:
                            'orders_customer_name equals=Acme OR orders_product_category equals=Hardware',
                    },
                ],
            }),
        );

        expect(error).toMatchObject({
            code: 'FILTER_EXPRESSION_CUSTOM_METRIC_OR',
            source: {
                kind: 'customMetricFilter',
                customMetricName: 'completed_revenue',
            },
        });

        const data = await expectResolved(
            expressionArgs({
                customMetrics: [
                    {
                        ...aggregationCustomMetric,
                        filters:
                            'orders_customer_name equals=Acme AND orders_product_category equals=Hardware',
                    },
                ],
                filters: {
                    dimensions: null,
                    metrics:
                        'orders_total_revenue greaterThan=10 OR orders_order_count lessThan=2',
                    tableCalculations: null,
                },
            }),
        );
        expect(
            expectLegacyRawFilters(data.persistedArgs.queryConfig.filters).type,
        ).toBe('or');
    });

    it('derives custom metric fieldRef from resolved table and field metadata', async () => {
        const sourceDimension =
            mockOrdersExplore.tables.orders.dimensions.customer_name;
        const underscoreTable: CompiledTable = {
            ...mockOrdersExplore.tables.orders,
            name: 'order_items_archive',
            label: 'Archived order items',
            sqlTable: 'order_items_archive',
            dimensions: {
                sales_region_code: {
                    ...sourceDimension,
                    name: 'sales_region_code',
                    label: 'Sales region code',
                    table: 'order_items_archive',
                    tableLabel: 'Archived order items',
                    sql: '${TABLE}.sales_region_code',
                    compiledSql: 'order_items_archive.sales_region_code',
                },
            },
            metrics: {},
        };
        const explore: Explore = {
            ...mockOrdersExplore,
            tables: {
                ...mockOrdersExplore.tables,
                order_items_archive: underscoreTable,
            },
        };
        const data = await expectResolved(
            expressionArgs({
                customMetrics: [
                    {
                        ...aggregationCustomMetric,
                        filters:
                            'order_items_archive_sales_region_code equals=emea',
                    },
                ],
            }),
            async () => explore,
        );

        const customMetric = data.transformed.queryConfig.customMetrics?.[0];
        if (!customMetric || 'kind' in customMetric) {
            throw new Error('Expected transformed aggregation metric');
        }
        expect(customMetric.filters?.[0].target.fieldRef).toBe(
            'order_items_archive.sales_region_code',
        );
    });

    const makeMergeFixtures = ({
        primaryFilters,
        sourceFilters,
    }: {
        primaryFilters: ToolRunQueryExpressionArgs['queryConfig']['filters'];
        sourceFilters: ToolRunQueryExpressionArgs['queryConfig']['filters'];
    }) => {
        const usersExplore: Explore = {
            ...mockOrdersExplore,
            name: 'users_explore',
            tables: {
                users: {
                    ...mockOrdersExplore.tables.orders,
                    name: 'users',
                    label: 'Users',
                    sqlTable: 'users',
                    dimensions: {
                        user_name: {
                            ...mockOrdersExplore.tables.orders.dimensions
                                .customer_name,
                            name: 'user_name',
                            label: 'User name',
                            table: 'users',
                            tableLabel: 'Users',
                            sql: '${TABLE}.user_name',
                            compiledSql: 'users.user_name',
                        },
                        user_region: {
                            ...mockOrdersExplore.tables.orders.dimensions
                                .customer_name,
                            name: 'user_region',
                            label: 'User region',
                            table: 'users',
                            tableLabel: 'Users',
                            sql: '${TABLE}.user_region',
                            compiledSql: 'users.user_region',
                        },
                    },
                    metrics: {
                        user_count: {
                            ...mockOrdersExplore.tables.orders.metrics
                                .order_count,
                            name: 'user_count',
                            label: 'User count',
                            table: 'users',
                            tableLabel: 'Users',
                        },
                    },
                },
            },
        };
        const getExplore = vi.fn(async (exploreName: string) => {
            if (exploreName === mockOrdersExplore.name)
                return mockOrdersExplore;
            if (exploreName === usersExplore.name) return usersExplore;
            throw new Error(`Unknown explore ${exploreName}`);
        });
        const args = toolRunQueryExpressionArgsSchema.parse({
            title: 'Merged query',
            description: 'Merge resolver test',
            queryConfig: {
                ...baseQueryConfig,
                filters: primaryFilters,
            },
            chartConfig: null,
            mergeConfig: {
                primarySourceId: 'orders',
                additionalSources: [
                    {
                        id: 'users',
                        queryConfig: {
                            exploreName: usersExplore.name,
                            dimensions: ['users_user_name'],
                            metrics: ['users_user_count'],
                            sorts: [],
                            customMetrics: null,
                            filters: sourceFilters,
                        },
                    },
                ],
                joinKey: [
                    {
                        name: 'name',
                        fields: [
                            {
                                sourceId: 'orders',
                                fieldId: 'orders_customer_name',
                            },
                            {
                                sourceId: 'users',
                                fieldId: 'users_user_name',
                            },
                        ],
                    },
                ],
                joinType: 'full',
            },
        });
        return { usersExplore, getExplore, args };
    };

    it('resolves merge sources with their own async scoped explores', async () => {
        const { usersExplore, getExplore, args } = makeMergeFixtures({
            primaryFilters: {
                dimensions: 'orders_customer_name equals=Acme',
                metrics: null,
                tableCalculations: null,
            },
            sourceFilters: {
                dimensions: 'users_user_name equals=Alice',
                metrics: null,
                tableCalculations: null,
            },
        });

        const data = await expectResolved(args, getExplore);
        expect(getExplore).toHaveBeenCalledWith(mockOrdersExplore.name);
        expect(getExplore).toHaveBeenCalledWith(usersExplore.name);
        expect(
            expectLegacyRawFilters(
                data.persistedArgs.mergeConfig?.additionalSources[0].queryConfig
                    .filters ?? null,
            ).dimensions?.[0],
        ).toMatchObject({
            fieldId: 'users_user_name',
            values: ['Alice'],
        });
    });

    it('keeps merge source connectors independent of the primary query', async () => {
        const { getExplore, args } = makeMergeFixtures({
            primaryFilters: {
                dimensions:
                    'orders_customer_name equals=Acme AND orders_product_category equals=Hardware',
                metrics:
                    'orders_total_revenue greaterThan=10 OR orders_order_count lessThan=2',
                tableCalculations: null,
            },
            sourceFilters: {
                dimensions:
                    'users_user_name equals=Alice OR users_user_region equals=emea',
                metrics: null,
                tableCalculations: null,
            },
        });

        const data = await expectResolved(args, getExplore);

        // Primary connectors diverge, so its resolved data uses the
        // per-category shape.
        const primaryFilters = expectPerCategoryRawFilters(
            data.persistedArgs.queryConfig.filters,
        );
        expect(primaryFilters.dimensions?.connector).toBe('and');
        expect(primaryFilters.metrics?.connector).toBe('or');

        // The additional source agrees internally, so it keeps the legacy
        // shape with its own connector, unaffected by the primary query.
        const sourceFilters = expectLegacyRawFilters(
            data.persistedArgs.mergeConfig?.additionalSources[0].queryConfig
                .filters ?? null,
        );
        expect(sourceFilters.type).toBe('or');

        expect(data.transformed.queryConfig.filters.dimensions).toMatchObject({
            and: [expect.anything(), expect.anything()],
        });
        expect(data.transformed.queryConfig.filters.metrics).toMatchObject({
            or: [expect.anything(), expect.anything()],
        });
        expect(
            data.transformed.mergeConfig?.additionalSources[0].queryConfig
                .filters.dimensions,
        ).toMatchObject({
            or: [
                { target: { fieldId: 'users_user_name' } },
                { target: { fieldId: 'users_user_region' } },
            ],
        });

        expect(
            withoutGeneratedIds(
                toolRunQueryExpressionResolvedArgsSchemaTransformed.parse(
                    data.persistedArgs,
                ),
            ),
        ).toEqual(withoutGeneratedIds(data.transformed));
    });

    it('propagates scoped explore lookup failures', async () => {
        const lookupError = new Error('Explore is not scoped to this agent');
        await expect(
            resolveArgs(expressionArgs(), async () => {
                throw lookupError;
            }),
        ).rejects.toBe(lookupError);
    });
});

describe('strict expression value interpretation', () => {
    it('interprets quoted tokens by metadata type', async () => {
        const data = await expectResolved(
            expressionArgs({
                filters: {
                    dimensions:
                        "orders_amount equals='1e2' AND orders_is_active equals='true' AND orders_order_date equals='2025-01-01' AND orders_product_category equals=''",
                    metrics: null,
                    tableCalculations: null,
                },
            }),
        );

        expect(
            expectLegacyRawFilters(
                data.persistedArgs.queryConfig.filters,
            ).dimensions?.map((rule) =>
                'values' in rule ? rule.values : undefined,
            ),
        ).toEqual([[100], [true], ['2025-01-01'], ['']]);
    });

    it.each([
        ['orders_amount equals=0x10', 'finite number'],
        ['orders_amount equals=Infinity', 'finite number'],
        ['orders_amount equals=NaN', 'finite number'],
        ["orders_amount equals=' '", 'finite number'],
        ['orders_amount equals=1_0', 'finite number'],
        ['orders_is_active equals=True', 'true or false'],
        ['orders_order_date equals=January-1-2025', 'ISO date'],
        [
            'orders_order_date inThePast=1.5{unit:days,completed:false}',
            'positive integer',
        ],
        [
            'orders_order_date inThePast=0{unit:days,completed:false}',
            'positive integer',
        ],
        [
            'orders_order_date inThePast=1{unit:hours,completed:false}',
            'days, weeks',
        ],
        [
            'orders_order_date inThePast=1{unit:days,completed:TRUE}',
            'true or false',
        ],
        ['orders_amount equals=null,1', 'Bare null'],
        ["orders_amount equals='null'", 'finite number'],
        ['orders_product_category greaterThan=1', 'not available'],
        [
            'orders_order_date notInBetween=2025-01-01,2025-02-01',
            'not available',
        ],
    ] as const)(
        'rejects invalid strict value input %s',
        async (expression, problemText) => {
            const error = await expectResolutionError(
                expressionArgs({
                    filters: {
                        dimensions: expression,
                        metrics: null,
                        tableCalculations: null,
                    },
                }),
            );

            expect(error.code).toBe('FILTER_EXPRESSION_INVALID_VALUE');
            expect(formatFilterExpressionError(error)).toContain(problemText);
        },
    );

    it.each([
        ['orders_order_date inThePast=1', 'requires a settings object'],
        [
            'orders_order_date inThePast=1{unit:days}',
            'requires both unit and completed',
        ],
        [
            'orders_order_date inThePast=1{unit:days,completed:false,timezone:UTC}',
            'Unknown relative-date setting "timezone"',
        ],
        [
            'orders_order_date inThePast=1{unit:days,unit:weeks,completed:false}',
            'may appear only once',
        ],
        [
            'orders_amount equals=1{unit:days,completed:false}',
            'does not accept a settings object',
        ],
    ] as const)(
        'rejects invalid named settings in %s',
        async (expression, problemText) => {
            const error = await expectResolutionError(
                expressionArgs({
                    filters: {
                        dimensions: expression,
                        metrics: null,
                        tableCalculations: null,
                    },
                }),
            );

            expect(error.code).toBe('FILTER_EXPRESSION_INVALID_VALUE');
            expect(formatFilterExpressionError(error)).toContain(problemText);
        },
    );

    it('rejects positional relative-date settings', async () => {
        const error = await expectResolutionError(
            expressionArgs({
                filters: {
                    dimensions: 'orders_order_date inThePast=1,days,false',
                    metrics: null,
                    tableCalculations: null,
                },
            }),
        );

        expect(error).toMatchObject({
            code: 'FILTER_EXPRESSION_WRONG_ARITY',
            operator: FilterOperator.IN_THE_PAST,
            expected: 1,
            actual: 3,
        });
        expect(formatFilterExpressionError(error)).toContain(
            'inThePast=30{unit:days,completed:false}',
        );
    });

    it('reports wrong arity separately from invalid values', async () => {
        const error = await expectResolutionError(
            expressionArgs({
                filters: {
                    dimensions: 'orders_amount greaterThan=1,2',
                    metrics: null,
                    tableCalculations: null,
                },
            }),
        );

        expect(error).toMatchObject({
            code: 'FILTER_EXPRESSION_WRONG_ARITY',
            operator: FilterOperator.GREATER_THAN,
            expected: 1,
            actual: 2,
        });
    });

    it('rejects nonnumeric table-calculation filters explicitly', async () => {
        const error = await expectResolutionError(
            expressionArgs({
                tableCalculations: [
                    {
                        ...numericFormula,
                        name: 'status_label',
                        formula: 'IF(orders_total_revenue > 0, "yes", "no")',
                        format: null,
                        resultType: 'string',
                    },
                ],
                filters: {
                    dimensions: null,
                    metrics: null,
                    tableCalculations: 'status_label equals=yes',
                },
            }),
        );

        expect(error).toMatchObject({
            code: 'FILTER_EXPRESSION_INVALID_VALUE',
            source: { category: 'tableCalculations' },
        });
        expect(formatFilterExpressionError(error)).toContain(
            'Only numeric table calculations can be filtered',
        );
    });
});

const filterTypeToDimensionType: Record<FilterType, DimensionType> = {
    [FilterType.BOOLEAN]: DimensionType.BOOLEAN,
    [FilterType.STRING]: DimensionType.STRING,
    [FilterType.NUMBER]: DimensionType.NUMBER,
    [FilterType.DATE]: DimensionType.DATE,
};

const buildPermutationExplore = (): Explore => {
    const dimensionsByTable: Record<
        'orders' | 'users',
        Record<string, CompiledDimension>
    > = { orders: {}, users: {} };

    Object.entries(fieldCatalog).forEach(([fieldId, catalogEntry]) => {
        const separator = fieldId.indexOf('_');
        const table = fieldId.slice(0, separator);
        const name = fieldId.slice(separator + 1);
        if (table !== 'orders' && table !== 'users') {
            throw new Error(`Unexpected test table ${table}`);
        }
        dimensionsByTable[table][name] = {
            fieldType: FieldType.DIMENSION,
            type: filterTypeToDimensionType[catalogEntry.fieldFilterType],
            name,
            label: catalogEntry.label,
            table,
            tableLabel: table,
            sql: `\${TABLE}.${name}`,
            hidden: false,
            source: undefined,
            compiledSql: `${table}.${name}`,
            tablesReferences: [table],
        };
    });

    const makeTable = (
        name: 'orders' | 'users',
        dimensions: Record<string, CompiledDimension>,
    ): CompiledTable => ({
        ...mockOrdersExplore.tables.orders,
        name,
        label: name,
        sqlTable: name,
        dimensions,
        metrics: {},
    });

    return {
        ...mockOrdersExplore,
        name: 'filter_permutations',
        baseTable: 'orders',
        tables: {
            orders: makeTable('orders', dimensionsByTable.orders),
            users: makeTable('users', dimensionsByTable.users),
        },
    };
};

const scalarText = (value: unknown): string => {
    if (typeof value === 'string') return JSON.stringify(value);
    if (typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
    }
    throw new Error(`Unsupported permutation scalar ${String(value)}`);
};

const expressionFromExpected = (expected: ExpectedFilter): string => {
    if (
        expected.operator === FilterOperator.NULL ||
        expected.operator === FilterOperator.NOT_NULL
    ) {
        return `${expected.fieldId} ${expected.operator}`;
    }

    if (
        expected.operator === FilterOperator.IN_THE_CURRENT ||
        expected.operator === FilterOperator.NOT_IN_THE_CURRENT
    ) {
        if (!expected.settings?.unitOfTime) {
            throw new Error('Current-period fixture is missing its unit');
        }
        return `${expected.fieldId} ${expected.operator}=${expected.settings.unitOfTime}`;
    }

    if (
        expected.operator === FilterOperator.IN_THE_PAST ||
        expected.operator === FilterOperator.NOT_IN_THE_PAST ||
        expected.operator === FilterOperator.IN_THE_NEXT
    ) {
        const value = expected.values?.[0];
        const { completed, unitOfTime } = expected.settings ?? {};
        if (
            typeof value !== 'number' ||
            typeof completed !== 'boolean' ||
            !unitOfTime
        ) {
            throw new Error('Relative-period fixture is incomplete');
        }
        return `${expected.fieldId} ${expected.operator}=${value}{unit:${unitOfTime},completed:${completed}}`;
    }

    if (!expected.values) {
        throw new Error('Value filter fixture is missing values');
    }
    return `${expected.fieldId} ${expected.operator}=${expected.values
        .map(scalarText)
        .join(',')}`;
};

const permutationExplore = buildPermutationExplore();

const legacyArgsForExpected = (expected: ExpectedFilter) =>
    toolRunQueryArgsSchemaTransformed.parse({
        title: 'Test query',
        description: 'Resolver test',
        queryConfig: {
            exploreName: permutationExplore.name,
            dimensions: [],
            metrics: [],
            sorts: [],
            limit: 500,
            parameters: null,
            customMetrics: null,
            tableCalculations: null,
            filters: {
                type: 'and',
                dimensions: [expected],
                metrics: null,
                tableCalculations: null,
            },
        },
        chartConfig: null,
        mergeConfig: null,
    });

describe('legacy JSON differential parity', () => {
    it.each(filterPermutationCases)(
        'matches transformed legacy output for $id',
        async ({ expected }) => {
            const expressionData = await expectResolved(
                expressionArgs({
                    exploreName: permutationExplore.name,
                    dimensions: [],
                    metrics: [],
                    filters: {
                        dimensions: expressionFromExpected(expected),
                        metrics: null,
                        tableCalculations: null,
                    },
                }),
                () => permutationExplore,
            );
            const legacyData = legacyArgsForExpected(expected);

            expect(withoutGeneratedIds(expressionData.transformed)).toEqual(
                withoutGeneratedIds(legacyData),
            );

            expect(() =>
                validateFilterRules(
                    permutationExplore,
                    getTotalFilterRules(
                        expressionData.transformed.queryConfig.filters,
                    ),
                ),
            ).not.toThrow();
        },
    );
});
