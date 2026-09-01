import { expectTypeOf } from 'vitest';
import { DimensionType, MetricType } from '../../../../types/field';
import { FilterOperator, FilterType } from '../../../../types/filter';
import {
    aggregationCustomMetricSchema,
    customMetricsSchema,
} from '../customMetrics';
import {
    formulaTableCalcsSchema,
    tableCalcsSchema,
} from '../tableCalcs/tableCalcs';
import {
    chartConfigSchema,
    mergeConfigSchema,
    mergeSourceQueryConfigSchema,
    queryConfigBaseSchema,
    toolRunQueryArgsSchemaV4,
} from '../tools/toolRunQueryArgs';
import {
    aggregationCustomMetricExpressionSchema,
    customMetricsExpressionSchema,
    FILTER_EXPRESSION_AND_ONLY_GRAMMAR_DESCRIPTION,
    FILTER_EXPRESSION_GRAMMAR_DESCRIPTION,
    filterExpressionInputSchema,
    filterExpressionsSchema,
    mergeConfigExpressionSchema,
    mergeSourceQueryConfigExpressionSchema,
    queryConfigExpressionSchemaV2,
    queryConfigExpressionSchemaV2FormulaOnly,
    queryConfigExpressionSchemaV4,
    toolRunQueryExpressionArgsSchema,
    toolRunQueryExpressionArgsSchemaV2,
    toolRunQueryExpressionArgsSchemaV2FormulaOnly,
    toolRunQueryExpressionArgsSchemaV2Mcp,
    toolRunQueryExpressionArgsSchemaV2RejectingMerge,
    type ToolRunQueryExpressionArgs,
    type ToolRunQueryExpressionArgsNoMerge,
    type ToolRunQueryExpressionArgsPersistedV2,
    type ToolRunQueryExpressionArgsV2,
    type ToolRunQueryExpressionRuntimeArgs,
} from './expressionSchemas';
import { filterExpressionOperators } from './operators';
import {
    FILTER_EXPRESSION_MAX_LENGTH,
    FILTER_EXPRESSION_MAX_LITERAL_LENGTH,
    FILTER_EXPRESSION_MAX_RULES,
    FILTER_EXPRESSION_MAX_VALUES_PER_RULE,
} from './parse';

const baseQueryConfig = {
    exploreName: 'orders',
    dimensions: ['orders_order_date_month'],
    metrics: ['orders_revenue'],
    sorts: [],
    limit: 500,
    parameters: null,
    customMetrics: null,
    tableCalculations: null,
    filters: null,
};

const baseArgs = {
    title: 'Revenue by month',
    description: 'Monthly revenue trend',
    queryConfig: baseQueryConfig,
    chartConfig: null,
};

const formulaTableCalculation = {
    type: 'formula' as const,
    name: 'profit_margin',
    displayName: 'Profit margin',
    formula: 'orders_profit / orders_revenue',
    format: 'percent' as const,
    resultType: 'number' as const,
};

const legacyTableCalculation = {
    type: 'running_total' as const,
    name: 'running_revenue',
    displayName: 'Running revenue',
    fieldId: 'orders_revenue',
};

const mergeConfig = {
    primarySourceId: 'orders',
    additionalSources: [
        {
            id: 'targets',
            queryConfig: {
                exploreName: 'targets',
                dimensions: ['targets_month'],
                metrics: ['targets_target'],
                sorts: [],
                customMetrics: null,
                filters: {
                    dimensions: 'targets_month equals=2025-01-01',
                    metrics: null,
                    tableCalculations: null,
                },
            },
        },
    ],
    joinKey: [
        {
            name: 'month',
            fields: [
                {
                    sourceId: 'orders',
                    fieldId: 'orders_order_date_month',
                },
                { sourceId: 'targets', fieldId: 'targets_month' },
            ],
        },
    ],
    joinType: 'full' as const,
};

