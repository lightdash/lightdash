import {
    CatalogType,
    Explore,
    FieldType,
    getItemId,
    isExploreError,
    type CatalogFieldMap,
    type CatalogFieldWhere,
    type ChartFieldChanges,
    type ChartFieldUpdates,
    type ChartFieldUsageChanges,
    type ExploreError,
} from '@lightdash/common';
import { uniq } from 'lodash';
import { DbCatalogIn } from '../../../database/entities/catalog';

export const convertExploresToCatalog = (
    projectUuid: string,
    cachedExplores: (Explore & { cachedExploreUuid: string })[],
): {
    catalogInserts: DbCatalogIn[];
    catalogFieldMap: CatalogFieldMap;
} => {
    // Track fields' ids and names to calculate their chart usage
    const catalogFieldMap: CatalogFieldMap = {};

    const catalogInserts = cachedExplores.reduce<DbCatalogIn[]>(
        (acc, explore) => {
            const baseTable = explore?.tables?.[explore.baseTable];
            const table: DbCatalogIn = {
                project_uuid: projectUuid,
                cached_explore_uuid: explore.cachedExploreUuid,
                name: explore.name,
                description: baseTable?.description || null,
                type: CatalogType.Table,
                required_attributes: baseTable.requiredAttributes ?? {}, // ! Initializing as {} so it is not NULL in the database which means it can't be accessed
                chart_usage: null, // Tables don't have chart usage
                table_name: explore.baseTable,
            };

            const dimensionsAndMetrics = [
                ...Object.values(baseTable?.dimensions || {}).filter(
                    (d) => !d.isIntervalBase,
                ),
                ...Object.values(baseTable?.metrics || {}),
            ].filter((f) => !f.hidden); // Filter out hidden fields from catalog

            const fields = dimensionsAndMetrics.map<DbCatalogIn>((field) => {
                catalogFieldMap[getItemId(field)] = {
                    fieldName: field.name,
                    tableName: field.table,
                    cachedExploreUuid: explore.cachedExploreUuid,
                    fieldType: field.fieldType,
                };

                return {
                    project_uuid: projectUuid,
                    cached_explore_uuid: explore.cachedExploreUuid,
                    name: field.name,
                    description: field.description || null,
                    type: CatalogType.Field,
                    field_type: field.fieldType,
                    required_attributes:
                        field.requiredAttributes ??
                        baseTable.requiredAttributes ??
                        {}, // ! Initializing as {} so it is not NULL in the database which means it can't be accessed
                    chart_usage: 0, // Fields are initialized with 0 chart usage
                    table_name: explore.baseTable,
                };
            });

            return [...acc, table, ...fields];
        },
        [],
    );

    return {
        catalogInserts,
        catalogFieldMap,
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
