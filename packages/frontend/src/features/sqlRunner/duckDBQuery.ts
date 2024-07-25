import * as duckdb from '@duckdb/duckdb-wasm';

// eslint-disable-next-line import/extensions
import eh_worker from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url';
// eslint-disable-next-line import/extensions
import mvp_worker from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url';
import duckdb_wasm_eh from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url';
import duckdb_wasm from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url';
import { type DuckDBSqlFunction } from '@lightdash/common';
import { tableFromJSON, tableToIPC } from 'apache-arrow';

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

const bundle = await duckdb.selectBundle(MANUAL_BUNDLES);

export const duckDBFE: DuckDBSqlFunction = async (sql, rowData) => {
    const arrowTable = tableFromJSON(rowData);
    const worker = new Worker(bundle.mainWorker!);
    const logger = new duckdb.ConsoleLogger();
    const db = new duckdb.AsyncDuckDB(logger, worker);
    await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
    const conn = await db.connect();

    await conn.insertArrowFromIPCStream(tableToIPC(arrowTable), {
        name: 'results_data',
    });

    const arrowResult = await conn.query<any>(sql);
    const result = arrowResult.toArray().map((row) => row.toJSON());

    await conn.close();
    await db.terminate();
    worker.terminate();
    return result;
};
