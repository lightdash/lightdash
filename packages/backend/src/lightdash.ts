import NodeCache from "node-cache";
import {
    attachTypesToModels,
    convertExplores,
    getDbtCatalog,
    getDbtModels,
    refreshDbtChildProcess,
    waitForDbtServerReady
} from "./dbt";
import {MissingCatalogEntryError, NotExistsError} from "./errors";
import {Explore} from "common";

const cache = new NodeCache()
cache.set('status', 'ready')

export const getStatus = () => cache.get('status') || 'loading'

const updateAllTablesFromDbt = async () => {
    // Refresh dbt server to re-parse dbt project directory
    // throws NetworkError or ParseError
    await refreshDbtChildProcess()
    await waitForDbtServerReady()

    // Get the models from dbt - throws ParseError
    const models = await getDbtModels()

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

export const refreshAllTables = () => {
    cache.set('status', 'loading')
    const refreshed = updateAllTablesFromDbt()
    refreshed
        .then(() => {
            cache.set('status', 'ready')
        })
    cache.set<Promise<Explore[]>>('tables', refreshed)
    return refreshed
}

export const getAllTables = (): Promise<Explore[]> => {
    const cachedTables = cache.get<Promise<Explore[]>>('tables')
    return cachedTables === undefined ? refreshAllTables() : cachedTables
}

export const getTable = async (tableId: string): Promise<Explore> => {
    const tables = await getAllTables()
    const table = tables.find(t => t.name === tableId)
    if (table === undefined)
        throw new NotExistsError(`Table ${tableId} does not exist.`)
    return table
}