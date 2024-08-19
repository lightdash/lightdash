import { SemanticLayerPivot, SemanticLayerResultRow } from '@lightdash/common';
import { tableFromArrays, tableToIPC } from 'apache-arrow';
import duckdb from 'duckdb';

const duckDbCrap = async <T>(
    conn: duckdb.Connection,
    sql: string,
): Promise<T> =>
    new Promise((resolve, reject) => {
        conn.all(sql, (err: any, res: any) => {
            if (err) {
                reject(err);
            } else {
                resolve(res);
            }
        });
    });

export async function pivotResults(
    results: SemanticLayerResultRow[],
    pivot: SemanticLayerPivot,
): Promise<SemanticLayerResultRow[]> {
    const columns = Object.keys(results[0]);

    const typedArrays = columns.reduce((acc, c) => {
        const col = results.map((r) => r[c]);
        return {
            ...acc,
            [c]: col,
        };
    }, {});

    console.log({ typedArrays });

    // const arrowTable = tableFromArrays(typedArrays);

    const db = new duckdb.Database(':memory:');
    db.run(
        `
        INSTALL arrow;
        LOAD arrow;
`,
    );
    const conn = db.connect();

    const arrowTable = tableFromArrays(typedArrays);
    await conn.arrowIPCStream(tableToIPC(arrowTable), {
        name: 'results_data',
    });

    const arrowResult = await conn.query<any>(sql);
    const { schema } = arrowResult;

    return [];

    // const data = await duckDbCrap(conn, `SELECT * FROM results_data`);

    // console.log(data);

    // return data as any;
}
