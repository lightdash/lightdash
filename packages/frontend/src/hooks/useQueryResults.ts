import {
    type ApiChartAndResults,
    type ApiError,
    type ApiQueryResults,
    type DashboardFilters,
    type DateGranularity,
    type MetricQuery,
    type SortField,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useRef } from 'react';
import { useParams } from 'react-router';
import { lightdashApi } from '../api';
import useDashboardContext from '../providers/Dashboard/useDashboardContext';
import {
    convertDateDashboardFilters,
    convertDateFilters,
} from '../utils/dateFilter';
import useToaster from './toaster/useToaster';
import useQueryError from './useQueryError';

type QueryResultsProps = {
    projectUuid: string;
    tableId: string;
    query?: MetricQuery;
    csvLimit?: number | null; //giving null returns all results (no limit)
    chartUuid?: string;
    dateZoomGranularity?: DateGranularity;
    context?: string;
    signal?: AbortSignal;
};

const getChartResults = async ({
    chartUuid,
    invalidateCache,
    context,
}: {
    chartUuid?: string;
    invalidateCache?: boolean;
    dashboardSorts?: SortField[];
    context?: string;
}) => {
    return lightdashApi<ApiQueryResults>({
        url: `/saved/${chartUuid}/results${
            context ? `?context=${context}` : ''
        }`,
        method: 'POST',
        body: JSON.stringify({
            ...(invalidateCache && { invalidateCache: true }),
        }),
    });
};

const getChartAndResults = async ({
    chartUuid,
    dashboardUuid,
    dashboardFilters,
    invalidateCache,
    dashboardSorts,
    granularity,
    autoRefresh,
    context,
}: {
    chartUuid?: string;
    dashboardUuid: string;
    dashboardFilters: DashboardFilters;
    invalidateCache?: boolean;
    dashboardSorts: SortField[];
    granularity?: DateGranularity;
    autoRefresh?: boolean;
    context?: string;
}) => {
    return lightdashApi<ApiChartAndResults>({
        url: `/saved/${chartUuid}/chart-and-results${
            context ? `?context=${context}` : ''
        }`,
        method: 'POST',
        body: JSON.stringify({
            dashboardUuid,
            dashboardFilters,
            dashboardSorts,
            granularity,
            ...(invalidateCache && { invalidateCache: true }),
            autoRefresh,
        }),
    });
};
const getQueryResults = async ({
    projectUuid,
    tableId,
    query,
    csvLimit,
    dateZoomGranularity,
    context,
    signal,
}: QueryResultsProps) => {
    const timezoneFixQuery = query && {
        ...query,
        filters: convertDateFilters(query.filters),
        timezone: query.timezone ?? undefined,
    };

    return lightdashApi<ApiQueryResults>({
        url: `/projects/${projectUuid}/explores/${tableId}/runQuery`,
        method: 'POST',
        body: JSON.stringify({
            ...timezoneFixQuery,
            granularity: dateZoomGranularity,
            csvLimit,
            context,
        }),
        signal,
    });
};

export const useQueryResults = (props?: {
    chartUuid?: string;
    isViewOnly?: boolean;
    dateZoomGranularity?: DateGranularity;
    context?: string;
}) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const setErrorResponse = useQueryError({
        forceToastOnForbidden: true,
        forbiddenToastTitle: 'Error running query',
    });

    // Need to maintain the same controller instance across renders
    const controllerRef = useRef<AbortController | null>(null);
    const lastSuccessfulDataRef = useRef<ApiQueryResults | null>(null);

    const getController = useCallback(() => {
        // Create a new controller for this request
        controllerRef.current = new AbortController();
        return controllerRef.current;
    }, []);

    const fetchQuery = async (queryProps: QueryResultsProps) => {
        // Get a fresh controller for this specific query
        const controller = getController();

        try {
            let result;
            if (props?.isViewOnly === true) {
                result = await getChartResults({
                    ...queryProps,
                });
            } else {
                result = await getQueryResults({
                    ...queryProps,
                    signal: controller.signal,
                });
            }

            lastSuccessfulDataRef.current = result;
            return result;
        } catch (error) {
            // If this is an abort error and we have previous data, return that instead
            if (
                (error as ApiError).error?.data?.name === 'AbortError' &&
                lastSuccessfulDataRef.current
            ) {
                console.log('Request aborted, using previous successful data');
                return lastSuccessfulDataRef.current;
            }
            throw error;
        }
    };

    const mutation = useMutation<ApiQueryResults, ApiError, QueryResultsProps>(
        fetchQuery,
        {
            mutationKey: ['queryResults'],
            onError: (error) => {
                if (error.error?.data?.name !== 'AbortError') {
                    setErrorResponse(error);
                }
            },
            onMutate: () => {
                // Keep track of the current state (before mutation)
                return { previousData: lastSuccessfulDataRef.current };
            },
        },
    );

    const cancelQuery = useCallback(() => {
        console.log(
            'Cancelling query: ',
            mutation.isLoading,
            mutation.status,
            controllerRef.current?.signal.aborted,
        );

        if (mutation.isLoading && controllerRef.current) {
            controllerRef.current.abort();
            console.log(
                'Query cancelled: ',
                mutation,
                controllerRef.current.signal.aborted,
            );
        }
    }, [mutation]);

    const { mutateAsync } = mutation;

    const mutateAsyncOverride = useCallback(
        async (tableName: string, metricQuery: MetricQuery) => {
            const fields = new Set([
                ...metricQuery.dimensions,
                ...metricQuery.metrics,
                ...metricQuery.tableCalculations.map(({ name }) => name),
            ]);
            const isValidQuery = fields.size > 0;
            if (!!tableName && isValidQuery && projectUuid) {
                try {
                    return await mutateAsync({
                        projectUuid,
                        tableId: tableName,
                        query: metricQuery,
                        chartUuid: props?.chartUuid,
                        dateZoomGranularity: props?.dateZoomGranularity,
                        context: props?.context,
                    });
                } catch (error) {
                    // If it's an abort error, don't reject - this was intentional
                    if ((error as ApiError).error?.data?.name == 'AbortError') {
                        console.log('Handling aborted request gracefully');
                        return lastSuccessfulDataRef.current;
                    }
                    return Promise.reject(error);
                }
            } else {
                console.warn(
                    `Can't make SQL request, invalid state`,
                    tableName,
                    isValidQuery,
                    metricQuery,
                );
                return Promise.reject();
            }
        },
        [
            mutateAsync,
            projectUuid,
            props?.chartUuid,
            props?.dateZoomGranularity,
            props?.context,
        ],
    );

    return useMemo(
        () => ({ ...mutation, cancelQuery, mutateAsync: mutateAsyncOverride }),
        [mutation, mutateAsyncOverride, cancelQuery],
    );
};

