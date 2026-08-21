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
    toolRunQueryExpressionArgsSchemaV2,
    type CompiledDimension,
    type CompiledTable,
    type Explore,
    type FilterRule,
    type Filters,
    type ToolRunQueryExpressionArgs,
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

describe('resolveFilterExpressionArgs', () => {
    it('resolves every category and returns raw persisted plus transformed args', async () => {
        const data = await expectResolved(
            expressionArgs({
                customMetrics: [
                    {
                        ...aggregationCustomMetric,
                        filters:
                            "orders_customer_name equals='Acme, Inc.' AND orders_order_date inThePast=30,days,false",
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
            toolRunQueryArgsSchemaPersisted.safeParse(data.rawArgs).success,
        ).toBe(true);
        expect(data.rawArgs.queryConfig.filters).toMatchObject({
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
        expect(data.rawArgs.queryConfig.customMetrics?.[0]).toMatchObject({
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
        });
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

        const rawFilters = data.rawArgs.queryConfig.filters;
        if (!rawFilters) throw new Error('Expected raw filters');
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

        const rawCustomMetric = data.rawArgs.queryConfig.customMetrics?.[0];
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

    it('accepts the V2 wide table-calculation contract used by MCP and merge-disabled agents', async () => {
        const args = toolRunQueryExpressionArgsSchemaV2.parse({
            title: 'V2 query',
            description: 'Wide table calculation',
            queryConfig: {
                ...baseQueryConfig,
                tableCalculations: [
                    {
                        type: 'running_total',
                        name: 'running_revenue',
                        displayName: 'Running revenue',
                        fieldId: 'orders_total_revenue',
                    },
                ],
                filters: {
                    dimensions: null,
                    metrics: null,
                    tableCalculations: 'running_revenue greaterThan=100',
                },
            },
            chartConfig: null,
        });

        const data = await expectResolved(args);
        expect(
            data.rawArgs.queryConfig.filters?.tableCalculations?.[0],
        ).toMatchObject({
            fieldId: 'running_revenue',
            fieldType: DimensionType.NUMBER,
            operator: FilterOperator.GREATER_THAN,
            values: [100],
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

        expect(data.rawArgs.queryConfig.filters?.type).toBe('or');
    });

    it('rejects connector conflicts across query categories', async () => {
        const error = await expectResolutionError(
            expressionArgs({
                filters: {
                    dimensions:
                        'orders_customer_name equals=Acme AND orders_product_category equals=Hardware',
                    metrics:
                        'orders_total_revenue greaterThan=10 OR orders_order_count lessThan=2',
                    tableCalculations: null,
                },
            }),
        );

        expect(error).toMatchObject({
            code: 'FILTER_EXPRESSION_CONNECTOR_CONFLICT',
            source: { category: 'metrics' },
            connector: 'or',
            conflictingConnector: 'and',
        });
    });

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

        expect(data.rawArgs.queryConfig.filters?.metrics?.[0]).toMatchObject({
            fieldId: 'orders_completed_revenue',
            fieldFilterType: FilterType.NUMBER,
            operator: FilterOperator.GREATER_THAN,
            values: [100],
        });
    });

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
        expect(data.rawArgs.queryConfig.filters?.type).toBe('or');
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

    it('resolves merge sources with their own async scoped explores', async () => {
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
                filters: {
                    dimensions: 'orders_customer_name equals=Acme',
                    metrics: null,
                    tableCalculations: null,
                },
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
                            filters: {
                                dimensions: 'users_user_name equals=Alice',
                                metrics: null,
                                tableCalculations: null,
                            },
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

        const data = await expectResolved(args, getExplore);
        expect(getExplore).toHaveBeenCalledWith(mockOrdersExplore.name);
        expect(getExplore).toHaveBeenCalledWith(usersExplore.name);
        expect(
            data.rawArgs.mergeConfig?.additionalSources[0].queryConfig.filters
                ?.dimensions?.[0],
        ).toMatchObject({
            fieldId: 'users_user_name',
            values: ['Alice'],
        });
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
            data.rawArgs.queryConfig.filters?.dimensions?.map((rule) =>
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
        ['orders_order_date inThePast=1.5,days,false', 'positive integer'],
        ['orders_order_date inThePast=0,days,false', 'positive integer'],
        ['orders_order_date inThePast=1,hours,false', 'days, weeks'],
        ['orders_order_date inThePast=1,days,TRUE', 'true or false'],
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
        return `${expected.fieldId} ${expected.operator}=${value},${unitOfTime},${completed}`;
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
