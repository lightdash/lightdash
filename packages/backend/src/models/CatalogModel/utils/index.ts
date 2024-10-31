import {
    CatalogType,
    Explore,
    getItemId,
    type CatalogFieldMap,
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
