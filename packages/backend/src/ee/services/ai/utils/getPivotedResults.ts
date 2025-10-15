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

    const orderByPart = sorts.length
        ? `ORDER BY ${sorts
              .map(
                  (sort) =>
                      `${sort.fieldId} ${
                          sort.descending ? 'DESC' : 'ASC'
                      }${getNullsFirstLast(sort)}`,
              )
              .join(', ')}`
        : '';

    // For multiple pivot fields, create a composite key
    let query: string;
    if (pivotFields.length === 1) {
        query = `PIVOT results_data
    ON ${pivotFields[0]}
    USING ${usingFields.join(', ')} ${orderByPart}`;
    } else {
        // Create composite key by concatenating pivot fields with ' - ' separator
        const compositeKey = pivotFields
            .map((field) => `COALESCE(CAST(${field} AS VARCHAR), 'NULL')`)
            .join(" || ' - ' || ");
        query = `PIVOT (
        SELECT *, ${compositeKey} as __pivot_key__ FROM results_data
    )
    ON __pivot_key__
    USING ${usingFields.join(', ')} ${orderByPart}`;
    }

    const pivoted = await db.all(query);
    const fieldNames = Object.keys(pivoted[0]);

    return {
        results: pivoted,
        metrics: fieldNames.filter((field) => !fields.includes(field)),
    };
};
