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

    const [cachedState, setCachedState] = useStateCache(cacheKeyOrGenerated, {
        initialData,
    });

    useEffect(() => {
        if (shareData) {
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
    }, [shareData, setCachedState]);

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
        (newState: SqlRunnerState) => {
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
            updatedSearchParams.set(
                SqlRunnerSearchParam.SqlRunnerDraft,
                cacheKeyOrGenerated,
            );

            setCachedState(newState);
            history.replace({
                pathname,
                search: updatedSearchParams.toString(),
            });
        },
        [
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
    };
};
