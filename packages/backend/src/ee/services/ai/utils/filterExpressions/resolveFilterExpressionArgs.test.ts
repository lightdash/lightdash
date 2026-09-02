import {
    DimensionType,
    FieldType,
    FILTER_EXPRESSION_MAX_LENGTH,
    FILTER_EXPRESSION_MAX_LITERAL_LENGTH,
    FILTER_EXPRESSION_MAX_RULES,
    FILTER_EXPRESSION_MAX_VALUES_PER_RULE,
    FilterOperator,
    FilterType,
    getTotalFilterRules,
    MetricType,
    parseFilterExpression,
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

const filterCategoryLabels = {
    dimensions: 'dimension',
    metrics: 'metric',
    tableCalculations: 'table calculation',
} as const;

const domainSpecificRepairExamples = [
    'orders_status equals=completed',
    'orders_total_revenue greaterThan=100',
    'profit_margin lessThan=0.2',
    'orders_region equals=emea',
] as const;

const expectParseableExample = (example: string | null) => {
    expect(example).not.toBeNull();
    if (example === null) throw new Error('Expected a repair example');
    domainSpecificRepairExamples.forEach((domainSpecificExample) => {
        expect(example).not.toContain(domainSpecificExample);
    });
    const parsed = parseFilterExpression(example);
    expect(parsed).toMatchObject({ success: true });
    if (!parsed.success) throw new Error(parsed.error.message);
    return parsed.expression;
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

const ordersDimensions = mockOrdersExplore.tables.orders.dimensions;
type OrdersDimensionName = keyof typeof ordersDimensions;

const exploreWithOnlyDimension = (
    dimensionName: OrdersDimensionName,
): Explore => ({
    ...mockOrdersExplore,
    tables: {
        orders: {
            ...mockOrdersExplore.tables.orders,
            dimensions: {
                [dimensionName]: ordersDimensions[dimensionName],
            },
            metrics: {},
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

    it('propagates malformed parser syntax with its source and span', async () => {
        const malformedLine = 'orders_product_category equals=';
        const expression = `orders_customer_name equals=Acme AND\n${malformedLine}`;
        const error = await expectResolutionError(
            expressionArgs({
                filters: {
                    dimensions: expression,
                    metrics: null,
                    tableCalculations: null,
                },
            }),
        );

        expect(error.code).toBe('FILTER_EXPRESSION_SYNTAX');
        if (error.code !== 'FILTER_EXPRESSION_SYNTAX') {
            throw new Error('Expected a syntax resolution error');
        }

        const endPosition = {
            offset: expression.length,
            line: 2,
            column: malformedLine.length + 1,
        };
        expect(error).toMatchObject({
            source: {
                kind: 'queryFilter',
                exploreName: mockOrdersExplore.name,
                category: 'dimensions',
            },
            span: { start: endPosition, end: endPosition },
            problem: '`equals` is missing a value after `=`.',
            guidance: 'Add a value after `=`; quote string values.',
            example: `${expression}"example value"`,
        });
        expect(error.parserMessage).toContain('end of input');
        const serializedError = JSON.stringify(error);
        expect(serializedError).toContain('"parserMessage":');
        expect(serializedError).toContain(JSON.stringify(error.parserMessage));
        const formatted = formatFilterExpressionError(error);
        expect(formatted).not.toContain(error.parserMessage);
        expect(formatted).not.toContain('[ \\t\\r\\n]');
        expectParseableExample(error.example);
        await expectResolved(
            expressionArgs({
                filters: {
                    dimensions: error.example,
                    metrics: null,
                    tableCalculations: null,
                },
            }),
        );
    });

    it.each([
        {
            description: 'a missing string value',
            expression: 'orders_customer_name equals=',
            problem: '`equals` is missing a value after `=`.',
            guidance: 'Add a value after `=`; quote string values.',
            example: 'orders_customer_name equals="example value"',
        },
        {
            description: 'a trailing comma',
            expression: 'orders_customer_name equals=Acme,',
            problem: 'The trailing comma is missing another value.',
            guidance:
                'Add another value after the trailing comma, or remove the comma if the list is complete.',
            example: 'orders_customer_name equals=Acme',
        },
        {
            description: 'literal parentheses',
            expression: 'orders_customer_name equals=(Acme)',
            problem: 'Parentheses are syntax punctuation in unquoted values.',
            guidance:
                'Quote the whole literal when parentheses are part of the value.',
            example: 'orders_customer_name equals="(Acme)"',
        },
        {
            description: 'an invalid escape',
            expression: "orders_customer_name equals='bad\\q'",
            problem: 'The escape sequence `\\q` is unsupported.',
            guidance:
                'Escape a literal backslash as `\\\\`, or remove the backslash.',
            example: "orders_customer_name equals='bad\\\\q'",
        },
        {
            description: 'a named-setting equals separator',
            expression:
                'orders_order_date inThePast=3{unit=days,completed:false}',
            problem:
                'Named settings use `:` between each name and value, not `=`.',
            guidance: 'Replace the setting separator with `:`.',
            example: 'orders_order_date inThePast=3{unit:days,completed:false}',
        },
    ])(
        'provides a parser- and metadata-valid contextual repair for $description',
        async ({ expression, problem, guidance, example }) => {
            const error = await expectResolutionError(
                expressionArgs({
                    filters: {
                        dimensions: expression,
                        metrics: null,
                        tableCalculations: null,
                    },
                }),
            );

            expect(error).toMatchObject({
                code: 'FILTER_EXPRESSION_SYNTAX',
                problem,
                guidance,
                example,
            });
            expect(error.example).not.toContain(
                'orders_status equals=completed',
            );
            expectParseableExample(error.example);
            await expectResolved(
                expressionArgs({
                    filters: {
                        dimensions: error.example,
                        metrics: null,
                        tableCalculations: null,
                    },
                }),
            );
        },
    );

    it('propagates parser bounds errors with source, span, and limit metadata', async () => {
        const rule = 'f equals=1';
        const connector = ' AND ';
        const rulesBeforeExcess = Array.from(
            { length: FILTER_EXPRESSION_MAX_RULES },
            () => rule,
        ).join(connector);
        const expression = `${rulesBeforeExcess}${connector}${rule}`;
        const firstExcessRuleOffset =
            rulesBeforeExcess.length + connector.length;
        const error = await expectResolutionError(
            expressionArgs({
                filters: {
                    dimensions: expression,
                    metrics: null,
                    tableCalculations: null,
                },
            }),
        );

        expect(error.code).toBe('FILTER_EXPRESSION_BOUNDS_EXCEEDED');
        if (error.code !== 'FILTER_EXPRESSION_BOUNDS_EXCEEDED') {
            throw new Error('Expected a parser bounds resolution error');
        }
        expect(error).toMatchObject({
            source: {
                kind: 'queryFilter',
                exploreName: mockOrdersExplore.name,
                category: 'dimensions',
            },
            span: {
                start: {
                    offset: firstExcessRuleOffset,
                    line: 1,
                    column: firstExcessRuleOffset + 1,
                },
                end: {
                    offset: firstExcessRuleOffset + rule.length,
                    line: 1,
                    column: firstExcessRuleOffset + rule.length + 1,
                },
            },
            limit: 'ruleCount',
            maximum: FILTER_EXPRESSION_MAX_RULES,
            actual: FILTER_EXPRESSION_MAX_RULES + 1,
            example: null,
        });
        expect(formatFilterExpressionError(error)).not.toContain('Example:');
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

    it.each([
        {
            limit: 'expressionLength',
            expression: `${'x'.repeat(FILTER_EXPRESSION_MAX_LENGTH)} equals=value`,
            guidance: `Shorten the expression to at most ${FILTER_EXPRESSION_MAX_LENGTH} characters, using fewer rules or shorter values.`,
        },
        {
            limit: 'ruleCount',
            expression: Array.from(
                { length: FILTER_EXPRESSION_MAX_RULES + 1 },
                () => 'f equals=1',
            ).join(' AND '),
            guidance: `Reduce the expression to at most ${FILTER_EXPRESSION_MAX_RULES} rules.`,
        },
        {
            limit: 'valueCount',
            expression: `orders_customer_name equals=${Array.from(
                { length: FILTER_EXPRESSION_MAX_VALUES_PER_RULE + 1 },
                (_, index) => `value_${index}`,
            ).join(',')}`,
            guidance: `Reduce this rule to at most ${FILTER_EXPRESSION_MAX_VALUES_PER_RULE} values.`,
        },
        {
            limit: 'literalLength',
            expression: `${'f'.repeat(FILTER_EXPRESSION_MAX_LITERAL_LENGTH + 1)} equals=value`,
            guidance: `Shorten this literal to at most ${FILTER_EXPRESSION_MAX_LITERAL_LENGTH} characters.`,
        },
    ] as const)(
        'derives $limit-specific bounds guidance from the reported maximum',
        async ({ limit, expression, guidance }) => {
            // Spread past the args schema: parser bounds also guard callers
            // that never went through toolRunQueryExpressionArgsSchema.
            const args = expressionArgs();
            const error = await expectResolutionError({
                ...args,
                queryConfig: {
                    ...args.queryConfig,
                    filters: {
                        dimensions: expression,
                        metrics: null,
                        tableCalculations: null,
                    },
                },
            });

            expect(error).toMatchObject({
                code: 'FILTER_EXPRESSION_BOUNDS_EXCEEDED',
                limit,
                guidance,
                example: null,
            });
        },
    );

    it.each([
        {
            description: 'AND followed by OR',
            expression:
                'orders_customer_name equals=Acme AND orders_product_category equals=Hardware OR orders_is_active equals=true',
            example:
                'orders_customer_name equals=Acme AND orders_product_category equals=Hardware AND orders_is_active equals=true',
        },
        {
            description: 'OR followed by AND',
            expression:
                'orders_customer_name equals=Acme OR orders_product_category equals=Hardware AND orders_is_active equals=true',
            example:
                'orders_customer_name equals=Acme OR orders_product_category equals=Hardware OR orders_is_active equals=true',
        },
        {
            description: 'multiline connectors around quoted connector text',
            expression:
                'orders_customer_name equals="A AND B" OR\norders_product_category equals="C OR D" AND\norders_is_active equals=true',
            example:
                'orders_customer_name equals="A AND B" OR\norders_product_category equals="C OR D" OR\norders_is_active equals=true',
        },
        {
            description: 'more than one later conflict',
            expression:
                'orders_customer_name equals=Acme AND orders_product_category equals=Hardware OR orders_is_active equals=true OR orders_amount greaterThan=10',
            example:
                'orders_customer_name equals=Acme AND orders_product_category equals=Hardware AND orders_is_active equals=true AND orders_amount greaterThan=10',
        },
    ])(
        'normalizes $description to the first root connector',
        async ({ expression, example }) => {
            const error = await expectResolutionError(
                expressionArgs({
                    filters: {
                        dimensions: expression,
                        metrics: null,
                        tableCalculations: null,
                    },
                }),
            );

            expect(error).toMatchObject({
                code: 'FILTER_EXPRESSION_MIXED_CONNECTORS',
                source: { category: 'dimensions' },
                problem: 'This expression mixes AND and OR connectors.',
                guidance:
                    'Use only one connector throughout: `fieldId operator=value AND fieldId2 operator=value2 AND ...`, or `fieldId operator=value OR fieldId2 operator=value2 OR ...`. The ellipsis represents more rules, not literal syntax.',
                example,
            });
            expectParseableExample(error.example);
            await expectResolved(
                expressionArgs({
                    filters: {
                        dimensions: error.example,
                        metrics: null,
                        tableCalculations: null,
                    },
                }),
            );
        },
    );

    it('uses connector syntax guidance when normalization cannot preserve the rules', async () => {
        const error = await expectResolutionError(
            expressionArgs({
                filters: {
                    dimensions:
                        'unknown_dimension equals=Acme AND orders_product_category equals=Hardware OR orders_is_active equals=true',
                    metrics: null,
                    tableCalculations: null,
                },
            }),
        );

        expect(error).toMatchObject({
            code: 'FILTER_EXPRESSION_MIXED_CONNECTORS',
            guidance:
                'Use only one connector throughout: `fieldId operator=value AND fieldId2 operator=value2 AND ...`, or `fieldId operator=value OR fieldId2 operator=value2 OR ...`. The ellipsis represents more rules, not literal syntax.',
            example: 'orders_amount equals=100',
        });
        expectParseableExample(error.example);
    });

    it('uses AND-only syntax guidance for mixed custom metric connectors', async () => {
        const error = await expectResolutionError(
            expressionArgs({
                customMetrics: [
                    {
                        ...aggregationCustomMetric,
                        filters:
                            'orders_customer_name equals=Acme OR orders_product_category equals=Hardware AND orders_is_active equals=true',
                    },
                ],
            }),
        );

        expect(error).toMatchObject({
            code: 'FILTER_EXPRESSION_MIXED_CONNECTORS',
            source: { kind: 'customMetricFilter' },
            guidance:
                'Use only `AND` throughout: `fieldId operator=value AND fieldId2 operator=value2 AND ...`. The ellipsis represents more rules, not literal syntax.',
            example: 'orders_amount equals=100',
        });
        expectParseableExample(error.example);
    });

    it.each([
        {
            dimensionName: 'customer_name',
            example: 'orders_customer_name equals="example value"',
        },
        {
            dimensionName: 'amount',
            example: 'orders_amount equals=100',
        },
        {
            dimensionName: 'is_active',
            example: 'orders_is_active equals=true',
        },
        {
            dimensionName: 'order_date',
            example: 'orders_order_date equals=2025-01-01',
        },
    ] as const)(
        'uses a scoped, type-valid $dimensionName fallback example',
        async ({ dimensionName, example }) => {
            const explore = exploreWithOnlyDimension(dimensionName);
            const error = await expectResolutionError(
                expressionArgs({
                    filters: {
                        dimensions: '???',
                        metrics: null,
                        tableCalculations: null,
                    },
                }),
                () => explore,
            );

            expect(error).toMatchObject({
                code: 'FILTER_EXPRESSION_SYNTAX',
                problem: 'The expression is malformed near line 1, column 1.',
                guidance:
                    'Use field operator=value rules joined by only AND or only OR; quote values that contain punctuation.',
                example,
            });
            expectParseableExample(error.example);
            await expectResolved(
                expressionArgs({
                    filters: {
                        dimensions: error.example,
                        metrics: null,
                        tableCalculations: null,
                    },
                }),
                () => explore,
            );
        },
    );

    it('uses a parseable neutral fallback when the category has no scoped field', async () => {
        const error = await expectResolutionError(
            expressionArgs({
                filters: {
                    dimensions: null,
                    metrics: null,
                    tableCalculations: '???',
                },
            }),
        );

        expect(error).toMatchObject({
            code: 'FILTER_EXPRESSION_SYNTAX',
            problem: 'The expression is malformed near line 1, column 1.',
            guidance:
                'Use field operator=value rules joined by only AND or only OR; quote values that contain punctuation.',
            example: '`field ID` equals="example value"',
        });
        if (error.code !== 'FILTER_EXPRESSION_SYNTAX') {
            throw new Error('Expected a syntax resolution error');
        }
        expect(error.parserMessage).toContain('Expected');
        const formatted = formatFilterExpressionError(error);
        expect(formatted).not.toContain(error.parserMessage);
        expect(formatted).not.toContain('[A-Za-z0-9_.\\-]');
        expectParseableExample(error.example);
    });

    it('reports unknown fields with typed suggestions and a stable located message', async () => {
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
            suggestedFields: [
                {
                    fieldId: 'orders_customer_name',
                    category: 'dimensions',
                    filterType: FilterType.STRING,
                },
            ],
            span: {
                start: { offset: 0, line: 1, column: 1 },
                end: { offset: 19, line: 1, column: 20 },
            },
            example: 'orders_customer_name equals=Acme',
        });
        expect(formatFilterExpressionError(error)).toMatchInlineSnapshot(`
          "[FILTER_EXPRESSION_UNKNOWN_FIELD]
          Invalid dimension filter expression for field "orders_customer_nam".

          Location: line 1, column 1
          Problem: The field does not exist in explore "test_explore". Did you mean: orders_customer_name (dimension, string)?
          How to fix: Replace it with an existing dimension field ID, or use field discovery to find the field.
          Example: orders_customer_name equals=Acme"
        `);
    });

    it.each([
        {
            label: 'metric',
            args: expressionArgs({
                filters: {
                    dimensions: null,
                    metrics: 'orders_gross_revenue greaterThan=10',
                    tableCalculations: null,
                },
            }),
            example: 'orders_total_revenue greaterThan=10',
        },
        {
            label: 'date dimension',
            args: expressionArgs({
                filters: {
                    dimensions:
                        'orders_order_dat inThePast=30{completed:false,unit:days}',
                    metrics: null,
                    tableCalculations: null,
                },
            }),
            example:
                'orders_order_date inThePast=30{completed:false,unit:days}',
        },
        {
            label: 'table calculation',
            args: expressionArgs({
                tableCalculations: [numericFormula],
                filters: {
                    dimensions: null,
                    metrics: null,
                    tableCalculations: 'margin_percent lessThan=0.2',
                },
            }),
            example: 'profit_margin lessThan=0.2',
        },
        {
            label: 'custom metric filter',
            args: expressionArgs({
                customMetrics: [
                    {
                        ...aggregationCustomMetric,
                        name: 'enterprise_revenue',
                        filters: 'orders_customer_segment equals=enterprise',
                    },
                ],
            }),
            example: 'orders_customer_name equals=enterprise',
        },
    ])(
        'changes only the unknown $label field ID in suggested examples',
        async ({ args, example }) => {
            const error = await expectResolutionError(args);

            expect(error).toMatchObject({
                code: 'FILTER_EXPRESSION_UNKNOWN_FIELD',
                reason: 'notFound',
                example,
            });
        },
    );

    it('preserves the surrounding expression when replacing a suggested field ID', async () => {
        const error = await expectResolutionError(
            expressionArgs({
                filters: {
                    dimensions:
                        'orders_customer_nam equals="Acme, Inc." AND orders_product_category equals=Hardware',
                    metrics: null,
                    tableCalculations: null,
                },
            }),
        );

        expect(error).toMatchObject({
            code: 'FILTER_EXPRESSION_UNKNOWN_FIELD',
            example:
                'orders_customer_name equals="Acme, Inc." AND orders_product_category equals=Hardware',
        });
    });
    it.each([
        {
            category: 'dimensions',
            expression: 'orders_customer_segment startsWith=Acme',
            expectedFieldId: 'orders_customer_name',
            expectedCategory: 'dimensions',
            expectedFilterType: FilterType.STRING,
            expectedExample: 'orders_customer_name startsWith=Acme',
        },
        {
            category: 'metrics',
            expression: 'gross_revenue greaterThan=100',
            expectedFieldId: 'orders_total_revenue',
            expectedCategory: 'metrics',
            expectedFilterType: FilterType.NUMBER,
            expectedExample: 'orders_total_revenue greaterThan=100',
        },
        {
            category: 'tableCalculations',
            expression: 'margin_percent lessThan=0.2',
            expectedFieldId: 'profit_margin',
            expectedCategory: 'tableCalculations',
            expectedFilterType: FilterType.NUMBER,
            expectedExample: 'profit_margin lessThan=0.2',
        },
    ] as const)(
        'keeps $category suggestions in their category',
        async ({
            category,
            expression,
            expectedFieldId,
            expectedCategory,
            expectedFilterType,
            expectedExample,
        }) => {
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
                code: 'FILTER_EXPRESSION_UNKNOWN_FIELD',
                suggestions: [expectedFieldId],
                suggestedFields: [
                    {
                        fieldId: expectedFieldId,
                        category: expectedCategory,
                        filterType: expectedFilterType,
                    },
                ],
                example: expectedExample,
            });
            const categoryLabel =
                expectedCategory === 'tableCalculations'
                    ? 'table calculation'
                    : expectedCategory.slice(0, -1);
            expect(formatFilterExpressionError(error)).toContain(
                `Did you mean: ${expectedFieldId} (${categoryLabel}, ${expectedFilterType})?`,
            );
        },
    );

    it.each([
        {
            operatorScope: 'date-only',
            expression:
                'orders_customer_nam inThePast=30{completed:false,unit:days}',
            expectedFieldId: 'orders_order_date',
            expectedFilterType: FilterType.DATE,
        },
        {
            operatorScope: 'string-only',
            expression: 'orders_order_dat startsWith=2025',
            expectedFieldId: 'orders_customer_name',
            expectedFilterType: FilterType.STRING,
        },
    ] as const)(
        'derives $operatorScope suggestion types from operator definitions',
        async ({ expression, expectedFieldId, expectedFilterType }) => {
            const error = await expectResolutionError(
                expressionArgs({
                    filters: {
                        dimensions: expression,
                        metrics: null,
                        tableCalculations: null,
                    },
                }),
            );

            expect(error).toMatchObject({
                code: 'FILTER_EXPRESSION_UNKNOWN_FIELD',
                suggestions: [expectedFieldId],
                suggestedFields: [
                    {
                        fieldId: expectedFieldId,
                        category: 'dimensions',
                        filterType: expectedFilterType,
                    },
                ],
            });
        },
    );

    it('preserves the full expression when a field replacement is valid', async () => {
        const expression = String.raw`orders_customer_name equals="Acme, Inc. \"HQ\""   AND
orders_order_dat inThePast=30{completed:false,unit:days} AND orders_product_category notEquals='A\\B, {x}=y'`;
        const expectedExample = expression.replace(
            'orders_order_dat',
            'orders_order_date',
        );
        const error = await expectResolutionError(
            expressionArgs({
                filters: {
                    dimensions: expression,
                    metrics: null,
                    tableCalculations: null,
                },
            }),
        );

        expect(error).toMatchObject({
            code: 'FILTER_EXPRESSION_UNKNOWN_FIELD',
            suggestions: ['orders_order_date'],
            example: expectedExample,
        });
        expect(error.example).not.toContain('example value');
        if (error.example === null) {
            throw new Error('Expected a semantically valid repair example');
        }

        const data = await expectResolved(
            expressionArgs({
                filters: {
                    dimensions: error.example,
                    metrics: null,
                    tableCalculations: null,
                },
            }),
        );
        expect(
            data.persistedArgs.queryConfig.filters?.dimensions,
        ).toMatchObject([
            { values: ['Acme, Inc. "HQ"'] },
            {
                fieldId: 'orders_order_date',
                values: [30],
                settings: { completed: false, unitOfTime: 'days' },
            },
            { values: ['A\\B, {x}=y'] },
        ]);
    });

    it('does not recursively repair a second unknown field', async () => {
        const error = await expectResolutionError(
            expressionArgs({
                filters: {
                    dimensions:
                        'orders_customer_nam equals=Acme AND orders_product_categor equals=Hardware',
                    metrics: null,
                    tableCalculations: null,
                },
            }),
        );

        expect(error).toMatchObject({
            code: 'FILTER_EXPRESSION_UNKNOWN_FIELD',
            fieldId: 'orders_customer_nam',
            suggestions: ['orders_customer_name'],
            example: null,
        });
    });

    it('keeps a typed suggestion but omits an invalid scalar repair', async () => {
        const error = await expectResolutionError(
            expressionArgs({
                filters: {
                    dimensions: 'orders_amount_typo equals=nonnumeric',
                    metrics: null,
                    tableCalculations: null,
                },
            }),
        );

        expect(error).toMatchObject({
            code: 'FILTER_EXPRESSION_UNKNOWN_FIELD',
            suggestions: ['orders_amount'],
            suggestedFields: [
                {
                    fieldId: 'orders_amount',
                    category: 'dimensions',
                    filterType: FilterType.NUMBER,
                },
            ],
            example: null,
        });
        const formatted = formatFilterExpressionError(error);
        expect(formatted).toContain(
            'Did you mean: orders_amount (dimension, number)?',
        );
        expect(formatted).not.toContain('Example:');
    });

    it('excludes metrics from custom metric filter suggestions', async () => {
        const error = await expectResolutionError(
            expressionArgs({
                customMetrics: [
                    {
                        ...aggregationCustomMetric,
                        filters: 'orders_total_revenue_typo greaterThan=10',
                    },
                ],
            }),
        );

        expect(error).toMatchObject({
            code: 'FILTER_EXPRESSION_UNKNOWN_FIELD',
            suggestions: ['orders_amount'],
            suggestedFields: [
                {
                    fieldId: 'orders_amount',
                    category: 'dimensions',
                    filterType: FilterType.NUMBER,
                },
            ],
            guidance: expect.stringContaining('dimension field ID'),
            example: 'orders_amount greaterThan=10',
        });
        if (error.code !== 'FILTER_EXPRESSION_UNKNOWN_FIELD') {
            throw new Error('Expected an unknown field error');
        }
        expect(error.suggestions).not.toContain('orders_total_revenue');
        expect(formatFilterExpressionError(error)).not.toContain(
            'explore field ID',
        );
    });

    it.each([
        {
            fieldKind: 'metric',
            expression: 'orders_total_revenue greaterThan=100',
            fieldCategory: 'metrics',
        },
        {
            fieldKind: 'table calculation',
            expression: 'profit_margin greaterThan=0.2',
            fieldCategory: 'tableCalculations',
        },
    ] as const)(
        'rejects an exact $fieldKind in a custom metric filter at resolution',
        async ({ expression, fieldCategory }) => {
            const error = await expectResolutionError(
                expressionArgs({
                    customMetrics: [
                        { ...aggregationCustomMetric, filters: expression },
                    ],
                    tableCalculations: [numericFormula],
                }),
            );

            expect(error).toMatchObject({
                code: 'FILTER_EXPRESSION_CUSTOM_METRIC_WRONG_CATEGORY',
                source: {
                    kind: 'customMetricFilter',
                    customMetricName: 'completed_revenue',
                },
                allowedCategory: 'dimensions',
                fieldCategory,
                span: {
                    start: { offset: 0, line: 1, column: 1 },
                },
                example: null,
            });
            const formatted = formatFilterExpressionError(error);
            expect(formatted).toContain('only accept dimension fields');
            expect(formatted).not.toContain('Example:');
            expect(formatted).not.toContain('parserMessage');
        },
    );

    it.each([
        ['dimensions', 'orders_total_revenue greaterThan=10', 'metrics'],
        ['metrics', 'orders_customer_name equals=Acme', 'dimensions'],
        ['metrics', 'profit_margin greaterThan=0.2', 'tableCalculations'],
        [
            'metrics',
            'orders_order_date inThePast=30{completed:false,unit:days}',
            'dimensions',
        ],
    ] as const)(
        'rejects a field in the wrong %s category without changing its rule',
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
                example: expression,
            });
            expect(error.guidance).toBe(
                `Move this rule from the ${filterCategoryLabels[category]} filters to the ${filterCategoryLabels[expectedCategory]} filters.`,
            );
            expect(formatFilterExpressionError(error)).not.toContain(
                'queryConfig',
            );
        },
    );

    it('suggests moving only the misplaced rule from a multi-rule expression', async () => {
        const error = await expectResolutionError(
            expressionArgs({
                filters: {
                    dimensions:
                        'orders_customer_name equals="Acme, Inc." AND orders_total_revenue greaterThan=10',
                    metrics: null,
                    tableCalculations: null,
                },
            }),
        );

        expect(error).toMatchObject({
            code: 'FILTER_EXPRESSION_WRONG_CATEGORY',
            example: 'orders_total_revenue greaterThan=10',
        });
    });

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
            suggestedFields: [],
            example: null,
        });
        expect(formatFilterExpressionError(error)).not.toContain('Example:');
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

    it('rejects OR in custom metric filters without constraining query connectors', async () => {
        const error = await expectResolutionError(
            expressionArgs({
                customMetrics: [
                    {
                        ...aggregationCustomMetric,
                        filters:
                            'orders_customer_name equals=Acme OR orders_product_category equals=Hardware OR orders_is_active equals=true',
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
            problem:
                'Aggregation custom metric filter rules are always combined with AND and cannot use OR.',
            guidance:
                'Custom metric filters support AND only. Keep only rules that should all apply together, or remove the filters.',
            example: null,
        });
        expect(formatFilterExpressionError(error)).not.toContain('\nExample:');

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

    it('does not invent a repair for custom metric OR values', async () => {
        const error = await expectResolutionError(
            expressionArgs({
                customMetrics: [
                    {
                        ...aggregationCustomMetric,
                        filters:
                            'orders_customer_name equals="A \\"quoted\\" value" OR orders_customer_name equals="C:\\\\tmp"',
                    },
                ],
            }),
        );

        expect(error).toMatchObject({
            code: 'FILTER_EXPRESSION_CUSTOM_METRIC_OR',
            example: null,
        });
        expect(formatFilterExpressionError(error)).not.toContain('\nExample:');
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
        [
            'orders_amount equals=Infinity',
            'Replace the value at the reported location with a decimal or scientific-notation finite number.',
        ],
        [
            'orders_is_active equals=True',
            'Replace the value at the reported location with the exact text true or false.',
        ],
    ] as const)(
        'points value guidance for %s at the reported location',
        async (expression, guidance) => {
            const error = await expectResolutionError(
                expressionArgs({
                    filters: {
                        dimensions: expression,
                        metrics: null,
                        tableCalculations: null,
                    },
                }),
            );

            expect(error).toMatchObject({
                code: 'FILTER_EXPRESSION_INVALID_VALUE',
                guidance,
            });
            expect(formatFilterExpressionError(error)).not.toContain(
                'highlighted',
            );
        },
    );

    it.each([
        {
            expression: 'orders_is_active equals=True',
            example: 'orders_is_active equals=true',
        },
        {
            expression: "orders_is_active equals='FALSE'",
            example: "orders_is_active equals='false'",
        },
        {
            expression:
                'orders_order_date inThePast=1{unit:days,completed:TRUE}',
            example: 'orders_order_date inThePast=1{unit:days,completed:true}',
        },
        {
            expression:
                'orders_customer_name equals=Acme AND orders_is_active equals=True',
            example: 'orders_is_active equals=true',
        },
    ])(
        'provides a lossless boolean repair for $expression',
        async ({ expression, example }) => {
            const error = await expectResolutionError(
                expressionArgs({
                    filters: {
                        dimensions: expression,
                        metrics: null,
                        tableCalculations: null,
                    },
                }),
            );

            expect(error).toMatchObject({
                code: 'FILTER_EXPRESSION_INVALID_VALUE',
                example,
            });
            expectParseableExample(error.example);
        },
    );

    it.each([
        {
            expression:
                'orders_order_date inThePast=1{unit:hours,completed:false}',
            example: 'orders_order_date inThePast=1{unit:days,completed:false}',
        },
        {
            expression:
                'orders_order_date inThePast=7{completed:true,unit:hours}',
            example: 'orders_order_date inThePast=7{completed:true,unit:days}',
        },
        {
            expression:
                "orders_order_date inThePast=2{unit:'hours',completed:false}",
            example:
                "orders_order_date inThePast=2{unit:'days',completed:false}",
        },
        {
            expression: 'orders_order_date inTheCurrent=hours',
            example: 'orders_order_date inTheCurrent=days',
        },
    ])(
        'changes only an unsupported date unit in $expression',
        async ({ expression, example }) => {
            const error = await expectResolutionError(
                expressionArgs({
                    filters: {
                        dimensions: expression,
                        metrics: null,
                        tableCalculations: null,
                    },
                }),
            );

            expect(error).toMatchObject({
                code: 'FILTER_EXPRESSION_INVALID_VALUE',
                example,
            });
            await expectResolved(
                expressionArgs({
                    filters: {
                        dimensions: example,
                        metrics: null,
                        tableCalculations: null,
                    },
                }),
            );
        },
    );

    it.each([
        'orders_amount equals=Infinity',
        'orders_order_date equals=January-1-2025',
        'orders_product_category greaterThan=1',
    ])('omits an unsafe repair example for %s', async (expression) => {
        const error = await expectResolutionError(
            expressionArgs({
                filters: {
                    dimensions: expression,
                    metrics: null,
                    tableCalculations: null,
                },
            }),
        );

        expect(error).toMatchObject({
            code: 'FILTER_EXPRESSION_INVALID_VALUE',
            example: null,
        });
        expect(formatFilterExpressionError(error)).not.toContain('\nExample:');
    });

    it.each([
        {
            filterType: FilterType.STRING,
            expression: 'orders_product_category greaterThan=1',
            guidance:
                'Use a supported string operator (isNull, notNull, equals, notEquals, startsWith, endsWith, include, doesNotInclude), or move the rule to a field of a matching type.',
        },
        {
            filterType: FilterType.NUMBER,
            expression: 'orders_amount startsWith=1',
            guidance:
                'Use a supported number operator (isNull, notNull, equals, notEquals, lessThan, lessThanOrEqual, greaterThan, greaterThanOrEqual, inBetween, notInBetween), or move the rule to a field of a matching type.',
        },
        {
            filterType: FilterType.DATE,
            expression: 'orders_order_date notInBetween=2025-01-01,2025-02-01',
            guidance:
                'Use a supported date operator (isNull, notNull, equals, notEquals, lessThan, lessThanOrEqual, greaterThan, greaterThanOrEqual, inThePast, notInThePast, inTheNext, inTheCurrent, notInTheCurrent, inBetween), or move the rule to a field of a matching type.',
        },
        {
            filterType: FilterType.BOOLEAN,
            expression: 'orders_is_active startsWith=t',
            guidance:
                'Use a supported boolean operator (isNull, notNull, equals, notEquals), or move the rule to a field of a matching type.',
        },
    ] as const)(
        'lists the supported $filterType operators when the operator is unavailable',
        async ({ expression, guidance }) => {
            const error = await expectResolutionError(
                expressionArgs({
                    filters: {
                        dimensions: expression,
                        metrics: null,
                        tableCalculations: null,
                    },
                }),
            );

            expect(error).toMatchObject({
                code: 'FILTER_EXPRESSION_INVALID_VALUE',
                guidance,
            });
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

    it('repairs positional relative-date settings without changing their values', async () => {
        const expression = 'orders_order_date inThePast=7,weeks,true';
        const example =
            'orders_order_date inThePast=7{unit:weeks,completed:true}';
        const error = await expectResolutionError(
            expressionArgs({
                filters: {
                    dimensions: expression,
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
            guidance:
                'Keep the period count as the only value and move unit and completed into named settings.',
            example,
        });
        await expectResolved(
            expressionArgs({
                filters: {
                    dimensions: example,
                    metrics: null,
                    tableCalculations: null,
                },
            }),
        );
    });

    it.each([
        {
            expression: 'orders_amount greaterThan=17,29',
            operator: FilterOperator.GREATER_THAN,
            expected: 1,
            actual: 2,
            guidance:
                'Remove 1 value, leaving exactly 1 value after the equals sign.',
        },
        {
            expression: 'orders_amount inBetween=41',
            operator: FilterOperator.IN_BETWEEN,
            expected: 2,
            actual: 1,
            guidance:
                'Add 1 value, supplying exactly 2 values after the equals sign.',
        },
        {
            expression: 'orders_amount inBetween=3,8,13',
            operator: FilterOperator.IN_BETWEEN,
            expected: 2,
            actual: 3,
            guidance:
                'Remove 1 value, leaving exactly 2 values after the equals sign.',
        },
        {
            expression: 'orders_order_date inTheCurrent=quarters,years',
            operator: FilterOperator.IN_THE_CURRENT,
            expected: 1,
            actual: 2,
            guidance:
                'Remove 1 value, leaving exactly 1 value after the equals sign.',
        },
    ])(
        'reports wrong arity for $operator separately from invalid values',
        async ({ expression, operator, expected, actual, guidance }) => {
            const error = await expectResolutionError(
                expressionArgs({
                    filters: {
                        dimensions: expression,
                        metrics: null,
                        tableCalculations: null,
                    },
                }),
            );

            expect(error).toMatchObject({
                code: 'FILTER_EXPRESSION_WRONG_ARITY',
                operator,
                expected,
                actual,
                guidance,
                example: null,
            });
            expect(formatFilterExpressionError(error)).not.toContain(
                '\nExample:',
            );
        },
    );

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
            problem:
                'Only numeric table calculations can be filtered in the current AI query contract.',
            guidance:
                'Use a numeric table calculation, or remove this table-calculation filter.',
            example: null,
        });
        const formatted = formatFilterExpressionError(error);
        expect(formatted).toContain(
            'Only numeric table calculations can be filtered',
        );
        expect(formatted).not.toContain('\nExample:');
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
