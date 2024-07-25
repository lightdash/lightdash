import * as duckdb from '@duckdb/duckdb-wasm';
import { type DuckDBSqlFunction } from '@lightdash/common';
import { tableFromJSON, tableToIPC } from 'apache-arrow';
// eslint-disable-next-line import/extensions
import eh_worker from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url';
// eslint-disable-next-line import/extensions
import mvp_worker from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url';
import duckdb_wasm_eh from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url';
import duckdb_wasm from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url';

const MANUAL_BUNDLES: duckdb.DuckDBBundles = {
    mvp: {
        mainModule: duckdb_wasm,
        mainWorker: mvp_worker,
    },
    eh: {
        mainModule: duckdb_wasm_eh,
        mainWorker: eh_worker,
    },
};
// Select a bundle based on browser checks
const bundle = await duckdb.selectBundle(MANUAL_BUNDLES);
// Instantiate the asynchronus version of DuckDB-wasm

// export const duckDBBE: DuckDBSqlFunction = async (sql, rowData) => {
//     const arrowTable = tableFromJSON(rowData);
//     const db = await Database.create(':memory:');
//     await db.exec('INSTALL arrow; LOAD arrow;');
//     await db.register_buffer('results_data', [tableToIPC(arrowTable)], true);
//     return db.all(sql);
// };

export const duckDBFE: DuckDBSqlFunction = async (sql, rowData) => {
    const arrowTable = tableFromJSON(rowData);
    const worker = new Worker(bundle.mainWorker!);
    const logger = new duckdb.ConsoleLogger();
    const db = new duckdb.AsyncDuckDB(logger, worker);
    await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
    const conn = await db.connect();
    await conn.query('INSTALL arrow; LOAD arrow;');
    await db.registerFileBuffer('results_data', tableToIPC(arrowTable));
    const results = await conn.query<any>(sql);
    await conn.close();
    await db.terminate();
    worker.terminate();
    return results.toArray();
};
