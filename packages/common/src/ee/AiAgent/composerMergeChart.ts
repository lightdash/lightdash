import {
    buildSavedMergeDefinition,
    parseSavedMergeDefinition,
    toPrimaryFieldId,
    type SavedMergeDefinition,
} from '../../types/mergeQuery';
import {
    getMergeNodeMergeQuery,
    metricQueryOfSemanticNode,
    QuerySourceType,
    type MergeSourceQuery,
    type SourceQuery,
} from '../../types/querySources';
import { type ResultColumn } from '../../types/results';
import {
    ChartType,
    type ChartConfig,
    type CreateSavedChartVersion,
} from '../../types/savedCharts';
import { stableJson } from '../../utils/stableJson';
import { remapFieldIdsDeep } from './canonicalizeAiMerge';
import { type AiComposerChartArtifactConfig } from './composerArtifact';
import {
    getComposerResultFieldId,
    getComposerRunQueryChart,
} from './composerChartVizConfig';

export type ComposerMergeSavedChart = CreateSavedChartVersion & {
    merge: SavedMergeDefinition;
};

const getChart = (
    config: AiComposerChartArtifactConfig & { schemaVersion: 2 },
    columns: ResultColumn[],
    metadata: { title: string; description: string },
): { chartConfig: ChartConfig; pivotColumns: string[] } | null => {
    const { vizConfig } = config;
    if (vizConfig === null || vizConfig.type === 'table') {
        // An absent config is stored as null, which the saved-chart viewer rejects
        return {
            chartConfig: { type: ChartType.TABLE, config: {} },
            pivotColumns: [],
        };
    }
    // Custom chart types pivot from their bundle's schema; not carried yet.
    if (vizConfig.type === 'custom') return null;
    try {
        return getComposerRunQueryChart({
            columns,
            vizConfig,
            metadata,
            customChartTypeSlots: [],
        });
    } catch {
        return null;
    }
};

const getMergeNodeChart = (node: MergeSourceQuery, queries: SourceQuery[]) => {
    const mergeQuery = getMergeNodeMergeQuery(node, queries);
    if (!mergeQuery) return null;

    const primaryNode = queries.find(
        (query) => query.nodeId === node.sources[0]?.nodeId,
    );
    if (primaryNode?.sourceType !== QuerySourceType.SEMANTIC_LAYER) {
        return null;
    }
    const [primary] = mergeQuery.sources;
    let merge: SavedMergeDefinition;
    try {
        merge = buildSavedMergeDefinition({
            mergeQuery,
            chartSourceId: primary.id,
        });
    } catch {
        // e.g. a join key part without a field on the first source
        return null;
    }
    // Node ids that are not saved-merge names (e.g. `merge`, a leading digit) cannot be saved
    if (!parseSavedMergeDefinition(merge)) return null;

    // A saved merge runs every source under one map, so only sources that set the same values can save
    const sourceParameters = node.sources.map(({ nodeId }) => {
        const source = queries.find((query) => query.nodeId === nodeId);
        return source?.sourceType === QuerySourceType.SEMANTIC_LAYER
            ? stableJson(source.parameters ?? {})
            : null;
    });
    if (new Set(sourceParameters).size !== 1) return null;
    const parameters = primaryNode.parameters ?? {};
    const primaryMetricQuery = metricQueryOfSemanticNode(primaryNode);
    // The chart's own query names fields as the Explorer saves them: the primary's ids
    const toPrimary = (fieldId: string) =>
        toPrimaryFieldId({
            fieldId,
            primarySourceId: primary.id,
            primaryMetricQuery,
            joinKey: mergeQuery.joinKey,
        });
    const primaryFieldIds = [
        ...primaryMetricQuery.dimensions,
        ...primaryMetricQuery.metrics,
    ];

    const chart: ComposerMergeSavedChart = {
        tableName: primaryNode.exploreName,
        // The Explorer reads a merge's sorts and limit from the chart's query
        metricQuery: {
            ...primaryMetricQuery,
            sorts: (mergeQuery.sorts ?? []).map((sort) => ({
                ...sort,
                fieldId: toPrimary(sort.fieldId),
            })),
            limit: mergeQuery.limit,
        },
        chartConfig: { type: ChartType.TABLE, config: {} },
        tableConfig: { columnOrder: primaryFieldIds },
        parameters: Object.keys(parameters).length > 0 ? parameters : undefined,
        merge,
    };
    return { chart, toPrimary, primaryFieldIds: new Set(primaryFieldIds) };
};

/** A merge node as the merged table it opens in the Explorer as; null when it cannot be one. */
export const getComposerMergeNodeChart = (
    node: MergeSourceQuery,
    /** The nodes it reads; other nodes are ignored. */
    queries: SourceQuery[],
): ComposerMergeSavedChart | null =>
    getMergeNodeChart(node, queries)?.chart ?? null;

/** The merged chart a version presenting a merge node saves as, sources named by node id; null when it cannot. */
export const getComposerMergeSavedChart = ({
    config,
    columns,
    metadata,
}: {
    config: AiComposerChartArtifactConfig;
    /** The terminal node's result columns, as run. */
    columns: ResultColumn[];
    metadata: { title: string; description: string };
}): ComposerMergeSavedChart | null => {
    if (config.schemaVersion !== 2 || columns.length === 0) return null;
    const node = config.queries.find(
        ({ nodeId }) => nodeId === config.terminalNodeId,
    );
    if (node?.sourceType !== QuerySourceType.MERGE) return null;
    const nodeChart = getMergeNodeChart(node, config.queries);
    if (!nodeChart) return null;
    const { toPrimary, primaryFieldIds } = nodeChart;

    const chart = getChart(config, columns, metadata);
    if (!chart) return null;
    const fieldIdMap = Object.fromEntries(
        columns.map(({ reference }) => [
            getComposerResultFieldId(reference),
            reference,
        ]),
    );
    const pivotColumns = remapFieldIdsDeep(chart.pivotColumns, fieldIdMap);

    return {
        ...nodeChart.chart,
        chartConfig: remapFieldIdsDeep(chart.chartConfig, fieldIdMap),
        tableConfig: {
            columnOrder: columns
                .map(({ reference }) => toPrimary(reference))
                .filter((fieldId) => primaryFieldIds.has(fieldId)),
        },
        pivotConfig:
            pivotColumns.length > 0 ? { columns: pivotColumns } : undefined,
    };
};
