import {
    CatalogField,
    CatalogTable,
    CatalogType,
    Explore,
} from '@lightdash/common';
import { DbCatalogIn } from '../../../database/entities/catalog';

export const convertExploresToCatalog = (
    projectUuid: string,
    cachedExplores: (Explore & { cachedExploreUuid: string })[],
): DbCatalogIn[] =>
    cachedExplores.reduce<DbCatalogIn[]>((acc, explore) => {
        const baseTable = explore?.tables?.[explore.baseTable];
        const table = {
            project_uuid: projectUuid,
            cached_explore_uuid: explore.cachedExploreUuid,
            name: explore.name,
            description: baseTable?.description || null,
            type: CatalogType.Table,
        };
        const dimensionsAndMetrics = [
            ...Object.values(baseTable?.dimensions || []),
            ...Object.values(baseTable?.metrics || []),
        ];
        const fields = dimensionsAndMetrics.map((field) => ({
            project_uuid: projectUuid,
            cached_explore_uuid: explore.cachedExploreUuid,
            name: field.name,
            description: field.description || null,
            type: CatalogType.Field,
        }));
        return [...acc, table, ...fields];
    }, []);
