import { SortField } from '@lightdash/common';
import { tableFromJSON, tableToIPC } from 'apache-arrow';
import { Database } from 'duckdb-async';

const getNullsFirstLast = (sort: SortField) => {
    if (sort.nullsFirst === undefined) return '';
    return sort.nullsFirst ? ' NULLS FIRST' : ' NULLS LAST';
};

export const getPivotedResults = async (
    rows: Record<string, unknown>[],
    fieldsMap: Record<string, unknown>,
    pivotFields: string[],
    metrics: string[],
    sorts: SortField[],
) => {
    const fields = Object.keys(fieldsMap);
    const arrowTable = tableFromJSON(rows);
    const db = await Database.create(':memory:');
    await db.exec('INSTALL arrow; LOAD arrow;');
    await db.register_buffer('results_data', [tableToIPC(arrowTable)], true);
    const usingFields = metrics.map((metric) => `FIRST(${metric})`);

    // Get the grouping columns (all non-pivot, non-metric fields)
    const groupByFields = fields.filter(
        (field) => !pivotFields.includes(field) && !metrics.includes(field),
    );

    // After pivoting, we can only sort by:
    // 1. Columns in the GROUP BY clause (groupByFields)
    // 2. The new pivoted columns (which we don't know yet)
    // We CANNOT sort by the original metric columns (they no longer exist after USING aggregation)
    const validSorts = sorts.filter((sort) =>
        groupByFields.includes(sort.fieldId),
    );

    const orderByPart = validSorts.length
        ? `ORDER BY ${validSorts
              .map(
                  (sort) =>
                      `${sort.fieldId} ${
                          sort.descending ? 'DESC' : 'ASC'
                      }${getNullsFirstLast(sort)}`,
              )
              .join(', ')}`
        : '';

    // Build GROUP BY clause if we have grouping fields
    const groupByPart = groupByFields.length
        ? `GROUP BY ${groupByFields.join(', ')}`
        : '';

    // For multiple pivot fields, create a composite key
    let query: string;
    if (pivotFields.length === 1) {
        query = `PIVOT results_data
    ON ${pivotFields[0]}
    USING ${usingFields.join(', ')}
    ${groupByPart}
    ${orderByPart}`;
    } else {
        // Create composite key by concatenating pivot fields with ' - ' separator
        const compositeKey = pivotFields
            .map((field) => `COALESCE(CAST(${field} AS VARCHAR), 'NULL')`)
            .join(" || ' - ' || ");
        query = `PIVOT (
        SELECT *, ${compositeKey} as __pivot_key__ FROM results_data
    )
    ON __pivot_key__
    USING ${usingFields.join(', ')}
    ${groupByPart}
    ${orderByPart}`;
    }

    const pivoted = await db.all(query);
    const fieldNames = Object.keys(pivoted[0]);

    return {
        results: pivoted,
        metrics: fieldNames.filter((field) => !fields.includes(field)),
    };
};
