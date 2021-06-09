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
import {Explore} from "common";
import {cache} from "./cache";
import {waitForDbtServerReady} from "./dbt/rpcClient";


// Shared promise
let cachedTables: Promise<Explore[]> | undefined = undefined
let tablesIsLoading = false

export const getStatus = () => {
    if (spawnDbt && !isDbtProcessRunning())
        return 'error'
    if (tablesIsLoading)
        return 'loading'
    return 'ready'
}

const updateAllTablesFromDbt = async () => {
    // Refresh dbt server to re-parse dbt project directory
    // throws NetworkError or ParseError
    // Might also crash the dbt process, we'll restart on next refresh
    tablesIsLoading = true
    await refreshDbtChildProcess()
    await waitForDbtServerReady()

    // Get the models from dbt - throws ParseError
    const models = await getDbtModels()

    // Be lazy and try to type the models without refreshing the catalog
    try {
        const lazyTypedModels = await attachTypesToModels(models, cache.get('catalog') || {nodes: {}})
        const lazyExplores = await convertExplores(lazyTypedModels)
        tablesIsLoading = false
        return lazyExplores
    } catch (e) {
        if (e instanceof MissingCatalogEntryError) {
            // Some types were missing so refresh the catalog

            const catalog = await getDbtCatalog()
            await cache.set('catalog', catalog)
            const typedModels = await attachTypesToModels(models, catalog)
            const explores = await convertExplores(typedModels)
            tablesIsLoading = false
            return explores
        }
        tablesIsLoading = false
        throw e
    }
}

export const refreshAllTables = async () => {
    cachedTables = updateAllTablesFromDbt()
    await cachedTables
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