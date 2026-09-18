import {
    assertUnreachable,
    type FieldId,
    type MergeColumnTotal,
} from '@lightdash/common';

/** The table a merged result is exposed as to its totals statement. */
export const MERGE_TOTALS_REFERENCE_TABLE = 'merged_result';

export type MergeTotalsStatement = {
    /** One row: a total per column that has one, aliased by field id. */
    sql: string;
    /** The columns the row carries, in the merged result's order. */
    fieldIds: FieldId[];
};

/** A source's grand total, exposed to the statement as a one-row table. */
export type MergeSourceTotalTable = {
    sourceId: string;
    table: string;
    /** The source metrics the row carries, by source field id. */
    sourceFieldIds: FieldId[];
};

const quote = (identifier: string) => `"${identifier.replaceAll('"', '""')}"`;

/**
 * Totals over a merged result, on the compose engine: an aggregate over the
 * merged rows where one is exact, else the column's own query's grand total
 * read from that source's one-row table. Columns with neither are left out
 * rather than approximated; null when no column has a total.
 */
export const buildMergeTotalsSql = ({
    fieldIds,
    columnTotals,
    sourceTotalTables,
}: {
    fieldIds: FieldId[];
    columnTotals: Record<FieldId, MergeColumnTotal>;
    sourceTotalTables: MergeSourceTotalTable[];
}): MergeTotalsStatement | null => {
    const tableBySourceId = new Map(
        sourceTotalTables.map((table) => [table.sourceId, table]),
    );
    const terms = fieldIds.flatMap(
        (fieldId): Array<{ fieldId: FieldId; term: string }> => {
            const total = columnTotals[fieldId];
            if (!total) return [];
            switch (total.from) {
                case 'mergedRows':
                    return [
                        {
                            fieldId,
                            term: `${total.aggregation.toUpperCase()}(${quote(fieldId)}) AS ${quote(fieldId)}`,
                        },
                    ];
                case 'sourceQuery': {
                    const table = tableBySourceId.get(total.sourceId);
                    if (
                        !table ||
                        !table.sourceFieldIds.includes(total.sourceFieldId)
                    ) {
                        return [];
                    }
                    return [
                        {
                            fieldId,
                            term: `(SELECT ${quote(total.sourceFieldId)} FROM ${quote(table.table)}) AS ${quote(fieldId)}`,
                        },
                    ];
                }
                case null:
                    return [];
                default:
                    return assertUnreachable(total, 'Unknown merge total');
            }
        },
    );
    if (terms.length === 0) return null;
    return {
        sql: [
            `SELECT ${terms.map(({ term }) => term).join(',\n       ')}`,
            `FROM ${quote(MERGE_TOTALS_REFERENCE_TABLE)}`,
        ].join('\n'),
        fieldIds: terms.map(({ fieldId }) => fieldId),
    };
};
