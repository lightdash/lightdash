import {
    CatalogType,
    Explore,
    getItemId,
    isExploreError,
    type CatalogFieldMap,
    type CatalogFieldWhere,
    type ExploreError,
} from '@lightdash/common';
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

export async function getCatalogFieldWhereByFieldIds(
    projectUuid: string,
    fieldIds: string[],
    explore: Explore | ExploreError,
    findTablesCachedExploreUuid: (
        projectUuid: string,
        tableNames: string[],
    ) => Promise<Record<string, string>>,
) {
    if (isExploreError(explore)) {
        return {};
    }

    const tableNameByFieldIdEntries = fieldIds.map<
        [string, string | undefined]
    >((fieldId) => {
        const table = Object.values(explore.tables).find(
            (exploreTable) =>
                Object.values(exploreTable.dimensions).some(
                    (dimension) =>
                        getItemId({
                            table:
                                exploreTable.originalName ?? exploreTable.name,
                            name: dimension.name,
                        }) === fieldId,
                ) ||
                Object.values(exploreTable.metrics).some(
                    (metric) =>
                        getItemId({
                            table:
                                exploreTable.originalName ?? exploreTable.name,
                            name: metric.name,
                        }) === fieldId,
                ),
        );

        if (!table) {
            return [fieldId, undefined];
        }

        return [fieldId, table.originalName ?? table.name];
    });

    const tableNameByFieldIds = Object.fromEntries(tableNameByFieldIdEntries);

    const tableNames = Object.values(tableNameByFieldIds).filter(
        (tableName): tableName is string => tableName !== undefined,
    );

    const cachedExploreUuidsByTableName = await findTablesCachedExploreUuid(
        projectUuid,
        tableNames,
    );

    return Object.fromEntries(
        Object.entries(tableNameByFieldIds).map<
            [string, CatalogFieldWhere | undefined]
        >(([fieldId, tableName]) => {
            const cachedExploreUuid =
                tableName && cachedExploreUuidsByTableName[tableName];

            if (!cachedExploreUuid) {
                return [fieldId, undefined];
            }

            return [
                fieldId,
                {
                    cachedExploreUuid,
                    fieldName: fieldId.replace(`${tableName}_`, ''),
                },
            ];
        }),
    );
}

export async function getChartUsageFieldsToUpdate(
    projectUuid: string,
    chartExplore: Explore | ExploreError,
    {
        oldChartFields,
        newChartFields,
    }: {
        oldChartFields: string[];
        newChartFields: string[];
    },
    findTablesCachedExploreUuid: (
        projectUuid: string,
        tableNames: string[],
    ) => Promise<Record<string, string>>,
) {
    const addedFields = newChartFields.filter(
        (field) => !oldChartFields.includes(field),
    );

    const removedFields = oldChartFields.filter(
        (field) => !newChartFields.includes(field),
    );

    const catalogFieldWhereByFieldId = await getCatalogFieldWhereByFieldIds(
        projectUuid,
        [...addedFields, ...removedFields],
        chartExplore,
        findTablesCachedExploreUuid,
    );

    const fieldsToIncrement: CatalogFieldWhere[] = addedFields
        .map((fieldId) => catalogFieldWhereByFieldId[fieldId])
        .filter(
            (fieldWhere): fieldWhere is CatalogFieldWhere =>
                fieldWhere !== undefined,
        );

    const fieldsToDecrement: CatalogFieldWhere[] = removedFields
        .map((fieldId) => catalogFieldWhereByFieldId[fieldId])
        .filter(
            (fieldWhere): fieldWhere is CatalogFieldWhere =>
                fieldWhere !== undefined,
        );

    return {
        fieldsToIncrement,
        fieldsToDecrement,
    };
}
