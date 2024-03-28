import { type CreateSavedChartVersion } from '@lightdash/common';
import { useCallback, useMemo } from 'react';
import { useHistory, useLocation } from 'react-router-dom';
import { parseExplorerSearchParams } from './useExplorerRoute';
import { generateStateCacheKey, useStateCache } from './useStateCache';

export type SqlRunnerState = {
    createSavedChart: CreateSavedChartVersion | undefined;
    sqlRunner: { sql: string } | undefined;
};

enum SqlRunnerSearchParam {
    CreateSavedChartVersion = 'create_saved_chart_version',
    SqlRunnerState = 'sql_runner',
    SqlRunnerKey = 'sql_runner_id',
}

export const useSqlRunnerRoute = () => {
    const { search, pathname } = useLocation();
    const history = useHistory();
    const searchParams = useMemo(() => new URLSearchParams(search), [search]);

    const sqlRunnerCacheId = searchParams.get(
        SqlRunnerSearchParam.SqlRunnerKey,
    );

    /**
     * If we don't have a cache key, we generate a brand new one:
     */
    const cacheKeyOrGenerated = useMemo(
        () => sqlRunnerCacheId ?? generateStateCacheKey(),
        [sqlRunnerCacheId],
    );

    const legacyRunnerState = searchParams.get(
        SqlRunnerSearchParam.SqlRunnerState,
    );

    const hasLegacyCreateSavedChartVersion = searchParams.has(
        SqlRunnerSearchParam.CreateSavedChartVersion,
    );

    /**
     * If we're handling legacy search params, we process them as the initial state,
     * and discard them as soon as we receive a new state update.
     */
    const initialData = useMemo<Partial<SqlRunnerState>>(() => {
        return {
            createSavedChart: hasLegacyCreateSavedChartVersion
                ? parseExplorerSearchParams(search)
                : undefined,
            sqlRunner: legacyRunnerState
                ? JSON.parse(legacyRunnerState)
                : undefined,
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const [cachedState, setCachedState] = useStateCache(cacheKeyOrGenerated, {
        initialData,
    });

    const updateSqlRunnerState = useCallback(
        (newState: SqlRunnerState) => {
            const updatedSearchParams = new URLSearchParams(search);

            /**
             * Delete legacy search params, and add the current cache key to the url:
             */
            updatedSearchParams.delete(
                SqlRunnerSearchParam.CreateSavedChartVersion,
            );
            updatedSearchParams.delete(SqlRunnerSearchParam.SqlRunnerState);
            updatedSearchParams.set(
                SqlRunnerSearchParam.SqlRunnerKey,
                cacheKeyOrGenerated,
            );

            setCachedState(newState);
            history.replace({
                pathname,
                search: updatedSearchParams.toString(),
            });
        },
        [setCachedState, search, cacheKeyOrGenerated, pathname, history],
    );

    return {
        sqlRunnerState: cachedState,
        updateSqlRunnerState,
    };
};
