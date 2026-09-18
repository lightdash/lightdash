import { getMergeTotalAggregation, type ItemsMap } from '@lightdash/common';

/** The table a merged result is exposed as to its totals statement. */
export const MERGE_TOTALS_REFERENCE_TABLE = 'merged_result';

export type MergeTotalsStatement = {
    /** One row: an exact aggregate per column that has one, aliased by field id. */
    sql: string;
    /** The columns the row carries, in the merged result's order. */
    fieldIds: string[];
};

const quote = (identifier: string) => `"${identifier.replaceAll('"', '""')}"`;

/**
 * Totals over a merged result's rows, on the compose engine. Columns with no
 * exact aggregate over merged rows are left out rather than approximated;
 * null when no column has one.
 */
export const buildMergeTotalsSql = (
    fieldIds: string[],
    itemsMap: ItemsMap,
    /** Columns a repeating source contributes; never exact over the rows. */
    repeatedFieldIds: string[] = [],
): MergeTotalsStatement | null => {
    const repeated = new Set(repeatedFieldIds);
    const totalled = fieldIds.flatMap((fieldId) => {
        const aggregation = getMergeTotalAggregation(
            itemsMap[fieldId],
            repeated.has(fieldId),
        );
        return aggregation === null ? [] : [{ fieldId, aggregation }];
    });
    if (totalled.length === 0) return null;
    const terms = totalled.map(
        ({ fieldId, aggregation }) =>
            `${aggregation.toUpperCase()}(${quote(fieldId)}) AS ${quote(fieldId)}`,
    );
    return {
        sql: [
            `SELECT ${terms.join(',\n       ')}`,
            `FROM ${quote(MERGE_TOTALS_REFERENCE_TABLE)}`,
        ].join('\n'),
        fieldIds: totalled.map(({ fieldId }) => fieldId),
    };
};
