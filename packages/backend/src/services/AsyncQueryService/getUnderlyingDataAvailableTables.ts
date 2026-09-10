import { isField, type Explore, type ItemsMap } from '@lightdash/common';

// The base table is always in the FROM clause, so it is always available.
export const getUnderlyingDataAvailableTables = (
    explore: Pick<Explore, 'baseTable' | 'joinedTables'>,
    metricQueryFields: ItemsMap,
): Set<string> =>
    new Set([
        explore.baseTable,
        ...explore.joinedTables.map((joinedTable) => joinedTable.table),
        ...Object.values(metricQueryFields)
            .filter(isField)
            .map((field) => field.table),
    ]);
