import {
    addDashboardFiltersToMetricQuery,
    assertUnreachable,
    DimensionType,
    getAllDimensionsMap,
    getAvailableParametersFromTables,
    getChartZoomableFields,
    getDashboardFilterRulesForTileAndReferences,
    getDashboardFiltersForTile,
    getDashboardTileParameterOverrides,
    getEffectiveParameterDefinitions,
    getItemId,
    getParameterReferences,
    getQueryParameterReferences,
    getTimeDimensionsMap,
    isCartesianChartConfig,
    isDateZoomRefusedOnExplore,
    isStandardDateGranularity,
    isSubDayGranularity,
    MERGE_TABLE_NAME,
    metricQueryOfSemanticNode,
    QuerySourceType,
    resolveToBaseTimeDimension,
    type ChartZoomableField,
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

// As updateExploreWithDateZoom: no sub-day grain on a date, and a custom grain needs its precompiled dimension
const canZoomField = (
    explore: Explore,
    fieldId: string,
    granularity: string,
): boolean => {
    const base = resolveToBaseTimeDimension(
        fieldId,
        getAllDimensionsMap(explore),
        getTimeDimensionsMap(explore),
    );
    if (!base) return false;
    return isStandardDateGranularity(granularity)
        ? !(
              base.type === DimensionType.DATE &&
              isSubDayGranularity(granularity)
          )
        : Object.values(explore.tables).some(
              (table) => !!table.dimensions[`${base.name}_${granularity}`],
          );
};

/** The field a stored chart plots on its x axis, if it is a cartesian chart. */
export const getStoredChartXField = (
    chart: ComposerStoredChart,
): string | undefined =>
    isCartesianChartConfig(chart.chartConfig.config)
        ? chart.chartConfig.config.layout?.xField
        : undefined;

type ZoomCandidates = Map<
    string,
    { explore: Explore; fields: ChartZoomableField[] }
>;

/** Each semantic-layer node that can zoom, with its zoomable date fields. */
const getZoomCandidates = (
    nodes: ComposerChartPipelineNode[],
    exploreByNodeId: ComposerNodeExplores,
): ZoomCandidates =>
    new Map(
        nodes.flatMap((node) => {
            const explore = exploreByNodeId[node.nodeId];
            return node.sourceType === QuerySourceType.SEMANTIC_LAYER &&
                explore &&
                !isDateZoomRefusedOnExplore(explore)
                ? [
                      [
                          node.nodeId,
                          {
                              explore,
                              fields: getChartZoomableFields(
                                  explore,
                                  metricQueryOfSemanticNode(node),
                              ),
                          },
                      ] as const,
                  ]
                : [];
        }),
    );

/** Every merge leg, and per merge the key parts that are a zoomable date on all its legs. */
const getMergeDateKeys = (
    nodes: ComposerChartPipelineNode[],
    candidates: ZoomCandidates,
) => {
    const merges = nodes.flatMap((node) =>
        node.sourceType === QuerySourceType.MERGE ? [node] : [],
    );
    const legs = merges.flatMap(({ sources }) =>
        sources.map((source) => source.nodeId),
    );
    // A leg of two merges could need two grains, so neither zooms
    const sharedLeg = legs.some((leg, index) => legs.indexOf(leg) !== index);
    return {
        legs,
        merges: sharedLeg
            ? []
            : merges.map(({ nodeId, sources, joinKey }) => {
                  const legIds = sources.map((source) => source.nodeId);
                  return {
                      nodeId,
                      legIds,
                      dateParts: joinKey.filter((part) =>
                          legIds.every((leg) =>
                              candidates
                                  .get(leg)
                                  ?.fields.some(
                                      ({ fieldId }) =>
                                          fieldId ===
                                          part.fieldIdBySourceId[leg],
                                  ),
                          ),
                      ),
                  };
              }),
    };
};

type ZoomTarget = {
    nodeId: string;
    explore: Explore;
    field: ChartZoomableField;
    /** Nodes that zoom together or not at all: a merge's legs, else the node alone. */
    group: string;
};

/** The date field each semantic-layer node would re-grain; a merge's legs zoom one date key part, the targeted one first. */
const getZoomTargets = (
    nodes: ComposerChartPipelineNode[],
    exploreByNodeId: ComposerNodeExplores,
    xAxisFieldId: string | undefined,
): ZoomTarget[] => {
    const candidates = getZoomCandidates(nodes, exploreByNodeId);
    const { legs, merges } = getMergeDateKeys(nodes, candidates);
    const legFields = new Map(
        merges.flatMap(({ nodeId, legIds, dateParts }) => {
            // A dashboard targets a leg's field; a stored chart plots the merged key
            const part =
                dateParts.find(
                    ({ name, fieldIdBySourceId }) =>
                        getItemId({ table: MERGE_TABLE_NAME, name }) ===
                            xAxisFieldId ||
                        Object.values(fieldIdBySourceId).some(
                            (fieldId) => fieldId === xAxisFieldId,
                        ),
                ) ?? dateParts[0];
            return part
                ? legIds.map(
                      (leg) =>
                          [
                              leg,
                              {
                                  fieldId: part.fieldIdBySourceId[leg],
                                  group: nodeId,
                              },
                          ] as const,
                  )
                : [];
        }),
    );
    return [...candidates].flatMap(([nodeId, { explore, fields }]) => {
        if (legs.includes(nodeId)) {
            const leg = legFields.get(nodeId);
            const field = fields.find(
                ({ fieldId }) => fieldId === leg?.fieldId,
            );
            return leg && field
                ? [{ nodeId, explore, field, group: leg.group }]
                : [];
        }
        const field =
            fields.find(({ fieldId }) => fieldId === xAxisFieldId) ?? fields[0];
        return field ? [{ nodeId, explore, field, group: nodeId }] : [];
    });
};

/** The date fields a composer tile can be zoomed on, one per field id: a merge leg offers only its date key fields. */
export const getComposerZoomableFields = (
    nodes: ComposerChartPipelineNode[],
    exploreByNodeId: ComposerNodeExplores,
): ChartZoomableField[] => {
    const candidates = getZoomCandidates(nodes, exploreByNodeId);
    const { legs, merges } = getMergeDateKeys(nodes, candidates);
    const keyFieldsByLeg = new Map(
        merges.flatMap(({ legIds, dateParts }) =>
            legIds.map(
                (leg) =>
                    [
                        leg,
                        new Set(
                            dateParts.map(
                                (part) => part.fieldIdBySourceId[leg],
                            ),
                        ),
                    ] as const,
            ),
        ),
    );
    return [
        ...new Map(
            [...candidates]
                .flatMap(([nodeId, { fields }]) =>
                    legs.includes(nodeId)
                        ? fields.filter(({ fieldId }) =>
                              keyFieldsByLeg.get(nodeId)?.has(fieldId),
                          )
                        : fields,
                )
                .map((field) => [field.fieldId, field]),
        ).values(),
    ];
};

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
    const targets = getZoomTargets(
        nodes,
        exploreByNodeId,
        dateZoom.xAxisFieldId,
    );
    const refusedGroups = new Set(
        targets
            .filter(
                ({ explore, field }) =>
                    !canZoomField(explore, field.fieldId, granularity),
            )
            .map(({ group }) => group),
    );
    return Object.fromEntries(
        targets
            .filter(({ group }) => !refusedGroups.has(group))
            .map(({ nodeId, field }) => [
                nodeId,
                { granularity, xAxisFieldId: field.fieldId },
            ]),
    );
};
