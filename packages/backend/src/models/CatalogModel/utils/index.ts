import {
    CatalogType,
    convertToAiHints,
    DEFAULT_SPOTLIGHT_CONFIG,
    Explore,
    FieldType,
    friendlyName,
    getItemId,
    isExploreError,
    isMetric,
    type CatalogFieldMap,
    type CatalogFieldWhere,
    type ChartFieldChanges,
    type ChartFieldUpdates,
    type ChartFieldUsageChanges,
    type ExploreError,
    type Metric,
} from '@lightdash/common';
import { uniq } from 'lodash';
import {
    DbCatalogIn,
    type DbCatalog,
    type DbMetricsTreeEdgeIn,
} from '../../../database/entities/catalog';
import { DbTag } from '../../../database/entities/tags';

const getSpotlightShow = (
    spotlight?: Explore['spotlight'] | Metric['spotlight'],
) => {
    const visibility =
        spotlight?.visibility || DEFAULT_SPOTLIGHT_CONFIG.default_visibility;

    return visibility === 'show';
};

type CatalogInsertWithYamlTags = Omit<DbCatalogIn, 'owner_user_uuid'> & {
    assigned_yaml_tags?: DbTag[];
    ownerEmail: string | null;
};

export type MetricTreeEdge = {
    sourceMetricName: string;
    sourceTableName: string;
    targetMetricName: string;
    targetTableName: string;
};

/**
 * Parse a metric reference in the format 'metric_name' or 'table.metric_name'
 * @param ref - The metric reference string
 * @param defaultTable - The table to use if no table is specified
 * @returns Object with table and metric names
 */
const parseMetricRef = (
    ref: string,
    defaultTable: string,
): { table: string; metric: string } => {
    const parts = ref.split('.');
    if (parts.length === 2) {
        return { table: parts[0], metric: parts[1] };
    }
    return { table: defaultTable, metric: ref };
};