const legacyFilters = {
    type: 'and' as const,
    dimensions: [
        {
            fieldId: 'orders_status',
            fieldType: DimensionType.STRING,
            fieldFilterType: FilterType.STRING,
            operator: FilterOperator.EQUALS,
            values: ['completed'],
        },
    ],
    metrics: null,
    tableCalculations: null,
};

describe('filter expression input schemas', () => {
    it('accepts bounded nonempty strings without changing their contents', () => {
        expect(filterExpressionInputSchema.parse(' field equals=value ')).toBe(
            ' field equals=value ',
        );
        expect(filterExpressionInputSchema.safeParse('').success).toBe(false);
        expect(filterExpressionInputSchema.safeParse('   ').success).toBe(true);
        expect(
            filterExpressionInputSchema.safeParse(
                'x'.repeat(FILTER_EXPRESSION_MAX_LENGTH + 1),
            ).success,
        ).toBe(false);
    });

    it('documents every exposed operator from the canonical map', () => {
        filterExpressionOperators.forEach((operator) => {
            expect(FILTER_EXPRESSION_GRAMMAR_DESCRIPTION).toContain(operator);
            expect(FILTER_EXPRESSION_AND_ONLY_GRAMMAR_DESCRIPTION).toContain(
                operator,
            );
        });
    });

    it('renders the selected connector policy', () => {
        expect(FILTER_EXPRESSION_GRAMMAR_DESCRIPTION).toContain(
            'Join flat rules with AND or OR',
        );
        expect(FILTER_EXPRESSION_AND_ONLY_GRAMMAR_DESCRIPTION).toContain(
            'Join flat rules with AND only. OR is not supported by this tool.',
        );
        expect(FILTER_EXPRESSION_AND_ONLY_GRAMMAR_DESCRIPTION).not.toContain(
            'Join flat rules with AND or OR',
        );
    });

    it('documents quoting syntax characters without punctuation escapes', () => {
        expect(FILTER_EXPRESSION_GRAMMAR_DESCRIPTION).toContain('equals signs');
        expect(FILTER_EXPRESSION_GRAMMAR_DESCRIPTION).toContain(
            'commas and braces are literal; do not backslash-escape them',
        );
    });

    it('keeps live runtime inputs separate from persisted V2 compatibility', () => {
        expectTypeOf<ToolRunQueryExpressionArgs>().toExtend<ToolRunQueryExpressionRuntimeArgs>();
        expectTypeOf<ToolRunQueryExpressionArgsNoMerge>().toExtend<ToolRunQueryExpressionRuntimeArgs>();
        expectTypeOf<ToolRunQueryExpressionArgsPersistedV2>().not.toExtend<ToolRunQueryExpressionRuntimeArgs>();
        expectTypeOf<ToolRunQueryExpressionArgsV2>().not.toExtend<ToolRunQueryExpressionRuntimeArgs>();
        expectTypeOf<ToolRunQueryExpressionArgs>().not.toExtend<ToolRunQueryExpressionArgsNoMerge>();
        expectTypeOf<ToolRunQueryExpressionArgsNoMerge>().not.toExtend<ToolRunQueryExpressionArgs>();
    });

    it('documents independent category connectors and their implicit AND', () => {
        expect(filterExpressionsSchema.description).toContain(
            'Each category chooses AND or OR independently',
        );
        expect(filterExpressionsSchema.description).toContain(
            '(D1 AND D2) AND (M1 OR M2)',
        );
    });

    it('documents parser safety limits', () => {
        expect(FILTER_EXPRESSION_GRAMMAR_DESCRIPTION).toContain(
            `${FILTER_EXPRESSION_MAX_RULES} rules per expression`,
        );
        expect(FILTER_EXPRESSION_GRAMMAR_DESCRIPTION).toContain(
            `${FILTER_EXPRESSION_MAX_VALUES_PER_RULE} values (including settings) per rule`,
        );
        expect(FILTER_EXPRESSION_GRAMMAR_DESCRIPTION).toContain(
            `${FILTER_EXPRESSION_MAX_LITERAL_LENGTH} characters per literal`,
        );
        expect(FILTER_EXPRESSION_GRAMMAR_DESCRIPTION).toContain(
            `${FILTER_EXPRESSION_MAX_LENGTH} characters per expression`,
        );
    });

    it('requires a strict, separately nullable category shape', () => {
        expect(
            filterExpressionsSchema.safeParse({
                dimensions: 'orders_status equals=completed',
                metrics: null,
                tableCalculations: null,
            }).success,
        ).toBe(true);
        expect(
            filterExpressionsSchema.safeParse({
                dimensions: null,
                metrics: null,
            }).success,
        ).toBe(false);
        expect(
            filterExpressionsSchema.safeParse({
                dimensions: null,
                metrics: null,
                tableCalculations: null,
                unknown: 'value',
            }).success,
        ).toBe(false);
    });
});

