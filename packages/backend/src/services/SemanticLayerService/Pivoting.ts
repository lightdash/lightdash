import { SemanticLayerPivot, SemanticLayerResultRow } from '@lightdash/common';
import { tableFromJSON, tableToIPC } from 'apache-arrow';
import duckdb, { RowData, TableData } from 'duckdb';

async function runDuckDbQuery(
    conn: duckdb.Connection,
    sql: string,
): Promise<TableData> {
    return new Promise((resolve, reject) => {
        conn.all(sql, (err, res) => {
            if (err) {
                reject(err);
            } else {
                resolve(res);
            }
        });
    });
}

async function prepareDuckDbConnection(
    tableName: string,
    results: SemanticLayerResultRow[],
): Promise<duckdb.Connection> {
    const db = new duckdb.Database(':memory:');
    const conn = db.connect();
    return new Promise((resolve, reject) => {
        conn.exec(`INSTALL arrow; LOAD arrow;`, (err: unknown) => {
            if (err) {
                reject(err);
                return;
            }

            const arrowTable = tableFromJSON(results);
            conn.register_buffer(
                tableName,
                [tableToIPC(arrowTable)],
                true,
                (error: unknown, _res: unknown) => {
                    if (error) {
                        reject(error);
                        return;
                    }

                    resolve(conn);
                },
            );
        });
    });
}

export async function pivotResults(
    results: RowData[],
    pivot: SemanticLayerPivot,
): Promise<SemanticLayerResultRow[]> {
    const tableName = 'results_data';
    const conn = await prepareDuckDbConnection(tableName, results);
    let query = 'PIVOT results_data';
    if (pivot.on.length > 0) {
        query += ` ON ${pivot.on.join(', ')}`;
    }
    if (pivot.values.length > 0) {
        query += ` USING ${pivot.values
            .map(({ field, aggFunc }) => `${aggFunc}(${field})`)
            .join(', ')}`;
    } else {
        return [];
    }

    console.log('Running query:', query);

    const data = await runDuckDbQuery(conn, query);

    return data;
}
