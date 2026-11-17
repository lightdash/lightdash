import {
    type ComposerChartColumn,
    type ComposerChartPipeline,
    type ComposerChartPipelineNode,
    type ComposerStoredChart,
} from '../../composer/composerChart';
import { getComposerResultFieldId } from '../../composer/composerResultChart';
import { FieldType } from '../../types/field';
import {
    getSourceQueryResultReferences,
    QuerySourceType,
    type SourceQuery,
} from '../../types/querySources';
import { type ResultColumn } from '../../types/results';
import assertUnreachable from '../../utils/assertUnreachable';
import { type AiComposerChartArtifactConfig } from './composerArtifact';
import {
    getComposerRunQueryChart,
    type ComposerCustomChartTypeSlot,
} from './composerChartVizConfig';
import { getComposerMergeNodeChart } from './composerMergeChart';

export type ComposerChartSaveDraft =
    | {
          status: 'ready';
          pipeline: ComposerChartPipeline;
          chart: ComposerStoredChart;
      }
    | { status: 'unavailable'; reason: string };

/** An answer's custom chart type as its pinned version declares it, or why it cannot be read. */
export type ComposerChartSaveCustomChartType =
    | { status: 'ready'; slots: ComposerCustomChartTypeSlot[] }
    | { status: 'unavailable'; reason: string };

const unavailable = (reason: string): ComposerChartSaveDraft => ({
    status: 'unavailable',
    reason,
});

/** The node and every node it reads, directly or indirectly, in pipeline order. */
const getReadNodes = (
    queries: SourceQuery[],
    terminalNodeId: string,
): SourceQuery[] => {
    const byId = new Map(queries.map((query) => [query.nodeId, query]));
    const kept = new Set<string>();
    const visit = (nodeId: string) => {
        const node = byId.get(nodeId);
        if (!node || kept.has(nodeId)) return;
        kept.add(nodeId);
        Object.values(getSourceQueryResultReferences(node)).forEach(visit);
    };
    visit(terminalNodeId);
    return queries.filter(
        (query) => query.nodeId !== undefined && kept.has(query.nodeId),
    );
};

const toPipelineNode = (
    query: SourceQuery,
): ComposerChartPipelineNode | null => {
    const nodeId = query.nodeId ?? '';
    const title = query.title ?? nodeId;
    switch (query.sourceType) {
        case QuerySourceType.SEMANTIC_LAYER:
        case QuerySourceType.SQL:
        case QuerySourceType.DUCKDB:
            return { ...query, nodeId, title };
        case QuerySourceType.PYTHON:
        case QuerySourceType.MERGE: {
            const { pivotConfiguration, ...node } = query;
            return pivotConfiguration ? null : { ...node, nodeId, title };
        }
        case QuerySourceType.EXTERNAL:
        case QuerySourceType.API:
            return null;
        default:
            return assertUnreachable(query, 'Unknown source type');
    }
};

/** Whether an answer saves as a composer chart: v2 answers, except a merge that saves as a merged chart. */
export const savesAsComposerChart = (
    config: AiComposerChartArtifactConfig,
): boolean => {
    if (config.schemaVersion !== 2) return false;
    const node = config.queries.find(
        ({ nodeId }) => nodeId === config.terminalNodeId,
    );
    return !(
        node?.sourceType === QuerySourceType.MERGE &&
        getComposerMergeNodeChart(node, config.queries) !== null
    );
};

/**
 * The composer chart an AI answer saves as: the presented node and the nodes
 * it reads, and its viz config as a classic chart over the run's columns.
 */
export const getComposerChartSaveDraft = ({
    config,
    columns,
    metadata,
    customChartType,
}: {
    config: AiComposerChartArtifactConfig;
    /** The presented node's result columns, from the run the panel did. */
    columns: ResultColumn[];
    metadata: { title: string; description: string };
    /** Null until the answer's custom chart type has loaded, and for answers without one. */
    customChartType: ComposerChartSaveCustomChartType | null;
}): ComposerChartSaveDraft => {
    if (config.schemaVersion !== 2) {
        return unavailable('Older answers cannot be saved to a dashboard');
    }
    let customChartTypeSlots: ComposerCustomChartTypeSlot[] = [];
    if (config.vizConfig?.type === 'custom') {
        if (customChartType === null) {
            return unavailable('Waiting for the custom chart type to load');
        }
        if (customChartType.status === 'unavailable') {
            return unavailable(customChartType.reason);
        }
        customChartTypeSlots = customChartType.slots;
    }
    if (columns.length === 0) {
        return unavailable('Waiting for the result to load');
    }

    const nodes: ComposerChartPipelineNode[] = [];
    for (const query of getReadNodes(config.queries, config.terminalNodeId)) {
        const node = toPipelineNode(query);
        if (!node) {
            return unavailable(
                `Step "${query.title ?? query.nodeId}" cannot run on a dashboard`,
            );
        }
        nodes.push(node);
    }

    let runQueryChart: ReturnType<typeof getComposerRunQueryChart>;
    try {
        runQueryChart = getComposerRunQueryChart({
            columns,
            vizConfig: config.vizConfig ?? {
                type: 'table',
                x: null,
                y: null,
                groupBy: null,
                stack: null,
                horizontal: null,
                y2: null,
                labels: null,
            },
            metadata,
            customChartTypeSlots,
        });
    } catch (e) {
        return unavailable(e instanceof Error ? e.message : String(e));
    }
    const { metricQuery, chartConfig, pivotColumns } = runQueryChart;
    const referenceOf = new Map(
        columns.map(({ reference }) => [
            getComposerResultFieldId(reference),
            reference,
        ]),
    );
    const toColumn =
        (fieldType: ComposerChartColumn['fieldType']) =>
        (fieldId: string): ComposerChartColumn => ({
            reference: referenceOf.get(fieldId) ?? fieldId,
            fieldType,
        });

    return {
        status: 'ready',
        pipeline: {
            schemaVersion: 1,
            terminalNodeId: config.terminalNodeId,
            nodes,
        },
        chart: {
            schemaVersion: 1,
            columns: [
                ...metricQuery.dimensions.map(toColumn(FieldType.DIMENSION)),
                ...metricQuery.metrics.map(toColumn(FieldType.METRIC)),
            ],
            chartConfig,
            pivotConfig:
                pivotColumns.length > 0 ? { columns: pivotColumns } : null,
            tableConfig: {
                columnOrder: [
                    ...metricQuery.dimensions,
                    ...metricQuery.metrics,
                ],
            },
        },
    };
};
