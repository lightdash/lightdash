import { DimensionType } from '../../../../types/field';
import {
    FilterOperator,
    FilterType,
    type Filters,
} from '../../../../types/filter';
import { getTotalFilterRules } from '../../../../utils/filters';
import {
    isCustomChartTypeSlugChartConfig,
    isRunQueryArgsV1,
    migrateRunQueryArgsV1ToV2,
    parsePersistedRunQueryArgs,
    toolRunQueryArgsSchema,
    toolRunQueryArgsSchemaTransformed,
    toolRunQueryArgsSchemaV1,
    toolRunQueryArgsSchemaV2,
    toolRunQueryArgsSchemaV2FormulaOnly,
    toolRunQueryArgsSchemaV2Mcp,
    toolRunQueryArgsSchemaV2RejectingMerge,
    toolRunQueryArgsSchemaV2Transformed,
    toolRunQueryArgsSchemaV3,
} from './toolRunQueryArgs';

const baseQueryConfig = {
    exploreName: 'orders',
    dimensions: ['orders_order_date_month'],
    metrics: ['orders_revenue'],
    sorts: [],
    limit: 500,
};

const baseArgs = {
    title: 'Revenue by month',
    description: 'Monthly revenue trend',
    chartConfig: null,
};

const buildStringFilters = (fieldId: string) => ({
    type: 'and' as const,
    dimensions: [
        {
            fieldId,
            fieldType: DimensionType.STRING,
            fieldFilterType: FilterType.STRING,
            operator: FilterOperator.EQUALS,
            values: ['completed'],
        },
    ],
    metrics: null,
    tableCalculations: null,
});

// V2: customMetrics / tableCalculations / filters nested in queryConfig
const buildV2Args = (queryConfigOverrides: Record<string, unknown> = {}) => ({
    ...baseArgs,
    queryConfig: {
        ...baseQueryConfig,
        customMetrics: null,
        tableCalculations: null,
        filters: null,
        ...queryConfigOverrides,
    },
});

// V1: customMetrics / tableCalculations / filters at the top level
const buildV1Args = (overrides: Record<string, unknown> = {}) => ({
    ...baseArgs,
    customMetrics: null,
    tableCalculations: null,
    filters: null,
    queryConfig: baseQueryConfig,
    ...overrides,
});

const buildV3MergeArgs = () => ({
    ...buildV2Args(),
    mergeConfig: {
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
                    filters: null,
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
        joinType: 'full',
    },
});

const getDimensionFilterFieldIds = (filters: Filters) =>
    getTotalFilterRules(filters).map((rule) => rule.target.fieldId);

describe('toolRunQueryArgsSchemaTransformed (V3)', () => {
    it('parses V2 args into the nested internal shape', () => {
        const parsed = toolRunQueryArgsSchemaTransformed.parse(buildV2Args());

        expect(parsed).toMatchObject({
            title: baseArgs.title,
            description: baseArgs.description,
            queryConfig: {
                ...baseQueryConfig,
                customMetrics: null,
                tableCalculations: null,
            },
            chartConfig: null,
        });
    });

    it('parses merge config while defaulting old V2 calls to no merge', () => {
        expect(
            toolRunQueryArgsSchemaTransformed.parse(buildV2Args()).mergeConfig,
        ).toBeNull();
        expect(
            toolRunQueryArgsSchemaTransformed.parse(buildV3MergeArgs())
                .mergeConfig?.primarySourceId,
        ).toBe('orders');
        expect(
            toolRunQueryArgsSchemaV3.safeParse(buildV3MergeArgs()).success,
        ).toBe(true);
    });

    it('rejects V1-shaped args (the tool only accepts V2)', () => {
        expect(
            toolRunQueryArgsSchemaTransformed.safeParse(buildV1Args()).success,
        ).toBe(false);
        expect(toolRunQueryArgsSchemaV2.safeParse(buildV1Args()).success).toBe(
            false,
        );
        expect(toolRunQueryArgsSchemaV1.safeParse(buildV1Args()).success).toBe(
            true,
        );
    });
});

describe('toolRunQueryArgsSchemaV2RejectingMerge', () => {
    it('accepts ordinary V2 payloads, including an explicit null mergeConfig', () => {
        expect(
            toolRunQueryArgsSchemaV2RejectingMerge.safeParse(buildV2Args())
                .success,
        ).toBe(true);
        expect(
            toolRunQueryArgsSchemaV2RejectingMerge.safeParse({
                ...buildV2Args(),
                mergeConfig: null,
            }).success,
        ).toBe(true);
    });

    it('rejects a merge-shaped payload instead of stripping mergeConfig', () => {
        const result =
            toolRunQueryArgsSchemaV2RejectingMerge.safeParse(
                buildV3MergeArgs(),
            );
        expect(result.success).toBe(false);
    });
});

