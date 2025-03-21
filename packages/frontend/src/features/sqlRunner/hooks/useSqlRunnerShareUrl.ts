import { type AllVizChartConfig } from '@lightdash/common';
import { useCallback, useMemo } from 'react';
import { selectCompleteConfigByKind } from '../../../components/DataViz/store/selectors';
import { useCreateShareMutation, useGetShare } from '../../../hooks/useShare';
import { useAppSelector } from '../store/hooks';
import {
    initialState,
    selectActiveChartType,
    type SqlRunnerState,
} from '../store/sqlRunnerSlice';

const EXCLUDED_KEYS_FROM_SHARE_STATE = [
    'savedSqlChart',
    'fileUrl',
    'successfulSqlQueries',
    'hasUnrunChanges',
    'modals',
    'sqlColumns',
    'queryIsLoading',
    'queryError',
    'editorHighlightError',
    'fetchResultsOnLoad',
] as const;

type ExcludedKeysFromShareState = typeof EXCLUDED_KEYS_FROM_SHARE_STATE[number];

type SqlRunnerStateWithoutExcludedKeys = Omit<
    SqlRunnerState,
    ExcludedKeysFromShareState
>;

type SqlRunnerShareParams = {
    sqlRunnerState: SqlRunnerStateWithoutExcludedKeys;
    chartConfig: AllVizChartConfig | undefined;
};

function isSqlRunnerShareParams(value: unknown): value is SqlRunnerShareParams {
    return (
        typeof value === 'object' &&
        value !== null &&
        'sqlRunnerState' in value &&
        'chartConfig' in value
    );
}

export const useCreateSqlRunnerShareUrl = () => {
    const sqlRunnerState = useAppSelector((state) => state.sqlRunner);
    const selectedChartType = useAppSelector(selectActiveChartType);
    const config = useAppSelector((state) =>
        selectCompleteConfigByKind(state, selectedChartType),
    );
    const { mutateAsync: createShareUrl } = useCreateShareMutation();
    return useCallback(async () => {
        const path = window.location.pathname;
        // Exclude sql runner state keys that should not be shared
        const sqlRunnerStateWithoutExcludedKeys = Object.fromEntries(
            Object.entries(sqlRunnerState).filter(
                ([key]) =>
                    !EXCLUDED_KEYS_FROM_SHARE_STATE.includes(
                        key as ExcludedKeysFromShareState,
                    ),
            ),
        ) as SqlRunnerStateWithoutExcludedKeys;

        const shareStateParams: SqlRunnerShareParams = {
            sqlRunnerState: sqlRunnerStateWithoutExcludedKeys,
            chartConfig: config,
        };

        const shareUrl = await createShareUrl({
            path,
            params: JSON.stringify(shareStateParams),
        });
        return `${window.location.origin}${path}?share=${shareUrl.nanoid}`;
    }, [createShareUrl, sqlRunnerState, config]);
};

type SqlRunnerShare = {
    sqlRunnerState: SqlRunnerState | undefined;
    chartConfig: AllVizChartConfig | undefined;
    error: Error | null;
};

export const useSqlRunnerShareUrl = (
    share: string | undefined,
): SqlRunnerShare => {
    const { data, error: apiError } = useGetShare(share || undefined);

    return useMemo(() => {
        let error: Error | null = apiError
            ? new Error(apiError.error.message)
            : null;
        let sqlRunnerState: SqlRunnerState | undefined;
        let chartConfig: AllVizChartConfig | undefined;
        if (data?.params) {
            try {
                const sqlRunnerParams = JSON.parse(data.params);
                if (isSqlRunnerShareParams(sqlRunnerParams)) {
                    sqlRunnerState = {
                        ...initialState,
                        ...sqlRunnerParams.sqlRunnerState,
                    };
                    chartConfig = sqlRunnerParams.chartConfig;
                } else {
                    // handle legacy share links where params are just the sql runner state
                    sqlRunnerState = {
                        ...initialState,
                        ...sqlRunnerParams,
                    };
                }
            } catch (e) {
                error = new Error('Unable to parse SQL runner state json');
            }
        }
        return {
            sqlRunnerState,
            chartConfig,
            error,
        };
    }, [data, apiError]);
};
