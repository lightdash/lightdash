import { z } from 'zod';
import { ParameterError } from '../types/errors';
import { FieldType } from '../types/field';
import { MergeJoinType } from '../types/mergeQuery';
import {
    getSourceQueryResultReferences,
    MAX_SOURCE_QUERIES_PER_SUBMISSION,
    QuerySourceType,
    type DuckdbSourceQuery,
    type MergeSourceQuery,
    type PythonSourceQuery,
    type SemanticLayerSourceQuery,
    type SqlSourceQuery,
} from '../types/querySources';
import { ChartType, type ChartConfig } from '../types/savedCharts';
import assertUnreachable from '../utils/assertUnreachable';

type StoredNode<T> = T & {
    /** @pattern ^[a-zA-Z_][a-zA-Z0-9_]{0,62}$ */
    nodeId: string;
    title: string;
};

/** A node of a stored composer chart pipeline; kinds a dashboard viewer can run. */
export type ComposerChartPipelineNode =
    | StoredNode<SemanticLayerSourceQuery>
    | StoredNode<SqlSourceQuery>
    | StoredNode<DuckdbSourceQuery>
    | StoredNode<Omit<PythonSourceQuery, 'pivotConfiguration'>>
    | StoredNode<Omit<MergeSourceQuery, 'pivotConfiguration'>>;

export type ComposerChartPipeline = {
    schemaVersion: 1;
    terminalNodeId: string;
    nodes: ComposerChartPipelineNode[];
};

export type ComposerChartColumn = {
    reference: string;
    fieldType: FieldType.DIMENSION | FieldType.METRIC;
};

export type ComposerStoredChart = {
    schemaVersion: 1;
    columns: ComposerChartColumn[];
    chartConfig: ChartConfig;
    pivotConfig: { columns: string[] } | null;
    tableConfig: { columnOrder: string[] };
};

// Classic structures inside a node are read the way classic code reads them.
const classicObject = <T>() =>
    z.custom<T>(
        (value) =>
            typeof value === 'object' &&
            value !== null &&
            !Array.isArray(value),
    );
const classicArray = <T>() => z.array(classicObject<T>());

const nodeBase = {
    nodeId: z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/),
    title: z.string().min(1),
    description: z.string().optional(),
    limit: z.number().int().positive().optional(),
};
const pivotConfiguration =
    classicObject<SemanticLayerSourceQuery['pivotConfiguration']>().optional();
const references = z.union([
    z.array(z.string()),
    z.record(z.string(), z.string()),
]);

const nodeSchema = z.discriminatedUnion('sourceType', [
    z.strictObject({
        ...nodeBase,
        sourceType: z.literal(QuerySourceType.SEMANTIC_LAYER),
        exploreName: z.string().min(1),
        dimensions: z.array(z.string()),
        metrics: z.array(z.string()),
        filters:
            classicObject<SemanticLayerSourceQuery['filters']>().optional(),
        sorts: classicArray<
            NonNullable<SemanticLayerSourceQuery['sorts']>[number]
        >().optional(),
        tableCalculations:
            classicArray<
                NonNullable<
                    SemanticLayerSourceQuery['tableCalculations']
                >[number]
            >().optional(),
        additionalMetrics:
            classicArray<
                NonNullable<
                    SemanticLayerSourceQuery['additionalMetrics']
                >[number]
            >().optional(),
        customDimensions:
            classicArray<
                NonNullable<
                    SemanticLayerSourceQuery['customDimensions']
                >[number]
            >().optional(),
        metricOverrides:
            classicObject<
                NonNullable<SemanticLayerSourceQuery['metricOverrides']>
            >().optional(),
        dimensionOverrides:
            classicObject<
                NonNullable<SemanticLayerSourceQuery['dimensionOverrides']>
            >().optional(),
        timezone: z.string().optional(),
        parameters:
            classicObject<
                NonNullable<SemanticLayerSourceQuery['parameters']>
            >().optional(),
        pivotConfiguration,
    }),
    z.strictObject({
        ...nodeBase,
        sourceType: z.literal(QuerySourceType.SQL),
        sql: z.string().min(1),
        pivotConfiguration,
    }),
    z.strictObject({
        ...nodeBase,
        sourceType: z.literal(QuerySourceType.DUCKDB),
        sql: z.string().min(1),
        references,
        pivotConfiguration,
    }),
    z.strictObject({
        ...nodeBase,
        sourceType: z.literal(QuerySourceType.PYTHON),
        code: z.string().min(1),
        references,
    }),
    z.strictObject({
        ...nodeBase,
        sourceType: z.literal(QuerySourceType.MERGE),
        sources: z
            .array(
                z.strictObject({
                    nodeId: z.string(),
                    repeatValues: z.boolean().optional(),
                }),
            )
            .min(2),
        joinKey: classicArray<MergeSourceQuery['joinKey'][number]>(),
        joinType: z.enum(MergeJoinType),
        tableCalculations:
            classicArray<
                NonNullable<MergeSourceQuery['tableCalculations']>[number]
            >().optional(),
        sorts: classicArray<
            NonNullable<MergeSourceQuery['sorts']>[number]
        >().optional(),
    }),
]);

