import { isField, type Explore, type ItemsMap } from '@lightdash/common';

/**
 * Tables whose fields may appear in an "underlying data" query.
 *
 * The base table is always part of the FROM clause, and every joined table
 * is reachable through the explore's join graph, so both are always
 * available. Tables of the fields in the source query are included too, so
 * a table that is neither the base nor a declared join (e.g. an additional
 * metric's table) is not dropped.
 */
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
