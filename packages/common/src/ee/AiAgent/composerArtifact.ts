import { ParameterError } from '../../types/errors';
import {
    getSourceQueryResultReferences,
    QuerySourceType,
    type QueryNodeId,
    type SourceQuery,
} from '../../types/querySources';
import {
    ChartKind,
    ChartType,
    type ChartConfig,
} from '../../types/savedCharts';
import { stableJson } from '../../utils/stableJson';

/** The node id a SQL artifact's single node goes by when it is read as a pipeline. */
export const SQL_ARTIFACT_NODE_ID: QueryNodeId = 'sql';

/**
 * The agent's chart vocabulary: the `chartConfig` of the `runQuery` tool,
 * written out as a plain type so API schemas can carry it (the zod schema
 * `chartConfigBuiltinSchema` validates it).
 */
export type AiChartIntent = {
    defaultVizType:
        | 'table'
        | 'bar'
        | 'horizontal'
        | 'line'
        | 'scatter'
        | 'pie'
        | 'funnel';
    xAxisDimension: string | null;
    yAxisMetrics: string[] | null;
    groupBy: string[] | null;
    xAxisType: 'category' | 'time' | null;
    stackBars: boolean | null;
    lineType: 'line' | 'area' | null;
    xAxisLabel: string;
    yAxisLabel: string;
    secondaryYAxisMetric: string | null;
    secondaryYAxisLabel: string | null;
};

/**
 * How a composer artifact's terminal result is visualized, in the same
 * vocabulary as every other chart: the agent's intent (the runQuery
 * `chartConfig` shape, the one the agent and the viz switcher speak), and
 * the explorer `ChartConfig` once a person edits it in the config panel,
 * which then wins. Field ids are `<terminalNodeId>_<column reference>`.
 */
export type AiComposerChartViz = {
    intent: AiChartIntent | null;
    chartConfig: ChartConfig | null;
    /** The dimensions the result is pivoted by, when an edited config pivots. */
    pivotConfig: { columns: string[] } | null;
};

/**
 * A composer artifact version: a declarative pipeline, its terminal node and
 * the viz. Holds no results; opening it runs the pipeline.
 */
export type AiComposerChartArtifactConfig = {
    source: 'composer';
    schemaVersion: 2;
    /** Self-contained pipeline: every node has a node id and reads only nodes of this pipeline. */
    queries: SourceQuery[];
    terminalNodeId: QueryNodeId;
    viz: AiComposerChartViz;
};

/** The column-addressed viz config composer artifacts stored before schema version 2. */
export type LegacyComposerVizConfig = {
    type: ChartKind;
    fieldConfig?: {
        x?: { reference: string } | null;
        y: { reference: string }[];
        groupBy?: { reference: string }[] | null;
    };
};

export type AiComposerChartArtifactConfigV1 = {
    source: 'composer';
    schemaVersion: 1;
    queries: SourceQuery[];
    terminalNodeId: QueryNodeId;
    vizConfig: LegacyComposerVizConfig | null;
};

/** What a composer artifact version row may hold; readers upgrade with `upgradeComposerArtifactConfig`. */
export type StoredAiComposerChartArtifactConfig =
    | AiComposerChartArtifactConfigV1
    | AiComposerChartArtifactConfig;

const isComposerShape = (
    config: unknown,
): config is { schemaVersion: unknown } & Record<string, unknown> =>
    typeof config === 'object' &&
    config !== null &&
    'source' in config &&
    config.source === 'composer' &&
    'schemaVersion' in config &&
    'queries' in config &&
    Array.isArray(config.queries) &&
    'terminalNodeId' in config &&
    typeof config.terminalNodeId === 'string';

export const isStoredAiComposerChartArtifactConfig = (
    config: unknown,
): config is StoredAiComposerChartArtifactConfig =>
    isComposerShape(config) &&
    (config.schemaVersion === 1 || config.schemaVersion === 2);

export const isAiComposerChartArtifactConfig = (
    config: unknown,
): config is AiComposerChartArtifactConfig =>
    isComposerShape(config) && config.schemaVersion === 2 && 'viz' in config;

export const COMPOSER_TABLE_INTENT: AiChartIntent = {
    defaultVizType: 'table',
    xAxisDimension: null,
    yAxisMetrics: null,
    groupBy: null,
    xAxisType: null,
    stackBars: null,
    lineType: null,
    xAxisLabel: '',
    yAxisLabel: '',
    secondaryYAxisMetric: null,
    secondaryYAxisLabel: null,
};

export const COMPOSER_TABLE_VIZ: AiComposerChartViz = {
    intent: COMPOSER_TABLE_INTENT,
    chartConfig: null,
    pivotConfig: null,
};

const legacyKindToVizType = (
    kind: ChartKind,
): AiChartIntent['defaultVizType'] | 'big_number' => {
    switch (kind) {
        case ChartKind.VERTICAL_BAR:
            return 'bar';
        case ChartKind.LINE:
            return 'line';
        case ChartKind.PIE:
            return 'pie';
        case ChartKind.BIG_NUMBER:
            return 'big_number';
        default:
            return 'table';
    }
};

/**
 * The viz of a version stored before schema version 2. Axes map onto the
 * intent; a series split becomes a pivot (one value per x and series, as the
 * pipeline produced it: the viz-side aggregation the old config carried is
 * gone, aggregation belongs in the query); a big number becomes an explorer
 * config, since the agent vocabulary has no big number.
 */
