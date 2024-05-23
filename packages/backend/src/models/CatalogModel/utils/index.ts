import { CatalogType, Explore } from '@lightdash/common';
import { DbCatalogIn } from '../../../database/entities/catalog';

export type ExploreCatalog = DbCatalogIn & { field_type?: string };

export const convertExploresToCatalog = (
    projectUuid: string,
    cachedExplores: (Explore & { cachedExploreUuid: string })[],
): ExploreCatalog[] =>
    cachedExplores.reduce<DbCatalogIn[]>((acc, explore) => {
        const baseTable = explore?.tables?.[explore.baseTable];
        const table: DbCatalogIn = {
            project_uuid: projectUuid,
            cached_explore_uuid: explore.cachedExploreUuid,
            name: explore.name,
            description: baseTable?.description || null,
            type: CatalogType.Table,
        };
        const dimensionsAndMetrics = [
            ...Object.values(baseTable?.dimensions || {}),
            ...Object.values(baseTable?.metrics || {}),
        ];
        const fields = dimensionsAndMetrics.map<DbCatalogIn>((field) => ({
            project_uuid: projectUuid,
            cached_explore_uuid: explore.cachedExploreUuid,
            name: field.name,
            description: field.description || null,
            type: CatalogType.Field,
            field_type: field.fieldType,
        }));

        return [...acc, table, ...fields];
    }, []);