const getUnderlyingDataResults = async ({
    projectUuid,
    tableId,
    query,
}: {
    projectUuid: string;
    tableId: string;
    query: MetricQuery;
}) => {
    const timezoneFixQuery = {
        ...query,
        filters: convertDateFilters(query.filters),
    };

    return lightdashApi<ApiQueryResults>({
        url: `/projects/${projectUuid}/explores/${tableId}/runUnderlyingDataQuery`,
        method: 'POST',
        body: JSON.stringify(timezoneFixQuery),
    });
};

export const useUnderlyingDataResults = (
    tableId: string,
    query: MetricQuery,
) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const queryKey = [
        'underlyingDataResults',
        projectUuid,
        JSON.stringify(query),
    ];
    return useQuery<ApiQueryResults, ApiError>({
        queryKey,
        queryFn: () =>
            getUnderlyingDataResults({
                projectUuid: projectUuid!,
                tableId,
                query,
            }),
        retry: false,
    });
};

export const useChartAndResults = (
    chartUuid: string | null,
    dashboardUuid: string | null,
    dashboardFilters: DashboardFilters,
    dashboardSorts: SortField[],
    invalidateCache?: boolean,
    granularity?: DateGranularity,
    autoRefresh?: boolean,
    context?: string,
) => {
    const setChartsWithDateZoomApplied = useDashboardContext(
        (c) => c.setChartsWithDateZoomApplied,
    );
    const queryClient = useQueryClient();

    const sortKey =
        dashboardSorts
            ?.map((ds) => `${ds.fieldId}.${ds.descending}`)
            ?.join(',') || '';
    const queryKey = useMemo(
        () => [
            'savedChartResults',
            chartUuid,
            dashboardUuid,
            dashboardFilters,
            invalidateCache,
            sortKey,
            autoRefresh,
        ],
        [
            chartUuid,
            dashboardUuid,
            dashboardFilters,
            invalidateCache,
            sortKey,
            autoRefresh,
        ],
    );
    const apiChartAndResults =
        queryClient.getQueryData<ApiChartAndResults>(queryKey);

    const timezoneFixFilters =
        dashboardFilters && convertDateDashboardFilters(dashboardFilters);
    const hasADateDimension =
        !!apiChartAndResults?.metricQuery?.metadata?.hasADateDimension;

    const fetchChartAndResults = useCallback(
        () =>
            getChartAndResults({
                chartUuid: chartUuid!,
                dashboardUuid: dashboardUuid!,
                dashboardFilters: timezoneFixFilters,
                invalidateCache,
                dashboardSorts,
                granularity,
                autoRefresh,
                context,
            }),
        [
            chartUuid,
            dashboardUuid,
            timezoneFixFilters,
            invalidateCache,
            dashboardSorts,
            granularity,
            autoRefresh,
            context,
        ],
    );

    setChartsWithDateZoomApplied((prev) => {
        if (hasADateDimension) {
            if (granularity) {
                return (prev ?? new Set()).add(chartUuid!);
            }
            prev?.clear();
            return prev;
        }
        return prev;
    });

    return useQuery<ApiChartAndResults, ApiError>({
        queryKey:
            hasADateDimension && granularity
                ? queryKey.concat([granularity])
                : queryKey,
        queryFn: fetchChartAndResults,
        enabled: !!chartUuid && !!dashboardUuid,
        retry: false,
        refetchOnMount: false,
    });
};

const getChartVersionResults = async (
    chartUuid: string,
    versionUuid: string,
) => {
    return lightdashApi<ApiQueryResults>({
        url: `/saved/${chartUuid}/version/${versionUuid}/results`,
        method: 'POST',
        body: undefined,
    });
};

export const useChartVersionResultsMutation = (
    chartUuid: string | undefined,
    versionUuid?: string,
) => {
    const { showToastApiError } = useToaster();
    const mutation = useMutation<ApiQueryResults, ApiError>(
        () =>
            chartUuid && versionUuid
                ? getChartVersionResults(chartUuid, versionUuid)
                : Promise.reject(),
        {
            mutationKey: ['chartVersionResults', chartUuid, versionUuid],
            onError: ({ error }) => {
                showToastApiError({
                    title: 'Error running query',
                    apiError: error,
                });
            },
        },
    );
    const { mutateAsync } = mutation;
    // needs these args to work with ExplorerProvider
    const mutateAsyncOverride = useCallback(
        async (_tableName: string, _metricQuery: MetricQuery) => {
            await mutateAsync();
        },
        [mutateAsync],
    );

    return useMemo(
        () => ({
            ...mutation,
            mutateAsync: mutateAsyncOverride,
        }),
        [mutation, mutateAsyncOverride],
    );
};