describe('expression custom metric schemas', () => {
    const aggregationMetric = {
        kind: 'aggregation' as const,
        name: 'completed_revenue',
        label: 'Completed revenue',
        description: 'Revenue from completed orders',
        baseDimensionName: 'orders_revenue',
        table: 'orders',
        type: MetricType.SUM,
        filters: 'orders_status equals=completed',
    };

    it('changes only aggregation filters to an expression string', () => {
        expect(
            customMetricsExpressionSchema.safeParse([aggregationMetric])
                .success,
        ).toBe(true);
        expect(
            customMetricsExpressionSchema.safeParse([
                { ...aggregationMetric, filters: legacyFilters.dimensions },
            ]).success,
        ).toBe(false);
        expect(aggregationCustomMetricExpressionSchema.shape.name).toBe(
            aggregationCustomMetricSchema.shape.name,
        );
    });

    it('keeps period comparison metrics unchanged', () => {
        expect(
            customMetricsExpressionSchema.safeParse([
                {
                    kind: 'periodComparison',
                    baseMetricId: 'orders_revenue',
                    timeDimensionId: 'orders_order_date_month',
                    granularity: 'MONTH',
                    periodOffset: 12,
                },
            ]).success,
        ).toBe(true);
    });

    it('reuses the existing custom metrics description', () => {
        expect(customMetricsSchema.description).toBeDefined();
        expect(customMetricsExpressionSchema.description).toBe(
            customMetricsSchema.description,
        );
    });
});

