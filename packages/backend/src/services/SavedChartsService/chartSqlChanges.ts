import {
    isCustomSqlDimension,
    isSqlTableCalculation,
    type CustomDimension,
    type SavedMergeDefinition,
    type SavedMergeDefinitionQuery,
    type TableCalculation,
} from '@lightdash/common';

export const getChangedCustomSqlDimensionIds = (
    next: CustomDimension[] | undefined,
    saved: CustomDimension[] | undefined,
): string[] => {
    const savedById = new Map(
        (saved ?? []).filter(isCustomSqlDimension).map((dim) => [dim.id, dim]),
    );
    return (next ?? [])
        .filter(isCustomSqlDimension)
        .filter((dim) => savedById.get(dim.id)?.sql !== dim.sql)
        .map(({ id }) => id);
};

export const getChangedSqlTableCalculationNames = (
    next: TableCalculation[] | undefined,
    saved: TableCalculation[] | undefined,
): string[] => {
    const savedByName = new Map(
        (saved ?? []).filter(isSqlTableCalculation).map((tc) => [tc.name, tc]),
    );
    return (next ?? [])
        .filter(isSqlTableCalculation)
        .filter((tc) => savedByName.get(tc.name)?.sql !== tc.sql)
        .map(({ name }) => name);
};

/** Merge table calculations written in SQL; formulas need no SQL permission. */
export const getMergeSqlTableCalculations = (
    merge: SavedMergeDefinition | null,
): TableCalculation[] =>
    (merge?.tableCalculations ?? [])
        .filter((calculation) => !calculation.formula)
        .map(({ name, displayName, sql }) => ({ name, displayName, sql }));

/** Each source of `next`, beside the saved source of the same name and explore, if any. */
export const getMergeSourcePairs = (
    next: SavedMergeDefinition,
    saved: SavedMergeDefinition | null,
): {
    name: string;
    next: SavedMergeDefinitionQuery;
    saved: SavedMergeDefinitionQuery | null;
}[] =>
    Object.entries(next.queries).map(([name, query]) => {
        const savedQuery = saved?.queries[name];
        return {
            name,
            next: query,
            saved: savedQuery?.explore === query.explore ? savedQuery : null,
        };
    });
