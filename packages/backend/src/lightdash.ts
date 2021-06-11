import {
    attachTypesToModels,
    convertExplores,
    getDbtCatalog,
    getDbtModels
} from "./dbt/translator";
import {
    isDbtProcessRunning,
    refreshDbtChildProcess, spawnDbt
} from "./dbt/childProcess";
import {MissingCatalogEntryError, NotExistsError} from "./errors";
import {Explore, MetricQuery} from "common";
import {cache} from "./cache";
import {runQueryOnDbtAdapter, waitForDbtServerReady} from "./dbt/rpcClient";
import {buildQuery} from "./queryBuilder";


// Shared promise
let cachedTables: Promise<Explore[]> | undefined = undefined
let tablesIsLoading = false

export const getStatus = async () => {
    if (spawnDbt && !isDbtProcessRunning())
        return 'error'
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

const updateAllTablesFromDbt = async () => {
    // Refresh dbt server to re-parse dbt project directory
    // throws NetworkError or ParseError
    // Might also crash the dbt process, we'll restart on next refresh
    let models
    try {
        await refreshDbtChildProcess()
        await waitForDbtServerReady()

        // Get the models from dbt - throws ParseError
        models = await getDbtModels()
    }
    catch (e) {
       throw e
    }

    // Be lazy and try to type the models without refreshing the catalog
    try {
        const lazyTypedModels = await attachTypesToModels(models, cache.get('catalog') || {nodes: {}})
        const lazyExplores = await convertExplores(lazyTypedModels)
        return lazyExplores
    } catch (e) {
        if (e instanceof MissingCatalogEntryError) {
            // Some types were missing so refresh the catalog

            const catalog = await getDbtCatalog()
            await cache.set('catalog', catalog)
            const typedModels = await attachTypesToModels(models, catalog)
            const explores = await convertExplores(typedModels)
            return explores
        }
        throw e
    }
}

export const refreshAllTables = async () => {
    tablesIsLoading = true
    cachedTables = updateAllTablesFromDbt()
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
    const rows = await runQueryOnDbtAdapter(sql)
    return {
        metricQuery,
        rows,
    }
}