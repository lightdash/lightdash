import {
    addDashboardFiltersToMetricQuery,
    assertUnreachable,
    getAvailableParametersFromTables,
    getDashboardFiltersForTile,
    getDashboardTileParameterOverrides,
    getEffectiveParameterDefinitions,
    getParameterReferences,
    getQueryParameterReferences,
    metricQueryOfSemanticNode,
    QuerySourceType,
    type ComposerChartPipelineNode,
    type DashboardFilters,
    type DashboardTileParameterInputs,
    type Explore,
    type ParameterDefinitions,
    type ParametersValuesMap,
} from '@lightdash/common';
import {
    filtersForExplore,
    unionDashboardFilters,
} from '../AsyncQueryService/mergeDashboardFilters';

/** The viewer's explore of each semantic-layer node, keyed by node id. */
export type ComposerNodeExplores = Record<string, Explore>;

const hasRules = (filters: DashboardFilters) =>
    filters.dimensions.length > 0 ||
    filters.metrics.length > 0 ||
    filters.tableCalculations.length > 0;

/** A tile's dashboard filters pushed into every semantic-layer node whose explore has the field, as on a merged tile; other nodes are left alone. */
export const applyDashboardFiltersToComposerNodes = ({
    tileUuid,
    nodes,
    dashboardFilters,
    exploreByNodeId,
}: {
    tileUuid: string;
    nodes: ComposerChartPipelineNode[];
    dashboardFilters: DashboardFilters;
    exploreByNodeId: ComposerNodeExplores;
}): {
    nodes: ComposerChartPipelineNode[];
    appliedDashboardFilters: DashboardFilters;
    appliedDashboardFiltersByNodeId: Record<string, DashboardFilters>;
} => {
    const tileFilters = getDashboardFiltersForTile(tileUuid, dashboardFilters);
    const appliedDashboardFiltersByNodeId: Record<string, DashboardFilters> =
        {};
    const filtered = nodes.map((node): ComposerChartPipelineNode => {
        const explore = exploreByNodeId[node.nodeId];
        if (node.sourceType !== QuerySourceType.SEMANTIC_LAYER || !explore) {
            return node;
        }
        const applied = filtersForExplore(explore, tileFilters);
        if (!hasRules(applied)) return node;
        appliedDashboardFiltersByNodeId[node.nodeId] = applied;
        const { filters } = addDashboardFiltersToMetricQuery(
            metricQueryOfSemanticNode(node),
            applied,
            explore,
        );
        return { ...node, filters };
    });
    return {
        nodes: filtered,
        appliedDashboardFilters: unionDashboardFilters(
            appliedDashboardFiltersByNodeId,
        ),
        appliedDashboardFiltersByNodeId,
    };
};

// Classic tile precedence: each semantic-layer node's map becomes its explore's overrides; the shared map gets the dashboard's values
export const applyDashboardParametersToComposerNodes = ({
    nodes,
    exploreByNodeId,
    projectDefinitions,
    dashboardValues,
    excludedKeys,
}: Pick<DashboardTileParameterInputs, 'dashboardValues' | 'excludedKeys'> & {
    nodes: ComposerChartPipelineNode[];
    exploreByNodeId: ComposerNodeExplores;
    projectDefinitions: ParameterDefinitions;
}): { nodes: ComposerChartPipelineNode[]; parameters: ParametersValuesMap } => {
    const definitionsFor = (explores: Explore[]) =>
        getEffectiveParameterDefinitions({
            projectDefinitions,
            exploreDefinitions: explores.reduce<ParameterDefinitions>(
                (acc, explore) => ({
                    ...acc,
                    ...getAvailableParametersFromTables(
                        Object.values(explore.tables),
                    ),
                }),
                {},
            ),
        });
    return {
        nodes: nodes.map((node): ComposerChartPipelineNode => {
            const explore = exploreByNodeId[node.nodeId];
            if (node.sourceType !== QuerySourceType.SEMANTIC_LAYER || !explore)
                return node;
            return {
                ...node,
                parameters: getDashboardTileParameterOverrides({
                    definitions: definitionsFor([explore]),
                    dashboardValues,
                    chartSavedValues: node.parameters ?? {},
                    excludedKeys,
                }),
            };
        }),
        // A composer chart stores no shared values of its own
        parameters: getDashboardTileParameterOverrides({
            definitions: definitionsFor(Object.values(exploreByNodeId)),
            dashboardValues,
            chartSavedValues: {},
            excludedKeys,
        }),
    };
};

const getNodeParameterReferences = (
    node: ComposerChartPipelineNode,
    exploreByNodeId: ComposerNodeExplores,
): string[] => {
    switch (node.sourceType) {
        case QuerySourceType.SEMANTIC_LAYER: {
            const explore = exploreByNodeId[node.nodeId];
            return explore ? getQueryParameterReferences(explore, node) : [];
        }
        case QuerySourceType.SQL:
        case QuerySourceType.DUCKDB:
            return getParameterReferences(node.sql);
        // A merge's own references are its sources'; Python code is not inspected
        case QuerySourceType.MERGE:
        case QuerySourceType.PYTHON:
            return [];
        default:
            return assertUnreachable(node, 'Unknown composer node kind');
    }
};

/** The parameters a composer tile reports to its dashboard: the union of its non-Python nodes' references. */
export const getComposerParameterReferences = (
    nodes: ComposerChartPipelineNode[],
    exploreByNodeId: ComposerNodeExplores,
): string[] => [
    ...new Set(
        nodes.flatMap((node) =>
            getNodeParameterReferences(node, exploreByNodeId),
        ),
    ),
];
