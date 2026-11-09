import { NotSupportedError, ParameterError } from '../types/errors';
import {
    getSourceQueryResultReferences,
    type QueryNodeId,
    type SourceQuery,
} from '../types/querySources';
import { type ResultColumn } from '../types/results';
import { ChartType } from '../types/savedCharts';
import { type AiComposerChartArtifactConfigV2 } from './composerArtifact';
import {
    getComposerChartRunQueryChart,
    type ComposerChartVisualization,
} from './composerChart';
import {
    getComposerRunQueryChart,
    type ComposerRunQueryChart,
} from './composerChartVizConfig';
import {
    type ComposerBuiltinChartVizConfig,
    type ComposerStoredChartVizConfig,
} from './composerChartVizConfigSchema';
import { isMetricsOnlyFunnel } from './runQueryChart/shared/isMetricsOnlyFunnel';
import {
    parseStoredComposerPipeline,
    SAVED_COMPOSER_PIPELINE_SCHEMA_VERSION,
    type SavedComposerPipeline,
} from './savedComposerPipeline';

const UUID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Field ids write "." as "__", so a saved chart cannot read such a column back. */
const assertReferenceStorable = (
    reference: string,
    terminalNodeId: QueryNodeId,
) => {
    if (reference.includes('__')) {
        throw new ParameterError(
            `Node "${terminalNodeId}" has a column "${reference}" whose name contains "__", which a saved chart cannot reference; rename it in the query.`,
        );
    }
};

/** The presented node and every node it reads, in artifact order. */
const closureOf = (
    queries: SourceQuery[],
    terminalNodeId: QueryNodeId,
): SourceQuery[] => {
    const byId = new Map(
        queries.flatMap((query) =>
            query.nodeId ? [[query.nodeId, query] as const] : [],
        ),
    );
    const wanted = new Set<QueryNodeId>();
    const visit = (nodeId: QueryNodeId) => {
        if (wanted.has(nodeId)) return;
        wanted.add(nodeId);
        const node = byId.get(nodeId);
        if (node) {
            Object.values(getSourceQueryResultReferences(node)).forEach(visit);
        }
    };
    visit(terminalNodeId);
    return queries.filter(
        (query) => query.nodeId !== undefined && wanted.has(query.nodeId),
    );
};

/** Refuses a node that reads a query result by uuid: those results are creator-scoped and expire, so a chart cannot store them. */
export const assertNoQueryResultReferences = (nodes: SourceQuery[]): void => {
    const nodeIds = new Set(nodes.map((node) => node.nodeId));
    nodes.forEach((node) => {
        Object.values(getSourceQueryResultReferences(node)).forEach(
            (reference) => {
                if (!nodeIds.has(reference) && UUID_PATTERN.test(reference)) {
                    throw new ParameterError(
                        `Node "${node.nodeId}" reads a query result by uuid, which expires; a composer chart stores nodes only.`,
                    );
                }
            },
        );
    });
};

/** The presented node's closure as a stored pipeline; a result read by query uuid is refused, since those expire. */
export const toSavedComposerPipeline = ({
    queries,
    terminalNodeId,
}: Pick<
    AiComposerChartArtifactConfigV2,
    'queries' | 'terminalNodeId'
>): SavedComposerPipeline => {
    const nodes = closureOf(queries, terminalNodeId);
    assertNoQueryResultReferences(nodes);
    return parseStoredComposerPipeline({
        schemaVersion: SAVED_COMPOSER_PIPELINE_SCHEMA_VERSION,
        nodes,
        terminalNodeId,
    });
};

/** Refuses, before any write, a chart config a composer chart cannot hold: a custom chart type needs slots no saved chart stores. */
export const assertComposerChartConfigStorable = (chartConfig: {
    type: ChartType;
}): void => {
    if (chartConfig.type === ChartType.DATA_APP_VIZ) {
        throw new NotSupportedError(
            'A custom chart type cannot be saved to a dashboard yet; pick a builtin chart type.',
        );
    }
};

