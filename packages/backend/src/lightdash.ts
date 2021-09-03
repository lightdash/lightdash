import { Explore, MetricQuery } from 'common';
import { NotExistsError } from './errors';
import { buildQuery } from './queryBuilder';
import { projectAdapterFromConfig } from './projectAdapters/projectAdapter';
import { lightdashConfig } from './config/lightdashConfig';
import { compileMetricQuery } from './queryCompiler';

// Setup dbt adapter
const projectConfig = lightdashConfig.projects[0];
const adapter = projectAdapterFromConfig(projectConfig);

// Shared promise
let cachedTables: Promise<Explore[]> | undefined;
let tablesIsLoading = false;

export const getStatus = async () => {
    if (tablesIsLoading) return 'loading';
    if (cachedTables === undefined) return 'error';
    try {
        await cachedTables;
    } catch (e) {
        return 'error';
    }
    return 'ready';
};

export const refreshAllTables = async () => {
    tablesIsLoading = true;
    cachedTables = adapter.compileAllExplores();
    try {
        await cachedTables;
    } finally {
        tablesIsLoading = false;
    }
    return cachedTables;
};

export const getAllTables = async (): Promise<Explore[]> => {
    if (cachedTables === undefined) return refreshAllTables();
    return cachedTables;
};

export const getTable = async (tableId: string): Promise<Explore> => {
    const tables = await getAllTables();
    const table = tables.find((t) => t.name === tableId);
    if (table === undefined)
        throw new NotExistsError(`Table ${tableId} does not exist.`);
    return table;
};

export const runQuery = async (tableId: string, metricQuery: MetricQuery) => {
    const explore = await getTable(tableId);
    const compiledMetricQuery = compileMetricQuery(metricQuery);
    const sql = buildQuery({ explore, compiledMetricQuery });
    const rows = await adapter.runQuery(sql);
    return {
        metricQuery,
        rows,
    };
};