describe('parsePersistedRunQueryArgs', () => {
    it('passes V2 artifacts through unchanged', () => {
        const parsed = parsePersistedRunQueryArgs(buildV2Args());
        expect(parsed?.queryConfig.exploreName).toBe('orders');
    });

    it('migrates V1 artifacts to the V2 internal shape', () => {
        const parsed = parsePersistedRunQueryArgs(buildV1Args());
        expect(parsed).toMatchObject({
            queryConfig: {
                ...baseQueryConfig,
                customMetrics: null,
                tableCalculations: null,
            },
        });
    });

    it('resolves filters nested in queryConfig on V1 artifacts (#17269)', () => {
        const parsed = parsePersistedRunQueryArgs(
            buildV1Args({
                queryConfig: {
                    ...baseQueryConfig,
                    filters: buildStringFilters('orders_status'),
                },
            }),
        );
        expect(getDimensionFilterFieldIds(parsed!.queryConfig.filters)).toEqual(
            ['orders_status'],
        );
    });

    it('prefers top-level filters when a V1 artifact has both', () => {
        const parsed = parsePersistedRunQueryArgs(
            buildV1Args({
                filters: buildStringFilters('orders_top_level'),
                queryConfig: {
                    ...baseQueryConfig,
                    filters: buildStringFilters('orders_nested'),
                },
            }),
        );
        expect(getDimensionFilterFieldIds(parsed!.queryConfig.filters)).toEqual(
            ['orders_top_level'],
        );
    });

    it('returns null for unparseable input', () => {
        expect(parsePersistedRunQueryArgs({ nonsense: true })).toBeNull();
    });

    it('fails closed instead of dropping an invalid merge config', () => {
        expect(
            parsePersistedRunQueryArgs({
                ...buildV2Args(),
                mergeConfig: { primarySourceId: 'orders' },
            }),
        ).toBeNull();
    });
});

describe('migrateRunQueryArgsV1ToV2', () => {
    it('moves top-level fields into queryConfig (top-level filters win)', () => {
        const v1 = toolRunQueryArgsSchemaV1.parse(
            buildV1Args({
                filters: buildStringFilters('orders_top_level'),
                queryConfig: {
                    ...baseQueryConfig,
                    filters: buildStringFilters('orders_nested'),
                },
            }),
        );

        const v2 = migrateRunQueryArgsV1ToV2(v1);

        expect(v2.queryConfig.customMetrics).toBe(v1.customMetrics);
        expect(v2.queryConfig.tableCalculations).toBe(v1.tableCalculations);
        expect(v2.queryConfig.filters?.dimensions?.[0].fieldId).toBe(
            'orders_top_level',
        );
        expect('filters' in v2).toBe(false);
        expect('customMetrics' in v2).toBe(false);
    });
});

const customChartTypeChartConfig = {
    customChartTypeSlug: 'cohort-waterfall',
    fieldMapping: {
        x: 'orders_order_date_month',
        y: 'orders_revenue',
    },
    options: { showLegend: true },
};

// The retired uuid-enriched shape the server used to write into semantic
// artifacts. It must be rejected everywhere: the uuid now lives in the
// customChartType artifact envelope, never inside chartConfig.
const uuidEnrichedChartConfig = {
    dataAppVizUuid: '4c25c1d5-cbc9-4d76-b58e-b1c9ee399fd9',
    fieldMapping: { x: 'orders_order_date_month' },
    optionValues: { showLegend: true },
};

describe('chartConfig builtin defaults', () => {
    it('defaults omitted secondary axis fields to null', () => {
        const parsed = toolRunQueryArgsSchema.parse({
            ...buildV2Args(),
            chartConfig: {
                defaultVizType: 'bar',
                xAxisDimension: 'orders_order_date_month',
                yAxisMetrics: ['orders_revenue'],
                groupBy: null,
                xAxisType: 'time',
                stackBars: null,
                lineType: null,
                xAxisLabel: 'Month',
                yAxisLabel: 'Revenue',
            },
        });

        expect(parsed.chartConfig).toMatchObject({
            secondaryYAxisMetric: null,
            secondaryYAxisLabel: null,
        });
    });
});

