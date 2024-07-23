// relevant to many charts

import { tableFromJSON, tableToIPC } from 'apache-arrow';
import { Database } from 'duckdb-async';

type GetPivotedResultsArgs = {
    rows: Record<string, unknown>[];
    valuesSql: string[];
    pivotsSql: string[];
    groupByColumns: string[];
    sortsSql: string[];
};

export const getPivotedResults = async ({
    rows,
    valuesSql,
    pivotsSql,
    groupByColumns,
    sortsSql,
}: GetPivotedResultsArgs) => {
    const arrowTable = tableFromJSON(rows);
    const db = await Database.create(':memory:');
    await db.exec('INSTALL arrow; LOAD arrow;');
    await db.register_buffer('results_data', [tableToIPC(arrowTable)], true);

    const pivotOnSql = pivotsSql.join(', ');
    const pivotValuesSql = valuesSql.join(', ');

    let query = 'PIVOT results_data';
    if (pivotsSql.length > 0) {
        query += ` ON ${pivotOnSql}`;
    }
    if (valuesSql.length > 0) {
        query += ` USING ${pivotValuesSql}`;
    } else {
        return {
            results: [],
            columns: [],
        };
    }
    if (groupByColumns.length > 0) {
        query += ` GROUP BY ${groupByColumns.join(', ')}`;
    }
    if (sortsSql.length > 0) {
        query += ` ORDER BY ${sortsSql.join(', ')}`;
    }

    const pivoted = await db.all(query);
    const fieldNames = Object.keys(pivoted[0]);

    return {
        results: pivoted,
        indexColumns: groupByColumns,
        valueColumns: fieldNames.filter(
            (field) => !groupByColumns.includes(field),
        ),
    };
};
