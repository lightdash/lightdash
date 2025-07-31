import type { Explore } from '../types/explore';

export const findFieldInExplores = (
    explores: Explore[],
    tableName: string,
    fieldName: string,
) => {
    const matchingExplore = explores.find(
        (explore) => explore.tables[tableName],
    );
    if (!matchingExplore) return null;

    const table = matchingExplore.tables[tableName];
    if (!table) return null;

    if (table.dimensions[fieldName]) return table.dimensions[fieldName];
    if (table.metrics[fieldName]) return table.metrics[fieldName];
    return null;
};