export const convertExploresToCatalog = (
    projectUuid: string,
    cachedExplores: (Explore & { cachedExploreUuid: string })[],
    projectYamlTags: DbTag[],
): {
    catalogInserts: CatalogInsertWithYamlTags[];
    catalogFieldMap: CatalogFieldMap;
    numberOfCategoriesApplied: number;
    yamlEdges: MetricTreeEdge[];
} => {
    // Track fields' ids and names to calculate their chart usage
    const catalogFieldMap: CatalogFieldMap = {};

    let numberOfCategoriesApplied = 0;

    // Collect YAML-defined metric edges
    const yamlEdges: MetricTreeEdge[] = [];

    // Build map of base explore field names per baseTable
    // Used to avoid duplicating fields for additional explores
    const baseExploreFieldsByTable = new Map<string, Set<string>>();
    cachedExplores.forEach((explore) => {
        const isBaseExplore = explore.name === explore.baseTable;
        if (isBaseExplore) {
            const baseTable = explore?.tables?.[explore.baseTable];
            const fieldNames = new Set([
                ...Object.keys(baseTable?.dimensions || {}),
                ...Object.keys(baseTable?.metrics || {}),
            ]);
            baseExploreFieldsByTable.set(explore.baseTable, fieldNames);
        }
    });

    const catalogInserts = cachedExplores.reduce<CatalogInsertWithYamlTags[]>(
        (acc, explore) => {
            const baseTable = explore?.tables?.[explore.baseTable];
            const isAdditionalExplore = explore.name !== explore.baseTable;

            const table: CatalogInsertWithYamlTags = {
                project_uuid: projectUuid,
                cached_explore_uuid: explore.cachedExploreUuid,
                name: explore.name,
                label: explore.label || null,
                description: baseTable?.description || null,
                type: CatalogType.Table,
                required_attributes: baseTable.requiredAttributes ?? {}, // ! Initializing as {} so it is not NULL in the database which means it can't be accessed
                chart_usage: null, // Tables don't have chart usage
                table_name: explore.baseTable,
                spotlight_show: getSpotlightShow(explore.spotlight),
                yaml_tags:
                    Array.isArray(explore.tags) && explore.tags.length > 0
                        ? explore.tags
                        : null,
                ai_hints: convertToAiHints(explore.aiHint) ?? null,
                joined_tables: explore.joinedTables.map((t) => t.table),
                ownerEmail: null, // Tables don't have owners (only metrics)
            };

            let dimensionsAndMetrics = [
                ...Object.values(baseTable?.dimensions || {}).filter(
                    (d) => !d.isIntervalBase,
                ),
                ...Object.values(baseTable?.metrics || {}),
            ].filter((f) => !f.hidden); // Filter out hidden fields from catalog

            // For additional explores, only index fields NOT in base explore
            // This avoids duplicate entries for the same metric/dimension
            if (isAdditionalExplore) {
                const baseFieldNames = baseExploreFieldsByTable.get(
                    explore.baseTable,
                );
                if (baseFieldNames) {
                    dimensionsAndMetrics = dimensionsAndMetrics.filter(
                        (field) => !baseFieldNames.has(field.name),
                    );
                }
            }

            const fields = dimensionsAndMetrics.map<CatalogInsertWithYamlTags>(
                (field) => {
                    catalogFieldMap[getItemId(field)] = {
                        fieldName: field.name,
                        tableName: field.table,
                        cachedExploreUuid: explore.cachedExploreUuid,
                        fieldType: field.fieldType,
                    };
                    const fieldIsMetric = isMetric(field);

                    const assignedYamlTags = fieldIsMetric
                        ? projectYamlTags.filter(
                              (tag) =>
                                  tag.yaml_reference &&
                                  field.spotlight?.categories?.includes(
                                      tag.yaml_reference,
                                  ),
                          )
                        : [];

                    if (assignedYamlTags.length > 0) {
                        numberOfCategoriesApplied += assignedYamlTags.length;
                    }

                    // Extract YAML-defined metric drivers (driver → current metric)
                    if (fieldIsMetric && field.drivers) {
                        field.drivers.forEach((driverRef) => {
                            const { table: driverTable, metric: driverMetric } =
                                parseMetricRef(driverRef, field.table);
                            yamlEdges.push({
                                sourceMetricName: driverMetric, // Driver is source
                                sourceTableName: driverTable,
                                targetMetricName: field.name, // Current metric is target
                                targetTableName: field.table,
                            });
                        });
                    }

                    // Metric owner takes precedence over explore/model owner
                    const metricOwner = fieldIsMetric
                        ? field.spotlight?.owner
                        : undefined;
                    const owner =
                        metricOwner ?? explore.spotlight?.owner ?? null;

                    return {
                        project_uuid: projectUuid,
                        cached_explore_uuid: explore.cachedExploreUuid,
                        name: field.name,
                        label: field.label || friendlyName(field.name),
                        description: field.description || null,
                        type: CatalogType.Field,
                        field_type: field.fieldType,
                        required_attributes:
                            field.requiredAttributes ??
                            baseTable.requiredAttributes ??
                            {}, // ! Initializing as {} so it is not NULL in the database which means it can't be accessed
                        chart_usage: 0, // Fields are initialized with 0 chart usage
                        table_name: explore.baseTable,
                        spotlight_show: getSpotlightShow(
                            fieldIsMetric ? field.spotlight : explore.spotlight,
                        ),
                        assigned_yaml_tags: assignedYamlTags,
                        yaml_tags:
                            Array.isArray(field.tags) && field.tags.length > 0
                                ? field.tags
                                : null,
                        ai_hints: convertToAiHints(field.aiHint) ?? null,
                        joined_tables: null,
                        ownerEmail: owner,
                    };
                },
            );

            return [...acc, table, ...fields];
        },
        [],
    );

    return {
        catalogInserts,
        catalogFieldMap,
        numberOfCategoriesApplied,
        yamlEdges,
    };
};

