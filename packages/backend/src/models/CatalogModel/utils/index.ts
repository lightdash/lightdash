import { CatalogType, Explore } from '@lightdash/common';
import { DbCatalogIn } from '../../../database/entities/catalog';

export const convertExploresToCatalog = (
    projectUuid: string,
    cachedExplores: (Explore & { cachedExploreUuid: string })[],
): DbCatalogIn[] =>
    cachedExplores.reduce<DbCatalogIn[]>((acc, explore) => {
        const baseTable = explore?.tables?.[explore.baseTable];
        const table: DbCatalogIn = {
            project_uuid: projectUuid,
            cached_explore_uuid: explore.cachedExploreUuid,
            name: explore.name,
            description: baseTable?.description || null,
            type: CatalogType.Table,
            required_attributes: baseTable.requiredAttributes ?? null,
        };

        const dimensionsAndMetrics = [
            ...Object.values(baseTable?.dimensions || {}).filter(
                (d) => !d.isIntervalBase,
            ),
            ...Object.values(baseTable?.metrics || {}),
        ].filter((f) => !f.hidden); // Filter out hidden fields from catalog

        const fields = dimensionsAndMetrics.map<DbCatalogIn>((field) => ({
            project_uuid: projectUuid,
            cached_explore_uuid: explore.cachedExploreUuid,
            name: field.name,
            description: field.description || null,
            type: CatalogType.Field,
            field_type: field.fieldType,
            required_attributes:
                field.requiredAttributes ??
                baseTable.requiredAttributes ??
                null,
        }));

        return [...acc, table, ...fields];
    }, []);
