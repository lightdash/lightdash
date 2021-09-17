import {
    Explore,
    ExploreError,
    isExploreError,
    MetricQuery,
    SessionUser,
} from 'common';
import { v4 as uuidv4 } from 'uuid';
import { CompileError, errorHandler, NotExistsError } from './errors';
import { buildQuery } from './queryBuilder';
import { lightdashConfig } from './config/lightdashConfig';
import { compileMetricQuery } from './queryCompiler';
import { analytics } from './analytics/client';
import { projectService } from './services/services';

// Setup dbt adapter
const projectConfig = lightdashConfig.projects[0];

// Shared promise
let cachedTables: Promise<(Explore | ExploreError)[]> | undefined;
let exploresAreLoading = false;

export const getStatus = async () => {
    if (exploresAreLoading) return 'loading';
    if (cachedTables === undefined) return 'error';
    try {
        await cachedTables;
    } catch (e) {
        return 'error';
    }
    return 'ready';
};

export const refreshAllTables = async (userUuid: string | undefined) => {
    exploresAreLoading = true;
    cachedTables = projectService.compileAllExplores();
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
        exploresAreLoading = false;
    }
    return cachedTables;
};

export const getAllExplores = async (
    user: SessionUser,
): Promise<(Explore | ExploreError)[]> => {
    if (cachedTables === undefined) return refreshAllTables(user.userUuid);
    return cachedTables;
};

export const getExplore = async (
    user: SessionUser,
    exploreId: string,
): Promise<Explore> => {
    const explores = await getAllExplores(user);
    const explore = explores.find((t) => t.name === exploreId);
    if (explore === undefined || isExploreError(explore))
        throw new NotExistsError(`Explore "${exploreId}" does not exist.`);
    return explore;
};

export const runQuery = async (
    user: SessionUser,
    exploreId: string,
    metricQuery: MetricQuery,
) => {
    const explore = await getExplore(user, exploreId);
    if (isExploreError(explore)) {
        throw new CompileError(
            `Cannot compile query for explore "${
                explore.name
            }": ${explore.errors.join('\n')}`,
            {},
        );
    }
    const compiledMetricQuery = compileMetricQuery(metricQuery);
    const sql = buildQuery({ explore, compiledMetricQuery });
    const rows = await projectService.runQuery(sql);
    return {
        metricQuery,
        rows,
    };
};
