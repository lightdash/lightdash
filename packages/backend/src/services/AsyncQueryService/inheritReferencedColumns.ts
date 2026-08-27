import { type DimensionType, type ResultColumns } from '@lightdash/common';

/** One query a compose statement references, with its persisted columns. */
export type ReferencedQueryColumns = {
    queryUuid: string;
    columns: ResultColumns | null;
};

/**
 * Column metadata a compose query's output inherits from the queries it
 * references (docs/composer-viz-plan/01-design.md §3, DuckDB compose rule).
 *
 * A probed output column is a pass-through when its name matches exactly one
 * referenced column across all references AND the probed type matches. It
 * inherits that column's display metadata and provenance, scoped to the
 * referenced query via sourceQueryUuid — kept as-is when the referenced
 * column already carries one, because its fieldId keys into that deeper
 * query's fields map.
 *
 * Ambiguous names (present in two or more references) and computed columns
 * (no match or type mismatch) inherit nothing. Known accuracy ceiling:
 * `SUM(revenue) AS revenue` still false-positives on name; the type-match
 * requirement narrows it, and only a SQL parser would eliminate it.
 */
export function getInheritedReferencedColumns(
    probedColumns: Array<{ name: string; type: DimensionType }>,
    references: ReferencedQueryColumns[],
): ResultColumns {
    return probedColumns.reduce<ResultColumns>((acc, probed) => {
        const matches = references.flatMap((ref) => {
            const column = ref.columns?.[probed.name];
            return column ? [{ queryUuid: ref.queryUuid, column }] : [];
        });
        if (matches.length !== 1) return acc;
        const [{ queryUuid, column }] = matches;
        if (column.type !== probed.type) return acc;
        acc[probed.name] = {
            ...column,
            reference: probed.name,
            type: probed.type,
            ...(column.provenance
                ? {
                      provenance: {
                          ...column.provenance,
                          sourceQueryUuid:
                              column.provenance.sourceQueryUuid ?? queryUuid,
                      },
                  }
                : {}),
        };
        return acc;
    }, {});
}
