import {
    buildSavedMergeDefinition,
    parseSavedMergeDefinition,
    type SavedMergeDefinition,
} from '../../types/mergeQuery';
import { type ParametersValuesMap } from '../../types/parameters';
import {
    getMergeNodeMergeQuery,
    metricQueryOfSemanticNode,
    QuerySourceType,
} from '../../types/querySources';
import { type ResultColumn } from '../../types/results';
import {
    ChartType,
    type ChartConfig,
    type CreateSavedChartVersion,
} from '../../types/savedCharts';
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
        return { chartConfig: { type: ChartType.TABLE }, pivotColumns: [] };
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

/**
 * The merged chart a composer version saves as when it presents a merge node.
 * Sources keep their node ids as names, so merged column ids, calc formulas
 * and sorts carry over unchanged. Null when it cannot be saved as one.
 */
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
    const mergeQuery = getMergeNodeMergeQuery(node, config.queries);
    if (!mergeQuery) return null;

    const sourceNodes = node.sources.map(({ nodeId }) =>
        config.queries.find((query) => query.nodeId === nodeId),
    );
    const [primaryNode] = sourceNodes;
    if (primaryNode?.sourceType !== QuerySourceType.SEMANTIC_LAYER) {
        return null;
    }
    const [primary] = mergeQuery.sources;
    const merge = buildSavedMergeDefinition({
        mergeQuery,
        chartSourceId: primary.id,
    });
    // Node ids that are not saved-merge names (e.g. `merge`, a leading digit) cannot be saved
    if (!parseSavedMergeDefinition(merge)) return null;

    const chart = getChart(config, columns, metadata);
    if (!chart) return null;
    const fieldIdMap = Object.fromEntries(
        columns.map(({ reference }) => [
            getComposerResultFieldId(reference),
            reference,
        ]),
    );
    const pivotColumns = remapFieldIdsDeep(chart.pivotColumns, fieldIdMap);
    // The merge runs every source's own parameters, later sources winning
    const parameters = sourceNodes.reduce<ParametersValuesMap>(
        (acc, source) =>
            source?.sourceType === QuerySourceType.SEMANTIC_LAYER
                ? { ...acc, ...source.parameters }
                : acc,
        {},
    );

    return {
        tableName: primaryNode.exploreName,
        // The Explorer reads a merge's sorts and limit from the chart's query
        metricQuery: {
            ...metricQueryOfSemanticNode(primaryNode),
            sorts: mergeQuery.sorts ?? [],
            limit: mergeQuery.limit,
        },
        chartConfig: remapFieldIdsDeep(chart.chartConfig, fieldIdMap),
        tableConfig: {
            columnOrder: columns.map(({ reference }) => reference),
        },
        pivotConfig:
            pivotColumns.length > 0 ? { columns: pivotColumns } : undefined,
        parameters: Object.keys(parameters).length > 0 ? parameters : undefined,
        merge,
    };
};