const pipelineSchema = z.strictObject({
    schemaVersion: z.literal(1),
    terminalNodeId: z.string(),
    nodes: z.array(nodeSchema).min(1).max(MAX_SOURCE_QUERIES_PER_SUBMISSION),
});

const toParameterError = (document: string, error: z.ZodError) =>
    new ParameterError(
        `Invalid composer chart ${document}: ${error.issues
            .map((issue) =>
                issue.path.length > 0
                    ? `${issue.path.join('.')}: ${issue.message}`
                    : issue.message,
            )
            .join('; ')}`,
    );

const getReadNodeIds = (node: ComposerChartPipelineNode): string[] =>
    Object.values(
        getSourceQueryResultReferences(
            node as Parameters<typeof getSourceQueryResultReferences>[0],
        ),
    );

const assertPipelineGraph = ({
    terminalNodeId,
    nodes,
}: ComposerChartPipeline) => {
    const byId = new Map<string, ComposerChartPipelineNode>();
    nodes.forEach((node) => {
        if (byId.has(node.nodeId)) {
            throw new ParameterError(
                `Composer chart pipeline has more than one node "${node.nodeId}"`,
            );
        }
        byId.set(node.nodeId, node);
    });
    nodes.forEach((node) => {
        getReadNodeIds(node).forEach((readId) => {
            if (!byId.has(readId)) {
                throw new ParameterError(
                    `Node "${node.nodeId}" reads "${readId}", which is not a node of this pipeline`,
                );
            }
        });
        if (node.sourceType === QuerySourceType.MERGE) {
            node.sources.forEach(({ nodeId }) => {
                if (
                    byId.get(nodeId)?.sourceType !==
                    QuerySourceType.SEMANTIC_LAYER
                ) {
                    throw new ParameterError(
                        `Merge node "${node.nodeId}" reads "${nodeId}", which is not a semanticLayer node`,
                    );
                }
            });
        }
    });
    if (!byId.has(terminalNodeId)) {
        throw new ParameterError(
            `Composer chart pipeline has no terminal node "${terminalNodeId}"`,
        );
    }

    const done = new Set<string>();
    const visit = (nodeId: string, path: string[]) => {
        if (path.includes(nodeId)) {
            throw new ParameterError(
                `Composer chart pipeline has a cycle: ${[...path, nodeId].join(' -> ')}`,
            );
        }
        if (done.has(nodeId)) return;
        getReadNodeIds(byId.get(nodeId)!).forEach((readId) =>
            visit(readId, [...path, nodeId]),
        );
        done.add(nodeId);
    };
    visit(terminalNodeId, []);
    nodes.forEach(({ nodeId }) => {
        if (!done.has(nodeId)) {
            throw new ParameterError(
                `Node "${nodeId}" is not read by the terminal node "${terminalNodeId}"`,
            );
        }
    });
};

/** Strict parse of a stored pipeline; unknown keys are refused, never stripped. */
export const parseComposerPipeline = (
    document: unknown,
): ComposerChartPipeline => {
    const result = pipelineSchema.safeParse(document);
    if (!result.success) throw toParameterError('pipeline', result.error);
    const pipeline = result.data as ComposerChartPipeline;
    assertPipelineGraph(pipeline);
    return pipeline;
};

const storedChartSchema = z.strictObject({
    schemaVersion: z.literal(1),
    columns: z
        .array(
            z.strictObject({
                reference: z.string().min(1),
                fieldType: z.enum([FieldType.DIMENSION, FieldType.METRIC]),
            }),
        )
        .min(1),
    chartConfig: z.looseObject({ type: z.enum(ChartType) }),
    pivotConfig: z.strictObject({ columns: z.array(z.string()) }).nullable(),
    tableConfig: z.strictObject({ columnOrder: z.array(z.string()) }),
});

const compact = (names: (string | undefined)[]): string[] =>
    names.filter((name): name is string => name !== undefined);

