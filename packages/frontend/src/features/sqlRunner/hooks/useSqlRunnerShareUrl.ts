import { type ChartConfig } from '@lightdash/common';
import { useCallback, useMemo } from 'react';
import { useCreateShareMutation, useGetShare } from '../../../hooks/useShare';
import { useAppSelector } from '../store/hooks';
import { initialState, type SqlRunnerState } from '../store/sqlRunnerSlice';
import {
    convertLegacyVizChartConfig,
    isLegacyVizChartConfig,
} from '../viz/sqlRunnerChart';

const EXCLUDED_KEYS_FROM_SHARE_STATE = [
    'savedChart',
    'fileUrl',
    'successfulSqlQueries',
    'hasUnrunChanges',
    'modals',
    'sqlColumns',
    'queryIsLoading',
    'queryError',
    'editorHighlightError',
    'fetchResultsOnLoad',
    'connectionRoute',
    'chartConfig',
    'pivotDimensions',
] as const;

type ExcludedKeysFromShareState =
    (typeof EXCLUDED_KEYS_FROM_SHARE_STATE)[number];

type SqlRunnerStateWithoutExcludedKeys = Omit<
    SqlRunnerState,
    ExcludedKeysFromShareState
>;

/** Keys share links carried before the SQL runner drew through the classic chart stack. */
const LEGACY_STATE_KEYS = [
    'savedSqlChart',
    'selectedChartType',
    'activeConfigs',
    'resultsTableConfig',
];

type SqlRunnerShareParams = {
    sqlRunnerState: SqlRunnerStateWithoutExcludedKeys;
    /** The explorer config; older links carry the SQL runner's own config, converted on load. */
    chartConfig: ChartConfig | undefined;
    pivotDimensions?: string[];
    warehouseConnectionUuid?: string | null;
};

function isSqlRunnerShareParams(value: unknown): value is SqlRunnerShareParams {
    return (
        typeof value === 'object' &&
        value !== null &&
        'sqlRunnerState' in value &&
        'chartConfig' in value
    );
}

const stripLegacyKeys = (
    state: Record<string, unknown>,
): Record<string, unknown> =>
    Object.fromEntries(
        Object.entries(state).filter(
            ([key]) => !LEGACY_STATE_KEYS.includes(key),
        ),
    );

export const useCreateSqlRunnerShareUrl = () => {
    const sqlRunnerState = useAppSelector((state) => state.sqlRunner);
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
            chartConfig: sqlRunnerState.chartConfig,
            ...(sqlRunnerState.pivotDimensions
                ? { pivotDimensions: sqlRunnerState.pivotDimensions }
                : {}),
            ...(sqlRunnerState.connectionRoute.route === 'multi' &&
            sqlRunnerState.connectionRoute.connection
                ? {
                      warehouseConnectionUuid:
                          sqlRunnerState.connectionRoute.connection
                              .warehouseConnectionUuid,
                  }
                : {}),
        };

        const shareUrl = await createShareUrl({
            path,
            params: JSON.stringify(shareStateParams),
        });
        return `${window.location.origin}${path}?share=${shareUrl.nanoid}`;
    }, [createShareUrl, sqlRunnerState]);
};

type SqlRunnerShare = {
    sqlRunnerState: SqlRunnerState | undefined;
    chartConfig: ChartConfig | undefined;
    pivotDimensions: string[] | undefined;
    error: Error | null;
    errorReason: 'share_fetch_failed' | 'share_parse_failed' | null;
    warehouseConnectionUuid: string | null | undefined;
};

export const useSqlRunnerShareUrl = (
    share: string | undefined,
): SqlRunnerShare => {
    const { data, error: apiError } = useGetShare(share || undefined);

    return useMemo(() => {
        let error: Error | null = apiError
            ? new Error(apiError.error.message)
            : null;
        let errorReason: SqlRunnerShare['errorReason'] = apiError
            ? 'share_fetch_failed'
            : null;
        let sqlRunnerState: SqlRunnerState | undefined;
        let chartConfig: ChartConfig | undefined;
        let pivotDimensions: string[] | undefined;
        let warehouseConnectionUuid: string | null | undefined;
        if (data?.params) {
            try {
                const sqlRunnerParams = JSON.parse(data.params);
                if (isSqlRunnerShareParams(sqlRunnerParams)) {
                    sqlRunnerState = {
                        ...initialState,
                        ...stripLegacyKeys(sqlRunnerParams.sqlRunnerState),
                        connectionRoute: initialState.connectionRoute,
                    };
                    const shared: unknown = sqlRunnerParams.chartConfig;
                    if (isLegacyVizChartConfig(shared)) {
                        const converted = convertLegacyVizChartConfig({
                            sql: sqlRunnerState.sql,
                            limit: sqlRunnerState.limit ?? 500,
                            config: shared,
                        });
                        chartConfig = converted.chartConfig;
                        pivotDimensions = converted.pivotDimensions;
                    } else {
                        chartConfig = sqlRunnerParams.chartConfig;
                        pivotDimensions = Array.isArray(
                            sqlRunnerParams.pivotDimensions,
                        )
                            ? sqlRunnerParams.pivotDimensions
                            : undefined;
                    }
                    if (
                        typeof sqlRunnerParams.warehouseConnectionUuid ===
                            'string' ||
                        sqlRunnerParams.warehouseConnectionUuid === null
                    ) {
                        warehouseConnectionUuid =
                            sqlRunnerParams.warehouseConnectionUuid;
                    }
                } else {
                    // handle legacy share links where params are just the sql runner state
                    sqlRunnerState = {
                        ...initialState,
                        ...stripLegacyKeys(sqlRunnerParams),
                        connectionRoute: initialState.connectionRoute,
                    };
                }
            } catch (e) {
                error = new Error('Unable to parse SQL runner state json');
                errorReason = 'share_parse_failed';
            }
        }
        return {
            sqlRunnerState,
            chartConfig,
            pivotDimensions,
            error,
            errorReason,
            warehouseConnectionUuid,
        };
    }, [data, apiError]);
};
