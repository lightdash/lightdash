import {
    addDashboardFiltersToMetricQuery,
    assertUnreachable,
    DimensionType,
    getAllDimensionsMap,
    getAvailableParametersFromTables,
    getDashboardFilterRulesForTileAndReferences,
    getDashboardFiltersForTile,
    getDashboardTileParameterOverrides,
    getEffectiveParameterDefinitions,
    getParameterReferences,
    getQueryParameterReferences,
    getTimeDimensionsMap,
    isCartesianChartConfig,
    isDateZoomRefusedOnExplore,
    isStandardDateGranularity,
    isSubDayGranularity,
    metricQueryOfSemanticNode,
    QuerySourceType,
    resolveToBaseTimeDimension,
    type ComposerChartPipelineNode,
    type ComposerStoredChart,
    type DashboardFilters,
    type DashboardTileParameterInputs,
    type DateZoom,
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

/** The explores the semantic-layer nodes read, each once */
export const getSemanticExploreNames = (
    nodes: ComposerChartPipelineNode[],
): string[] => [
    ...new Set(
        nodes.flatMap((node) =>
            node.sourceType === QuerySourceType.SEMANTIC_LAYER
                ? [node.exploreName]
                : [],
        ),
    ),
];

/** The values saved on the semantic-layer nodes, as one chart's saved values */
export const getComposerSavedParameterValues = (
    nodes: ComposerChartPipelineNode[],
): ParametersValuesMap =>
    nodes.reduce<ParametersValuesMap>(
        (acc, node) =>
            node.sourceType === QuerySourceType.SEMANTIC_LAYER
                ? { ...acc, ...node.parameters }
                : acc,
        {},
    );

const hasRules = (filters: DashboardFilters) =>
    filters.dimensions.length > 0 ||
    filters.metrics.length > 0 ||
    filters.tableCalculations.length > 0;

// A SQL column target reaches SQL nodes only
const withoutSqlColumnTargets = (
    filters: DashboardFilters,
): DashboardFilters => ({
    dimensions: filters.dimensions.filter((r) => !r.target.isSqlColumn),
    metrics: filters.metrics.filter((r) => !r.target.isSqlColumn),
    tableCalculations: filters.tableCalculations.filter(
        (r) => !r.target.isSqlColumn,
    ),
});

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
    const tileFilters = withoutSqlColumnTargets(
        getDashboardFiltersForTile(tileUuid, dashboardFilters),
    );
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

/** Adds the rules the SQL nodes applied: an explicit tile target naming a column the node returns, as on a SQL chart tile. */
export const withSqlColumnFilters = (
    applied: {
        appliedDashboardFiltersByNodeId: Record<string, DashboardFilters>;
    },
    {
        tileUuid,
        dashboardFilters,
        sqlColumnsByNodeId,
    }: {
        tileUuid: string;
        dashboardFilters: DashboardFilters;
        sqlColumnsByNodeId: Record<string, string[]>;
    },
): {
    appliedDashboardFilters: DashboardFilters;
    appliedDashboardFiltersByNodeId: Record<string, DashboardFilters>;
} => {
    const appliedDashboardFiltersByNodeId = {
        ...applied.appliedDashboardFiltersByNodeId,
    };
    Object.entries(sqlColumnsByNodeId).forEach(([nodeId, columns]) => {
        const dimensions = getDashboardFilterRulesForTileAndReferences(
            tileUuid,
            columns,
            dashboardFilters.dimensions,
        );
        if (dimensions.length > 0) {
            appliedDashboardFiltersByNodeId[nodeId] = {
                dimensions,
                metrics: [],
                tableCalculations: [],
            };
        }
    });
    return {
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
        // No explore's options narrow the values other tiers read
        parameters: getDashboardTileParameterOverrides({
            definitions: getEffectiveParameterDefinitions({
                projectDefinitions,
                exploreDefinitions: {},
            }),
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

const getNodeDateZoomFieldId = (
    node: Extract<
        ComposerChartPipelineNode,
        { sourceType: QuerySourceType.SEMANTIC_LAYER }
    >,
    explore: Explore,
    { granularity, xAxisFieldId }: DateZoom & { granularity: string },
): string | null => {
    if (isDateZoomRefusedOnExplore(explore)) return null;
    const allDimensions = getAllDimensionsMap(explore);
    const timeDimensions = getTimeDimensionsMap(explore);
    const dateDimensions = node.dimensions.flatMap((fieldId) => {
        const base = resolveToBaseTimeDimension(
            fieldId,
            allDimensions,
            timeDimensions,
        );
        return base ? [{ fieldId, base }] : [];
    });
    const target =
        dateDimensions.find(({ fieldId }) => fieldId === xAxisFieldId) ??
        dateDimensions[0];
    if (!target) return null;
    // As updateExploreWithDateZoom: a custom grain needs its precompiled dimension
    const canZoom = isStandardDateGranularity(granularity)
        ? !(
              target.base.type === DimensionType.DATE &&
              isSubDayGranularity(granularity)
          )
        : Object.values(explore.tables).some(
              (table) =>
                  !!table.dimensions[`${target.base.name}_${granularity}`],
          );
    return canZoom ? target.fieldId : null;
};

/** The field a stored chart plots on its x axis, if it is a cartesian chart. */
export const getStoredChartXField = (
    chart: ComposerStoredChart,
): string | undefined =>
    isCartesianChartConfig(chart.chartConfig.config)
        ? chart.chartConfig.config.layout?.xField
        : undefined;

/** Merge legs stay unzoomed: the merge compiles against their saved fields. */
export const getComposerNodeDateZooms = ({
    nodes,
    exploreByNodeId,
    dateZoom,
}: {
    nodes: ComposerChartPipelineNode[];
    exploreByNodeId: ComposerNodeExplores;
    dateZoom: DateZoom | null;
}): Record<string, DateZoom> => {
    const granularity = dateZoom?.granularity;
    if (!granularity) return {};
    const mergeLegs = new Set(
        nodes.flatMap((node) =>
            node.sourceType === QuerySourceType.MERGE
                ? node.sources.map((source) => source.nodeId)
                : [],
        ),
    );
    return Object.fromEntries(
        nodes.flatMap((node) => {
            const explore = exploreByNodeId[node.nodeId];
            if (
                node.sourceType !== QuerySourceType.SEMANTIC_LAYER ||
                !explore ||
                mergeLegs.has(node.nodeId)
            )
                return [];
            const xAxisFieldId = getNodeDateZoomFieldId(node, explore, {
                ...dateZoom,
                granularity,
            });
            return xAxisFieldId
                ? [[node.nodeId, { granularity, xAxisFieldId }]]
                : [];
        }),
    );
};