export function getTableNamesByFieldIds(
    fieldIds: string[],
    fieldType: FieldType,
    explore: Explore | ExploreError,
) {
    if (isExploreError(explore)) {
        return {};
    }

    const tableNameByFieldIdEntries = fieldIds.map<
        [string, string | undefined]
    >((fieldId) => {
        const table = Object.values(explore.tables).find((exploreTable) => {
            if (fieldType === FieldType.DIMENSION) {
                return Object.values(exploreTable.dimensions).some(
                    (dimension) =>
                        getItemId({
                            table:
                                exploreTable.originalName ?? exploreTable.name,
                            name: dimension.name,
                        }) === fieldId,
                );
            }

            return Object.values(exploreTable.metrics).some(
                (metric) =>
                    getItemId({
                        table: exploreTable.originalName ?? exploreTable.name,
                        name: metric.name,
                    }) === fieldId,
            );
        });

        if (!table) {
            return [fieldId, undefined];
        }

        return [fieldId, table.originalName ?? table.name];
    });

    return Object.fromEntries(tableNameByFieldIdEntries);
}

export function getChartFieldChanges({
    oldChartFields,
    newChartFields,
}: ChartFieldUpdates): ChartFieldChanges {
    const addedDimensions = newChartFields.dimensions.filter(
        (field) => !oldChartFields.dimensions.includes(field),
    );

    const addedMetrics = newChartFields.metrics.filter(
        (field) => !oldChartFields.metrics.includes(field),
    );

    const removedDimensions = oldChartFields.dimensions.filter(
        (field) => !newChartFields.dimensions.includes(field),
    );

    const removedMetrics = oldChartFields.metrics.filter(
        (field) => !newChartFields.metrics.includes(field),
    );

    return {
        added: {
            dimensions: addedDimensions,
            metrics: addedMetrics,
        },
        removed: {
            dimensions: removedDimensions,
            metrics: removedMetrics,
        },
    };
}

export function getCatalogFieldWhereStatements(
    fieldIds: string[],
    fieldTableNameMap: Record<string, string | undefined>,
    cachedExploreUuidTableNameMap: Record<string, string>,
    fieldType: FieldType,
): Array<CatalogFieldWhere> {
    return fieldIds
        .map((fieldId) => {
            const tableName = fieldTableNameMap[fieldId];
            const cachedExploreUuid =
                tableName && cachedExploreUuidTableNameMap[tableName];

            if (!cachedExploreUuid) {
                return undefined;
            }

            return {
                cachedExploreUuid,
                fieldName: fieldId.replace(`${tableName}_`, ''),
                fieldType,
            };
        })
        .filter((fieldWhere): fieldWhere is CatalogFieldWhere => !!fieldWhere);
}

export async function getChartFieldUsageChanges(
    projectUuid: string,
    chartExplore: Explore | ExploreError,
    chartFields: ChartFieldUpdates,
    getCachedExploresTableNameMap: (
        projectUuid: string,
        tableNames: string[],
    ) => Promise<Record<string, string>>,
): Promise<ChartFieldUsageChanges> {
    const chartFieldChanges = getChartFieldChanges(chartFields);
    const { added, removed } = chartFieldChanges;

    const metricTableNameMap = getTableNamesByFieldIds(
        [...added.metrics, ...removed.metrics],
        FieldType.METRIC,
        chartExplore,
    );

    const dimensionTableNameMap = getTableNamesByFieldIds(
        [...added.dimensions, ...removed.dimensions],
        FieldType.DIMENSION,
        chartExplore,
    );

    const cachedExploreUuidTableNameMap = await getCachedExploresTableNameMap(
        projectUuid,
        uniq(
            [
                ...Object.values(dimensionTableNameMap),
                ...Object.values(metricTableNameMap),
            ].filter(
                (tableName): tableName is string => tableName !== undefined,
            ),
        ),
    );

    const metricsToIncrement = getCatalogFieldWhereStatements(
        chartFieldChanges.added.metrics,
        metricTableNameMap,
        cachedExploreUuidTableNameMap,
        FieldType.METRIC,
    );

    const metricsToDecrement = getCatalogFieldWhereStatements(
        chartFieldChanges.removed.metrics,
        metricTableNameMap,
        cachedExploreUuidTableNameMap,
        FieldType.METRIC,
    );

    const dimensionsToIncrement = getCatalogFieldWhereStatements(
        chartFieldChanges.added.dimensions,
        dimensionTableNameMap,
        cachedExploreUuidTableNameMap,
        FieldType.DIMENSION,
    );

    const dimensionsToDecrement = getCatalogFieldWhereStatements(
        chartFieldChanges.removed.dimensions,
        dimensionTableNameMap,
        cachedExploreUuidTableNameMap,
        FieldType.DIMENSION,
    );

    return {
        fieldsToIncrement: [...metricsToIncrement, ...dimensionsToIncrement],
        fieldsToDecrement: [...metricsToDecrement, ...dimensionsToDecrement],
    };
}

