import {NotExistsError} from "./errors";
import {Explore, MetricQuery} from "common";
import {buildQuery} from "./queryBuilder";
import {DbtLocalProjectAdapter} from "./projectAdapters/dbtLocalProjectAdapter";
import {BaseProjectAdapter} from "./projectAdapters/baseProjectAdapter";
import {DbtRemoteProjectAdapter} from "./projectAdapters/dbtRemoteProjectAdapter";

// TODO: WIP FOR TESTING REFACTOR
// Setup dbt adapter
let adapter: BaseProjectAdapter;
const spawnDbt = process.env.LIGHTDASH_SPAWN_DBT || true;
const port = parseInt(process.env.LIGHTDASH_DBT_PORT || '8580');
if (isNaN(port)) {
    throw new Error('Must specify a valid LIGHTDASH_DBT_PORT');
}
if (spawnDbt) {
    const dbtProfilesDir = process.env.DBT_PROFILES_DIR;
    if (dbtProfilesDir === undefined) {
        throw new Error('Must specify DBT_PROFILES_DIR');
    }
    const dbtProjectDir = process.env.DBT_PROJECT_DIR;
    if (dbtProjectDir === undefined) {
        throw new Error('Must specify DBT_PROJECT_DIR');
    }
    adapter = new DbtLocalProjectAdapter(dbtProjectDir, dbtProfilesDir, port);
}
else {
    const host = process.env.LIGHTDASH_DBT_HOST || 'localhost';
    adapter = new DbtRemoteProjectAdapter(host, port);
}

// Shared promise
let cachedTables: Promise<Explore[]> | undefined = undefined;
let tablesIsLoading = false;


// TODO: not sure how to refactor this block
export const getStatus = async () => {
    // if (!adapter.dbtChildProcess.processRunning) {
    //     return 'error';
    // }
    if (tablesIsLoading)
        return 'loading'
    if (cachedTables === undefined)
        return 'error'
    try {
        await cachedTables
    }
    catch (e) {
        return 'error'
    }
    return 'ready'
}

export const refreshAllTables = async () => {
    tablesIsLoading = true
    cachedTables = adapter.compileAllExplores()
    try {
        await cachedTables
    }
    finally {
        tablesIsLoading = false
    }
    return cachedTables
}

export const getAllTables = async (): Promise<Explore[]> => {
    if (cachedTables === undefined)
        return await refreshAllTables()
    return await cachedTables
}

export const getTable = async (tableId: string): Promise<Explore> => {
    const tables = await getAllTables()
    const table = tables.find(t => t.name === tableId)
    if (table === undefined)
        throw new NotExistsError(`Table ${tableId} does not exist.`)
    return table
}

export const runQuery = async (tableId: string, metricQuery: MetricQuery) => {
    const explore = await getTable(tableId)
    const sql = await buildQuery({explore, metricQuery})
    const rows = await adapter.runQuery(sql)
    return {
        metricQuery,
        rows,
    }
}