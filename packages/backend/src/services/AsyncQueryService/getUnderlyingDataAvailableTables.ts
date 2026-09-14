import { isField, type Explore, type ItemsMap } from '@lightdash/common';

const nestedAncestors = (
    tables: Explore['tables'],
    table: string,
): string[] => {
    const parent = tables[table]?.nestedFrom?.parentTable;
    return parent ? [parent, ...nestedAncestors(tables, parent)] : [];
};

// Unnested virtual tables multiply rows, so only the ones the source query
// already reached (and their ancestors) belong in the underlying rows; the
// rest would cross-join every sibling array into the result.
export const getUnderlyingDataAvailableTables = (
    explore: Pick<Explore, 'baseTable' | 'joinedTables' | 'tables'>,
    metricQueryFields: ItemsMap,
): Set<string> => {
    const isNested = (table: string) =>
        explore.tables[table]?.nestedFrom !== undefined;
    const queriedTables = Object.values(metricQueryFields)
        .filter(isField)
        .map((field) => field.table);
    const reachedNestedTables = new Set(
        queriedTables
            .filter(isNested)
            .flatMap((table) => [
                table,
                ...nestedAncestors(explore.tables, table),
            ]),
    );
    return new Set([
        explore.baseTable,
        ...explore.joinedTables
            .map((joinedTable) => joinedTable.table)
            .filter(
                (table) => !isNested(table) || reachedNestedTables.has(table),
            ),
        ...queriedTables,
    ]);
};