/** Column names the chart config uses. */
const getChartConfigNames = (chartConfig: ChartConfig): string[] => {
    switch (chartConfig.type) {
        case ChartType.CARTESIAN: {
            const { config } = chartConfig;
            return compact([
                config?.layout?.xField,
                ...(config?.layout?.yField ?? []),
                ...(config?.eChartsConfig?.series ?? []).flatMap(({ encode }) =>
                    [encode?.xRef, encode?.yRef].flatMap((ref) =>
                        ref
                            ? [
                                  ref.field,
                                  ...(ref.pivotValues ?? []).map(
                                      ({ field }) => field,
                                  ),
                              ]
                            : [],
                    ),
                ),
            ]);
        }
        case ChartType.TABLE:
            return Object.keys(chartConfig.config?.columns ?? {});
        case ChartType.BIG_NUMBER:
            return compact([
                chartConfig.config?.selectedField,
                chartConfig.config?.comparisonField,
            ]);
        case ChartType.PIE:
            return compact([
                ...(chartConfig.config?.groupFieldIds ?? []),
                chartConfig.config?.metricId,
            ]);
        case ChartType.FUNNEL:
            return compact([chartConfig.config?.fieldId]);
        case ChartType.DATA_APP_VIZ:
            throw new ParameterError(
                'Composer charts do not support custom chart types yet',
            );
        case ChartType.TREEMAP:
            return compact([
                ...(chartConfig.config?.groupFieldIds ?? []),
                chartConfig.config?.sizeMetricId,
                chartConfig.config?.colorMetricId,
            ]);
        case ChartType.GAUGE:
            return compact([
                chartConfig.config?.selectedField,
                chartConfig.config?.maxFieldId,
                ...(chartConfig.config?.sections ?? []).flatMap((section) => [
                    section.minFieldId,
                    section.maxFieldId,
                ]),
            ]);
        case ChartType.MAP:
            return compact([
                chartConfig.config?.latitudeFieldId,
                chartConfig.config?.longitudeFieldId,
                chartConfig.config?.locationFieldId,
                chartConfig.config?.valueFieldId,
                chartConfig.config?.sizeFieldId,
            ]);
        case ChartType.SANKEY:
            return compact([
                chartConfig.config?.sourceFieldId,
                chartConfig.config?.targetFieldId,
                chartConfig.config?.metricFieldId,
            ]);
        // A Vega-Lite spec names fields inside free-form JSON.
        case ChartType.CUSTOM:
            return [];
        default:
            return assertUnreachable(chartConfig, 'Unknown chart type');
    }
};

/** Strict parse of a stored chart; every name a config uses must be a column. */
export const parseComposerStoredChart = (
    document: unknown,
): ComposerStoredChart => {
    const result = storedChartSchema.safeParse(document);
    if (!result.success) throw toParameterError('chart', result.error);
    const { columns, pivotConfig, tableConfig } = result.data;

    const names = new Set<string>();
    columns.forEach(({ reference }) => {
        if (reference.includes('.')) {
            throw new ParameterError(
                `Column "${reference}" has a dot in its name. Rename it in the node that returns it.`,
            );
        }
        if (names.has(reference)) {
            throw new ParameterError(
                `Composer chart has more than one column "${reference}"`,
            );
        }
        names.add(reference);
    });

    let chartConfigNames: unknown;
    try {
        chartConfigNames = getChartConfigNames(
            result.data.chartConfig as ChartConfig,
        );
    } catch (e) {
        if (e instanceof ParameterError) throw e;
        throw new ParameterError('Invalid composer chart chartConfig');
    }
    if (
        !Array.isArray(chartConfigNames) ||
        chartConfigNames.some((name) => typeof name !== 'string')
    ) {
        throw new ParameterError('Invalid composer chart chartConfig');
    }
    const checkedChartConfigNames: string[] = chartConfigNames.map(String);
    const used: [string, string[]][] = [
        ['chartConfig', checkedChartConfigNames],
        ['pivotConfig', pivotConfig?.columns ?? []],
        ['tableConfig', tableConfig.columnOrder],
    ];
    used.forEach(([config, configNames]) => {
        configNames.forEach((name) => {
            if (!names.has(name)) {
                throw new ParameterError(
                    `Composer chart ${config} uses "${name}", which is not one of its columns`,
                );
            }
        });
    });
    return result.data as ComposerStoredChart;
};

export type CreateComposerChart = {
    dashboardUuid: string;
    name: string;
    description?: string | null;
    pipeline: ComposerChartPipeline;
    chart: ComposerStoredChart;
};

/** A composer chart and its current version. */
export type ComposerChart = {
    uuid: string;
    projectUuid: string;
    dashboardUuid: string;
    name: string;
    description: string | null;
    slug: string;
    createdAt: Date;
    createdByUserUuid: string | null;
    versionUuid: string;
    pipeline: ComposerChartPipeline;
    chart: ComposerStoredChart;
    updatedAt: Date;
    updatedByUserUuid: string | null;
};

export type ApiComposerChartResponse = {
    status: 'ok';
    results: ComposerChart;
};
