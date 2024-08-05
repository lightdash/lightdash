import * as duckdb from '@duckdb/duckdb-wasm';

// eslint-disable-next-line import/extensions
import eh_worker from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url';
// eslint-disable-next-line import/extensions
import mvp_worker from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url';
import duckdb_wasm_eh from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url';
import duckdb_wasm from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url';
import { type DuckDBSqlFunction } from '@lightdash/common';
import { tableFromArrays, tableToIPC, Type } from 'apache-arrow';

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

let bundlePromise: Promise<duckdb.DuckDBBundle>;
function initializeBundle() {
    bundlePromise = duckdb.selectBundle(MANUAL_BUNDLES);
}
initializeBundle();

export const duckDBFE: DuckDBSqlFunction = async (sql, rowData, columns) => {
    const bundle = await bundlePromise;
    const worker = new Worker(bundle.mainWorker!);
    const logger = new duckdb.ConsoleLogger();
    const db = new duckdb.AsyncDuckDB(logger, worker);
    await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
    const conn = await db.connect();

    const columnReferences = columns.map((c) => c.reference);
    const typedArrays = columnReferences.reduce((acc, c) => {
        const col = rowData.map((r) => r[c]);
        return {
            ...acc,
            [c]: col,
        };
    }, {});

    const arrowTable = tableFromArrays(typedArrays);
    await conn.insertArrowFromIPCStream(tableToIPC(arrowTable), {
        name: 'results_data',
    });

    const arrowResult = await conn.query<any>(sql);
    const schema = arrowResult.schema;

    const bigIntFieldNames = schema.fields.reduce<string[]>((acc, field) => {
        if (field.type.typeId === Type.Int) {
            return [...acc, field.name];
        }
        return acc;
    }, []);

    const result = arrowResult.toArray().map((row) => {
        const convertedRow = row.toJSON();

        bigIntFieldNames.forEach((fieldName) => {
            convertedRow[fieldName] = Number(convertedRow[fieldName]);
        });

        return convertedRow;
    });

    await conn.close();
    await db.terminate();
    worker.terminate();
    return result;
};