/** Refuses, before any run, a viz config no saved chart can hold: a custom chart type, or a charted column named with "__". */
export function assertComposerVizConfigStorable(
    vizConfig: ComposerStoredChartVizConfig | null,
    terminalNodeId: QueryNodeId,
): asserts vizConfig is ComposerBuiltinChartVizConfig | null {
    if (vizConfig === null) return;
    if (vizConfig.type === 'custom') {
        throw new NotSupportedError(
            'A custom chart type cannot be saved to a dashboard yet; pick a builtin chart type.',
        );
    }
    [
        vizConfig.x,
        ...(vizConfig.y ?? []),
        ...(vizConfig.groupBy ?? []),
        vizConfig.y2,
    ].forEach((reference) => {
        if (reference) assertReferenceStorable(reference, terminalNodeId);
    });
}

/** What a composer chart stores about its drawing, as the save writes it. */
export type ComposerChartSaveVisualization = {
    chartConfig: ComposerChartVisualization['chartConfig'];
    pivotConfig: ComposerChartVisualization['pivotConfig'];
};

/** A stored chart config names only some of its columns (a funnel's stage column is read as the first non-numeric one), so a save that would draw other columns at view time is refused. */
const assertDrawsSameColumns = (
    saved: Pick<ComposerRunQueryChart, 'metricQuery' | 'fields'>,
    visualization: ComposerChartSaveVisualization,
    columns: ResultColumn[],
    terminalNodeId: QueryNodeId,
) => {
    const drawn = getComposerChartRunQueryChart({
        chartVisualization: visualization,
        columns,
    });
    const names = (
        chart: Pick<ComposerRunQueryChart, 'metricQuery' | 'fields'>,
        metrics: string[],
    ) =>
        [...chart.metricQuery.dimensions, ...metrics].map(
            (fieldId) => chart.fields[fieldId].name,
        );
    // A pie and a column funnel draw y[0] only in the thread; a viz that fell back to a table draws every metric.
    const { type } = visualization.chartConfig;
    const drawsFirstMetricOnly =
        type === ChartType.PIE ||
        (type === ChartType.FUNNEL && !isMetricsOnlyFunnel(saved.metricQuery));
    const savedNames = names(
        saved,
        drawsFirstMetricOnly
            ? saved.metricQuery.metrics.slice(0, 1)
            : saved.metricQuery.metrics,
    );
    const drawnNames = names(drawn, drawn.metricQuery.metrics);
    if (savedNames.join('\0') !== drawnNames.join('\0')) {
        throw new ParameterError(
            `Node "${terminalNodeId}" charts ${savedNames.join(', ')} but a saved chart would draw ${drawnNames.join(', ')}; select only the charted columns, charted first.`,
        );
    }
};

/** Converts a viz config once into the stored chart config over composer result field ids; null draws a table. */
export const convertComposerVizConfigToChart = ({
    vizConfig,
    columns,
    terminalNodeId,
    metadata,
}: {
    vizConfig: ComposerStoredChartVizConfig | null;
    columns: ResultColumn[];
    terminalNodeId: QueryNodeId;
    metadata: { title: string; description: string };
}): ComposerChartSaveVisualization => {
    assertComposerVizConfigStorable(vizConfig, terminalNodeId);
    if (vizConfig === null) {
        columns.forEach((column) =>
            assertReferenceStorable(column.reference, terminalNodeId),
        );
        return {
            chartConfig: { type: ChartType.TABLE },
            pivotConfig: undefined,
        };
    }
    const chart = getComposerRunQueryChart({
        columns,
        vizConfig,
        metadata,
        customChartTypeSlots: [],
    });
    Object.values(chart.fields).forEach((field) =>
        assertReferenceStorable(field.name, terminalNodeId),
    );
    const visualization: ComposerChartSaveVisualization = {
        chartConfig: chart.chartConfig,
        pivotConfig:
            chart.pivotColumns.length > 0
                ? { columns: chart.pivotColumns }
                : undefined,
    };
    assertDrawsSameColumns(chart, visualization, columns, terminalNodeId);
    return visualization;
};

/** What creating a composer chart stores: the dashboard that owns it, its pipeline and its drawing. */
export type CreateComposerChart = ComposerChartSaveVisualization & {
    name: string;
    description: string | null;
    dashboardUuid: string;
    pipeline: SavedComposerPipeline;
};