export type InvalidYamlEdgeReason =
    | 'self_reference'
    | 'source_not_found'
    | 'target_not_found'
    | 'both_not_found';

export type InvalidYamlEdge = {
    edge: MetricTreeEdge;
    reason: InvalidYamlEdgeReason;
};

export type BuildYamlMetricTreeEdgesResult = {
    edges: DbMetricsTreeEdgeIn[];
    invalidEdges: InvalidYamlEdge[];
};

export const buildYamlMetricTreeEdges = ({
    yamlEdges,
    catalogRows,
    projectUuid,
    userUuid,
}: {
    yamlEdges: MetricTreeEdge[];
    catalogRows: Pick<
        DbCatalog,
        'field_type' | 'table_name' | 'name' | 'catalog_search_uuid'
    >[];
    projectUuid: string;
    userUuid?: string | null;
}): BuildYamlMetricTreeEdgesResult => {
    const metricUuidMap = new Map<string, string>();
    catalogRows
        .filter((r) => r.field_type === FieldType.METRIC)
        .forEach((r) => {
            metricUuidMap.set(
                `${r.table_name}.${r.name}`,
                r.catalog_search_uuid,
            );
        });

    const invalidEdges: InvalidYamlEdge[] = [];

    const validYamlEdges = yamlEdges
        .filter((edge) => {
            const isSelfReference =
                edge.sourceMetricName === edge.targetMetricName &&
                edge.sourceTableName === edge.targetTableName;
            if (isSelfReference) {
                invalidEdges.push({ edge, reason: 'self_reference' });
                return false;
            }
            return true;
        })
        .map((edge) => {
            const sourceUuid = metricUuidMap.get(
                `${edge.sourceTableName}.${edge.sourceMetricName}`,
            );
            const targetUuid = metricUuidMap.get(
                `${edge.targetTableName}.${edge.targetMetricName}`,
            );
            if (!sourceUuid || !targetUuid) {
                const reason: InvalidYamlEdgeReason =
                    // eslint-disable-next-line no-nested-ternary
                    !sourceUuid && !targetUuid
                        ? 'both_not_found'
                        : !sourceUuid
                          ? 'source_not_found'
                          : 'target_not_found';
                invalidEdges.push({ edge, reason });
                return null;
            }
            return {
                source_metric_catalog_search_uuid: sourceUuid,
                target_metric_catalog_search_uuid: targetUuid,
                project_uuid: projectUuid,
                created_by_user_uuid: userUuid ?? null,
                source: 'yaml' as const,
            };
        })
        .filter((edge): edge is NonNullable<typeof edge> => edge !== null);

    const uniqueEdges = Array.from(
        new Map(
            validYamlEdges.map((edge) => [
                `${edge.source_metric_catalog_search_uuid}-${edge.target_metric_catalog_search_uuid}`,
                edge,
            ]),
        ).values(),
    );

    return { edges: uniqueEdges, invalidEdges };
};