export const upgradeLegacyComposerViz = (
    vizConfig: LegacyComposerVizConfig | null,
    terminalNodeId: QueryNodeId,
): AiComposerChartViz => {
    if (!vizConfig) return COMPOSER_TABLE_VIZ;
    const fieldId = (reference: string) => `${terminalNodeId}_${reference}`;
    const vizType = legacyKindToVizType(vizConfig.type);
    const x = vizConfig.fieldConfig?.x?.reference ?? null;
    const y = vizConfig.fieldConfig?.y.map((value) => value.reference) ?? [];
    const groupBy =
        vizConfig.fieldConfig?.groupBy?.map((group) => group.reference) ?? [];
    if (vizType === 'big_number') {
        const selectedField = y[0];
        return {
            intent: null,
            chartConfig: {
                type: ChartType.BIG_NUMBER,
                config: selectedField
                    ? { selectedField: fieldId(selectedField) }
                    : {},
            },
            pivotConfig: null,
        };
    }
    if (vizType === 'table') return COMPOSER_TABLE_VIZ;
    return {
        intent: {
            ...COMPOSER_TABLE_INTENT,
            defaultVizType: vizType,
            xAxisDimension: x ? fieldId(x) : null,
            yAxisMetrics: y.length > 0 ? y.map(fieldId) : null,
            groupBy: groupBy.length > 0 ? groupBy.map(fieldId) : null,
        },
        chartConfig: null,
        pivotConfig: null,
    };
};

/** A stored composer artifact config at the current schema version. */
export const upgradeComposerArtifactConfig = (
    config: StoredAiComposerChartArtifactConfig,
): AiComposerChartArtifactConfig => {
    if (config.schemaVersion === 2) return config;
    const { vizConfig, ...rest } = config;
    return {
        ...rest,
        schemaVersion: 2,
        viz: upgradeLegacyComposerViz(vizConfig, config.terminalNodeId),
    };
};

/** A SQL artifact read as the one-node pipeline it is, so it renders and saves like every other artifact. */
export const sqlArtifactAsComposerConfig = ({
    sql,
    limit,
    title,
}: {
    sql: string;
    limit: number;
    title?: string | null;
}): AiComposerChartArtifactConfig => ({
    source: 'composer',
    schemaVersion: 2,
    queries: [
        {
            sourceType: QuerySourceType.SQL,
            nodeId: SQL_ARTIFACT_NODE_ID,
            title: title ?? 'SQL',
            sql,
            limit,
        },
    ],
    terminalNodeId: SQL_ARTIFACT_NODE_ID,
    viz: COMPOSER_TABLE_VIZ,
});

// The full definition, with array references written in map form.
const nodeDefinition = (node: SourceQuery): string =>
    stableJson(
        node.sourceType === QuerySourceType.DUCKDB ||
            node.sourceType === QuerySourceType.PYTHON
            ? { ...node, references: getSourceQueryResultReferences(node) }
            : node,
    );

const describeNodes = (nodes: SourceQuery[]): string =>
    nodes.length === 0
        ? 'There are no nodes from earlier versions in this thread.'
        : `Nodes from earlier versions: ${nodes
              .map((node) => `${node.nodeId} ("${node.title ?? node.nodeId}")`)
              .join(', ')}.`;

/** A node of a built pipeline; building guarantees every node a node id. */
export type ComposerPipelineNode = SourceQuery & { nodeId: QueryNodeId };

const hasNodeId = (node: SourceQuery): node is ComposerPipelineNode =>
    !!node.nodeId;

/**
 * Builds a version's pipeline from a submission: submitted nodes plus every
 * reused node from earlier versions and everything it reads, in dependency
 * order. Node ids name one definition for the whole thread.
 */
export const buildComposerArtifactPipeline = ({
    queries,
    earlierPipelines,
}: {
    queries: SourceQuery[];
    earlierPipelines: Pick<StoredAiComposerChartArtifactConfig, 'queries'>[];
}): ComposerPipelineNode[] => {
    const threadNodes = new Map<QueryNodeId, SourceQuery>();
    earlierPipelines.forEach((pipeline) =>
        pipeline.queries.forEach((node) => {
            if (node.nodeId) threadNodes.set(node.nodeId, node);
        }),
    );
    const submittedNodes = new Map<QueryNodeId, SourceQuery>(
        queries.flatMap((node) => (node.nodeId ? [[node.nodeId, node]] : [])),
    );

    submittedNodes.forEach((node, nodeId) => {
        const earlier = threadNodes.get(nodeId);
        if (earlier && nodeDefinition(earlier) !== nodeDefinition(node)) {
            throw new ParameterError(
                `Node id "${nodeId}" already names a different node in this thread ("${earlier.title ?? nodeId}"). To reuse it, read "${nodeId}" without resubmitting it; to define a new node, give it a different node id.`,
            );
        }
    });
    queries.forEach((node) =>
        Object.values(getSourceQueryResultReferences(node)).forEach(
            (reference) => {
                if (
                    !submittedNodes.has(reference) &&
                    !threadNodes.has(reference)
                ) {
                    throw new ParameterError(
                        `Node "${node.nodeId}" reads "${reference}", which is not a node of this submission or of an earlier version in this thread. ${describeNodes([...threadNodes.values()])}`,
                    );
                }
            },
        ),
    );

    const emitted = new Set<QueryNodeId>();
    const visiting = new Set<QueryNodeId>();
    const pipeline: ComposerPipelineNode[] = [];
    const visit = (node: SourceQuery) => {
        if (!hasNodeId(node)) return;
        const { nodeId } = node;
        if (emitted.has(nodeId) || visiting.has(nodeId)) return;
        visiting.add(nodeId);
        Object.values(getSourceQueryResultReferences(node)).forEach(
            (reference) => {
                const read =
                    submittedNodes.get(reference) ?? threadNodes.get(reference);
                if (read) visit(read);
            },
        );
        visiting.delete(nodeId);
        emitted.add(nodeId);
        pipeline.push(node);
    };
    queries.forEach(visit);
    return pipeline;
};