describe('expression run query schemas', () => {
    it('uses formula-only table calculations for the merge-enabled agent contract', () => {
        expect(
            toolRunQueryExpressionArgsSchema.safeParse({
                ...baseArgs,
                queryConfig: {
                    ...baseQueryConfig,
                    tableCalculations: [formulaTableCalculation],
                },
                mergeConfig: null,
            }).success,
        ).toBe(true);
        expect(
            toolRunQueryExpressionArgsSchema.safeParse({
                ...baseArgs,
                queryConfig: {
                    ...baseQueryConfig,
                    tableCalculations: [legacyTableCalculation],
                },
                mergeConfig: null,
            }).success,
        ).toBe(false);
        expect(queryConfigExpressionSchemaV4.shape.tableCalculations).toBe(
            formulaTableCalcsSchema,
        );
    });

    it('keeps persisted V2 wide while advertised merge-less contracts are formula-only', () => {
        const legacyArgs = {
            ...baseArgs,
            queryConfig: {
                ...baseQueryConfig,
                tableCalculations: [legacyTableCalculation],
            },
        };
        const formulaArgs = {
            ...baseArgs,
            queryConfig: {
                ...baseQueryConfig,
                tableCalculations: [formulaTableCalculation],
            },
        };

        expect(
            toolRunQueryExpressionArgsSchemaV2.safeParse(legacyArgs).success,
        ).toBe(true);
        expect(
            toolRunQueryExpressionArgsSchemaV2FormulaOnly.safeParse(legacyArgs)
                .success,
        ).toBe(false);
        expect(
            toolRunQueryExpressionArgsSchemaV2Mcp.safeParse(legacyArgs).success,
        ).toBe(false);
        expect(
            toolRunQueryExpressionArgsSchemaV2RejectingMerge.safeParse(
                legacyArgs,
            ).success,
        ).toBe(false);

        expect(
            toolRunQueryExpressionArgsSchemaV2FormulaOnly.safeParse(formulaArgs)
                .success,
        ).toBe(true);
        expect(
            toolRunQueryExpressionArgsSchemaV2Mcp.safeParse(formulaArgs)
                .success,
        ).toBe(true);
        expect(
            toolRunQueryExpressionArgsSchemaV2RejectingMerge.safeParse(
                formulaArgs,
            ).success,
        ).toBe(true);
        expect(queryConfigExpressionSchemaV2.shape.tableCalculations).toBe(
            tableCalcsSchema,
        );
        expect(
            queryConfigExpressionSchemaV2FormulaOnly.shape.tableCalculations,
        ).toBe(formulaTableCalcsSchema);
    });

    it('keeps custom chart types agent-only in advertised V2 contracts', () => {
        const args = {
            ...baseArgs,
            chartConfig: {
                customChartTypeSlug: 'cohort-waterfall',
                fieldMapping: {
                    x: 'orders_order_date_month',
                    y: 'orders_revenue',
                },
                options: null,
            },
        };

        expect(
            toolRunQueryExpressionArgsSchemaV2FormulaOnly.safeParse(args)
                .success,
        ).toBe(true);
        expect(
            toolRunQueryExpressionArgsSchemaV2Mcp.safeParse(args).success,
        ).toBe(false);
    });

    it('accepts expression merge sources and rejects them in the merge-disabled schema', () => {
        const args = { ...baseArgs, mergeConfig };
        expect(toolRunQueryExpressionArgsSchema.safeParse(args).success).toBe(
            true,
        );
        expect(
            toolRunQueryExpressionArgsSchemaV2RejectingMerge.safeParse(args)
                .success,
        ).toBe(false);
    });

    it('rejects legacy filter objects while legacy V4 remains unchanged', () => {
        const expressionArgsWithLegacyFilters = {
            ...baseArgs,
            queryConfig: { ...baseQueryConfig, filters: legacyFilters },
            mergeConfig: null,
        };
        expect(
            toolRunQueryExpressionArgsSchema.safeParse(
                expressionArgsWithLegacyFilters,
            ).success,
        ).toBe(false);
        expect(
            toolRunQueryArgsSchemaV4.safeParse(expressionArgsWithLegacyFilters)
                .success,
        ).toBe(true);

        const legacyArgsWithExpressionFilters = {
            ...baseArgs,
            queryConfig: {
                ...baseQueryConfig,
                filters: {
                    dimensions: 'orders_status equals=completed',
                    metrics: null,
                    tableCalculations: null,
                },
            },
            mergeConfig: null,
        };
        expect(
            toolRunQueryExpressionArgsSchema.safeParse(
                legacyArgsWithExpressionFilters,
            ).success,
        ).toBe(true);
        expect(
            toolRunQueryArgsSchemaV4.safeParse(legacyArgsWithExpressionFilters)
                .success,
        ).toBe(false);
    });

    it('reuses existing base fields and descriptions', () => {
        expect(queryConfigExpressionSchemaV2.shape.exploreName).toBe(
            queryConfigBaseSchema.shape.exploreName,
        );
        expect(toolRunQueryExpressionArgsSchema.shape.chartConfig).toBe(
            chartConfigSchema,
        );
        expect(mergeSourceQueryConfigSchema.description).toBeDefined();
        expect(mergeSourceQueryConfigExpressionSchema.description).toBe(
            mergeSourceQueryConfigSchema.description,
        );
        expect(mergeConfigSchema.description).toBeDefined();
        expect(mergeConfigExpressionSchema.description).toBe(
            mergeConfigSchema.description,
        );
        expect(
            mergeConfigSchema.unwrap().shape.additionalSources.description,
        ).toBeDefined();
        expect(
            mergeConfigExpressionSchema.unwrap().shape.additionalSources
                .description,
        ).toBe(mergeConfigSchema.unwrap().shape.additionalSources.description);
    });
});
