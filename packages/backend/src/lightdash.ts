import { Explore, MetricQuery, SessionUser } from 'common';
import { v4 as uuidv4 } from 'uuid';
import { errorHandler, NotExistsError } from './errors';
import { buildQuery } from './queryBuilder';
import { projectAdapterFromConfig } from './projectAdapters/projectAdapter';
import { lightdashConfig } from './config/lightdashConfig';
import { compileMetricQuery } from './queryCompiler';
import { analytics } from './analytics/client';

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

export const refreshAllTables = async (userUuid: string | undefined) => {
    tablesIsLoading = true;
    cachedTables = adapter.compileAllExplores();
    try {
        await cachedTables;
        analytics.track({
            event: 'project.compiled',
            userId: userUuid,
            anonymousId: uuidv4(), // TODO: default to temporary user id once we have that
            properties: {
                projectType: projectConfig.type,
            },
        });
    } catch (e) {
        const errorResponse = errorHandler(e);
        analytics.track({
            event: 'project.error',
            userId: userUuid,
            anonymousId: uuidv4(), // TODO: default to temporary user id once we have that
            properties: {
                name: errorResponse.name,
                statusCode: errorResponse.statusCode,
                projectType: projectConfig.type,
            },
        });
        throw errorResponse;
    } finally {
        tablesIsLoading = false;
    }
    return cachedTables;
};

export const getAllTables = async (user: SessionUser): Promise<Explore[]> => {
    if (cachedTables === undefined) return refreshAllTables(user.userUuid);
    return cachedTables;
};

export const getTable = async (
    user: SessionUser,
    tableId: string,
): Promise<Explore> => {
    const tables = await getAllTables(user);
    const table = tables.find((t) => t.name === tableId);
    if (table === undefined)
        throw new NotExistsError(`Table ${tableId} does not exist.`);
    return table;
};

export const runQuery = async (
    user: SessionUser,
    tableId: string,
    metricQuery: MetricQuery,
) => {
    const explore = await getTable(user, tableId);
    const compiledMetricQuery = compileMetricQuery(metricQuery);
    const sql = buildQuery({ explore, compiledMetricQuery });
    const rows = await adapter.runQuery(sql);
    return {
        metricQuery,
        rows,
    };
};
