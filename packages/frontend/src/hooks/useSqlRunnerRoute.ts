import { type CreateSavedChartVersion, type ShareUrl } from '@lightdash/common';
import { useCallback, useEffect, useMemo } from 'react';
import { useHistory, useLocation } from 'react-router-dom';
import { parseExplorerSearchParams } from './useExplorerRoute';
import {
    useCreateShareMutation,
    useGetShare,
    useUpdateShareMutation,
} from './useShare';
import { generateStateCacheKey, useStateCache } from './useStateCache';

export type SqlRunnerState = {
    createSavedChart: CreateSavedChartVersion | undefined;
    sqlRunner: { sql: string } | undefined;
};

enum SqlRunnerSearchParam {
    CreateSavedChartVersion = 'create_saved_chart_version',
    SqlRunnerState = 'sql_runner',
    SqlRunnerDraft = 'sql_runner_draft',
    SqlRunnerId = 'sql_runner_id',
}

export const useSqlRunnerRoute = () => {
    const { search, pathname } = useLocation();
    const history = useHistory();
    const searchParams = useMemo(() => new URLSearchParams(search), [search]);

    const sqlRunnerShareId = searchParams.get(SqlRunnerSearchParam.SqlRunnerId);
    const sqlRunnerCacheId = searchParams.get(
        SqlRunnerSearchParam.SqlRunnerDraft,
    );

    const { data: shareData, isLoading: isLoadingShareData } =
        useGetShare(sqlRunnerShareId);
    const { mutate: updateShare } = useUpdateShareMutation(sqlRunnerShareId);
    const { mutate: createShare } = useCreateShareMutation();

    const isLoading = !!(sqlRunnerShareId && isLoadingShareData);

    /**
     * If we don't have a cache key, we generate a brand new one. We memoize
     * these separately so we can reuse the same cache key for a single component,
     * even if we drop the key from the param.
     */
    const generatedCacheKey = useMemo(() => generateStateCacheKey(), []);
    const cacheKeyOrGenerated = useMemo(
        () => sqlRunnerCacheId ?? generatedCacheKey,
        [sqlRunnerCacheId, generatedCacheKey],
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
     *
     * If we're using a share nanoID, we instead use that to initialize things, with
     * a separate search params parser.
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

    const [cachedState, setCachedState, { isInitialData }] = useStateCache(
        cacheKeyOrGenerated,
        {
            initialData,
        },
    );

    useEffect(() => {
        /**
         * Ignore fetched data if we already have a draft key, so we don't override
         * the user's cached or active state with a late load.
         */
        if (shareData && !sqlRunnerCacheId) {
            const shareParams = new URLSearchParams(shareData.params);

            const hasCreateSavedChartFromParam = shareParams.get(
                SqlRunnerSearchParam.CreateSavedChartVersion,
            );
            const sqlRunnerFromParam = shareParams.get(
                SqlRunnerSearchParam.SqlRunnerState,
            );

            setCachedState({
                createSavedChart: hasCreateSavedChartFromParam
                    ? parseExplorerSearchParams(shareData.params)
                    : undefined,
                sqlRunner: sqlRunnerFromParam
                    ? JSON.parse(sqlRunnerFromParam)
                    : undefined,
            });
        }
    }, [shareData, setCachedState, sqlRunnerCacheId]);

    const flushSqlRunnerStateToShare = useCallback(() => {
        /**
         * Do not do anything until we've finished loading share data:
         */
        if (sqlRunnerShareId && isLoadingShareData) {
            return;
        }

        if (cachedState) {
            /**
             * Generate a new share with a subset of params, to avoid leaking
             * from existing search params
             * */
            const shareParams = new URLSearchParams({
                [SqlRunnerSearchParam.CreateSavedChartVersion]:
                    cachedState.createSavedChart
                        ? JSON.stringify(cachedState.createSavedChart)
                        : '',
                [SqlRunnerSearchParam.SqlRunnerState]: cachedState.sqlRunner
                    ? JSON.stringify(cachedState.sqlRunner)
                    : '',
            });

            const shareUrlParams = {
                params: shareParams.toString(),
                path: pathname,
            };

            const onCreateOrUpdateShare = (shareUrl: ShareUrl) => {
                searchParams.set(
                    SqlRunnerSearchParam.SqlRunnerId,
                    shareUrl.nanoid,
                );

                /**
                 * We need to know if we need to trust the cache data, or the share URL data -
                 * the easiest way is to track the presence of a cache param at all, so we delete
                 * the entry from the url.
                 */
                searchParams.delete(SqlRunnerSearchParam.SqlRunnerDraft);

                history.replace({
                    pathname,
                    search: searchParams.toString(),
                });
            };

            if (sqlRunnerShareId) {
                updateShare(shareUrlParams, {
                    onSuccess: onCreateOrUpdateShare,
                });
            } else {
                createShare(shareUrlParams, {
                    onSuccess: onCreateOrUpdateShare,
                });
            }
        }
    }, [
        createShare,
        updateShare,
        cachedState,
        pathname,
        searchParams,
        history,
        sqlRunnerShareId,
        isLoadingShareData,
    ]);

    const updateSqlRunnerState = useCallback(
        (
            updater: (
                currentState: Partial<SqlRunnerState>,
            ) => Partial<SqlRunnerState>,
        ) => {
            /**
             * Do not allow updating state until we've done loading things.
             */
            if (sqlRunnerShareId && isLoadingShareData) {
                return;
            }

            const updatedSearchParams = new URLSearchParams(search);

            /**
             * Delete legacy search params, and add the current cache key to the url:
             */
            updatedSearchParams.delete(
                SqlRunnerSearchParam.CreateSavedChartVersion,
            );
            updatedSearchParams.delete(SqlRunnerSearchParam.SqlRunnerState);

            /**
             * Do not append the draft parameter until we've made changes to the cached
             * data:
             */
            if (!isInitialData) {
                updatedSearchParams.set(
                    SqlRunnerSearchParam.SqlRunnerDraft,
                    cacheKeyOrGenerated,
                );
            }

            setCachedState(updater(cachedState));
            history.replace({
                pathname,
                search: updatedSearchParams.toString(),
            });
        },
        [
            cachedState,
            isInitialData,
            setCachedState,
            search,
            cacheKeyOrGenerated,
            pathname,
            history,
            isLoadingShareData,
            sqlRunnerShareId,
        ],
    );

    return {
        sqlRunnerState: cachedState,
        flushSqlRunnerStateToShare,
        updateSqlRunnerState,
        isLoading,
        shareNanoId: shareData?.nanoid,
    };
};
