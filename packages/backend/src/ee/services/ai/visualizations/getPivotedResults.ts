import { SortField } from '@lightdash/common';
import { tableFromJSON, tableToIPC } from 'apache-arrow';
import { Database } from 'duckdb-async';

export const getPivotedResults = async (
    rows: Record<string, unknown>[],
    fieldsMap: Record<string, unknown>,
    pivotField: string,
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
                      `${sort.fieldId} ${sort.descending ? 'DESC' : 'ASC'}`,
              )
              .join(', ')}`
        : '';

    const query = `PIVOT results_data
    ON ${pivotField}
    USING ${usingFields.join(', ')} ${orderByPart}`;

    const pivoted = await db.all(query);
    const fieldNames = Object.keys(pivoted[0]);

    return {
        results: pivoted,
        metrics: fieldNames.filter((field) => !fields.includes(field)),
    };
};