describe('chartConfig custom chart type union', () => {
    it('advertised schema accepts a custom chart type config', () => {
        const result = toolRunQueryArgsSchema.safeParse({
            ...buildV2Args(),
            chartConfig: customChartTypeChartConfig,
        });
        expect(result.success).toBe(true);
    });

    it('advertised schema rejects a custom config missing fieldMapping', () => {
        const { fieldMapping, ...withoutMapping } = customChartTypeChartConfig;
        expect(
            toolRunQueryArgsSchema.safeParse({
                ...buildV2Args(),
                chartConfig: withoutMapping,
            }).success,
        ).toBe(false);
    });

    it('advertised schema does not accept a uuid-enriched shape', () => {
        expect(
            toolRunQueryArgsSchema.safeParse({
                ...buildV2Args(),
                chartConfig: uuidEnrichedChartConfig,
            }).success,
        ).toBe(false);
    });

    it('merge-rejecting agent view accepts a custom chart type config', () => {
        expect(
            toolRunQueryArgsSchemaV2RejectingMerge.safeParse({
                ...buildV2Args(),
                chartConfig: customChartTypeChartConfig,
            }).success,
        ).toBe(true);
    });

    it('MCP view stays pinned to the builtin chart config', () => {
        expect(
            toolRunQueryArgsSchemaV2Mcp.safeParse({
                ...buildV2Args(),
                chartConfig: customChartTypeChartConfig,
            }).success,
        ).toBe(false);
        expect(
            toolRunQueryArgsSchemaV2Mcp.safeParse(buildV2Args()).success,
        ).toBe(true);
    });

    it('transformed schema parses the slug branch verbatim', () => {
        expect(
            toolRunQueryArgsSchemaTransformed.parse({
                ...buildV2Args(),
                chartConfig: customChartTypeChartConfig,
            }).chartConfig,
        ).toEqual(customChartTypeChartConfig);
    });

    it('transformed schema rejects the uuid-enriched shape', () => {
        expect(
            toolRunQueryArgsSchemaTransformed.safeParse({
                ...buildV2Args(),
                chartConfig: uuidEnrichedChartConfig,
            }).success,
        ).toBe(false);
    });

    it('parsePersistedRunQueryArgs rejects the uuid-enriched shape', () => {
        expect(
            parsePersistedRunQueryArgs({
                ...buildV2Args(),
                mergeConfig: null,
                chartConfig: uuidEnrichedChartConfig,
            }),
        ).toBeNull();
    });

    it('parsePersistedRunQueryArgs parses the slug branch verbatim', () => {
        const parsed = parsePersistedRunQueryArgs({
            ...buildV2Args(),
            mergeConfig: null,
            chartConfig: customChartTypeChartConfig,
        });
        expect(parsed?.chartConfig).toEqual(customChartTypeChartConfig);
    });

    it('the slug guard discriminates the branches structurally', () => {
        const builtin = toolRunQueryArgsSchemaTransformed.parse({
            ...buildV2Args(),
            chartConfig: {
                defaultVizType: 'bar',
                xAxisDimension: 'orders_order_date_month',
                yAxisMetrics: ['orders_revenue'],
                groupBy: null,
                xAxisType: 'time',
                stackBars: null,
                lineType: null,
                xAxisLabel: 'Month',
                yAxisLabel: 'Revenue',
                secondaryYAxisMetric: null,
                secondaryYAxisLabel: null,
            },
        }).chartConfig;

        expect(isCustomChartTypeSlugChartConfig(builtin)).toBe(false);
        expect(isCustomChartTypeSlugChartConfig(null)).toBe(false);
        expect(
            isCustomChartTypeSlugChartConfig(customChartTypeChartConfig),
        ).toBe(true);
    });
});

describe('isRunQueryArgsV1', () => {
    it('is true for parsed V1 args, false for parsed V2 args', () => {
        const v1 = toolRunQueryArgsSchemaV1.parse(buildV1Args());
        const v2 = toolRunQueryArgsSchemaV2.parse(buildV2Args());

        expect(isRunQueryArgsV1(v1)).toBe(true);
        expect(isRunQueryArgsV1(v2)).toBe(false);
    });
});

const templateCalc = {
    type: 'running_total',
    name: 'running_revenue',
    displayName: 'Running Revenue',
    fieldId: 'orders_revenue',
};

const formulaCalc = {
    type: 'formula',
    name: 'aov',
    displayName: 'AOV',
    formula: 'orders_revenue / orders_count',
    format: null,
    resultType: null,
};

// MCP run_metric_query and merge-disabled agent runtimes advertise this;
// templates must fail at the boundary while the execution parse stays wide.
describe('toolRunQueryArgsSchemaV2FormulaOnly', () => {
    it('accepts formula table calcs', () => {
        expect(
            toolRunQueryArgsSchemaV2FormulaOnly.safeParse(
                buildV2Args({ tableCalculations: [formulaCalc] }),
            ).success,
        ).toBe(true);
    });

    it('rejects legacy template table calcs', () => {
        expect(
            toolRunQueryArgsSchemaV2FormulaOnly.safeParse(
                buildV2Args({ tableCalculations: [templateCalc] }),
            ).success,
        ).toBe(false);
    });

    it('rejects template calcs through the MCP view too', () => {
        expect(
            toolRunQueryArgsSchemaV2Mcp.safeParse(
                buildV2Args({ tableCalculations: [templateCalc] }),
            ).success,
        ).toBe(false);
    });

    it('rejects template calcs through the merge-rejecting variant too', () => {
        expect(
            toolRunQueryArgsSchemaV2RejectingMerge.safeParse(
                buildV2Args({ tableCalculations: [templateCalc] }),
            ).success,
        ).toBe(false);
    });

    it('wide transformed parse still accepts persisted template payloads', () => {
        expect(
            toolRunQueryArgsSchemaV2Transformed.safeParse(
                buildV2Args({ tableCalculations: [templateCalc] }),
            ).success,
        ).toBe(true);
    });
});
