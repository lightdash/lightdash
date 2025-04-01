import {
    METRICS_EXPLORER_DATE_FORMAT,
    type ApiMetricsExplorerQueryResults,
    type ApiMetricsExplorerTotalResults,
    type FilterRule,
    type MetricExplorerDateRange,
    type MetricExplorerQuery,
    type MetricTotalComparisonType,
    type TimeDimensionConfig,
    type TimeFrames,
} from '@lightdash/common';
import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { z } from 'zod';
import { lightdashApi } from '../../../api';

type RunMetricExplorerQueryArgs = {
    projectUuid: string;
    exploreName: string;
    metricName: string;
    dateRange: MetricExplorerDateRange;
    query: MetricExplorerQuery;
    timeDimensionOverride?: TimeDimensionConfig;
    filter?: FilterRule;
};

const getUrlParams = ({
    dateRange,
    timeFrame,
    granularity,
}: {
    dateRange: MetricExplorerDateRange;
    timeFrame?: TimeFrames;
    granularity?: TimeFrames;
}) => {
    const params = new URLSearchParams();

    // Add date range params
    if (dateRange) {
        params.append(
            'startDate',
            dayjs(dateRange[0]).format(METRICS_EXPLORER_DATE_FORMAT),
        );
        params.append(
            'endDate',
            dayjs(dateRange[1]).format(METRICS_EXPLORER_DATE_FORMAT),
        );
    }

    // Add time frame param
    if (timeFrame) {
        params.append('timeFrame', timeFrame);
    }

    // Add granularity param
    if (granularity) {
        params.append('granularity', granularity);
    }

    return params.toString();
};

const postRunMetricExplorerQuery = async ({
    projectUuid,
    exploreName,
    metricName,
    query,
    dateRange,
    timeDimensionOverride,
    filter,
}: RunMetricExplorerQueryArgs) => {
    const queryString = getUrlParams({ dateRange });

    const response = await lightdashApi<
        ApiMetricsExplorerQueryResults['results']
    >({
        url: `/projects/${projectUuid}/metricsExplorer/${exploreName}/${metricName}/runMetricExplorerQuery${
            queryString ? `?${queryString}` : ''
        }`,
        method: 'POST',
        body: JSON.stringify({
            timeDimensionOverride,
            query,
            filter,
        }),
    });

    return {
        ...response,
        results: response.results.map((result) => ({
            ...result,
            date: z.date({ coerce: true }).parse(result.date),
        })),
    } satisfies ApiMetricsExplorerQueryResults['results'];
};

export const useRunMetricExplorerQuery = (
    {
        projectUuid,
        exploreName,
        metricName,
        query,
        dateRange,
        timeDimensionOverride,
        filter,
    }: Partial<RunMetricExplorerQueryArgs>,
    options?: UseQueryOptions<ApiMetricsExplorerQueryResults['results']>,
) => {
    return useQuery({
        queryKey: [
            'runMetricExplorerQuery',
            projectUuid,
            exploreName,
            metricName,
            dateRange?.[0],
            dateRange?.[1],
            query,
            timeDimensionOverride,
            filter,
        ],
        queryFn: () =>
            postRunMetricExplorerQuery({
                projectUuid: projectUuid!,
                exploreName: exploreName!,
                metricName: metricName!,
                query: query!,
                dateRange: dateRange!,
                timeDimensionOverride,
                filter,
            }),
        ...options,
    });
};

type RunMetricTotalArgs = {
    projectUuid: string;
    exploreName: string;
    metricName: string;
    dateRange: MetricExplorerDateRange;
    timeFrame: TimeFrames;
    granularity: TimeFrames;
    comparisonType: MetricTotalComparisonType;
};

const postRunMetricTotal = async ({
    projectUuid,
    exploreName,
    metricName,
    dateRange,
    timeFrame,
    granularity,
    comparisonType,
}: RunMetricTotalArgs) => {
    const queryString = getUrlParams({
        dateRange,
        timeFrame,
        granularity,
    });

    return lightdashApi<ApiMetricsExplorerTotalResults['results']>({
        url: `/projects/${projectUuid}/metricsExplorer/${exploreName}/${metricName}/runMetricTotal${
            queryString ? `?${queryString}` : ''
        }`,
        method: 'POST',
        body: JSON.stringify({
            comparisonType,
        }),
    });
};

export const useRunMetricTotal = ({
    projectUuid,
    exploreName,
    metricName,
    dateRange,
    timeFrame,
    granularity,
    comparisonType,
    options,
}: Partial<RunMetricTotalArgs> & {
    options?: UseQueryOptions<ApiMetricsExplorerTotalResults['results']>;
}) => {
    return useQuery({
        queryKey: [
            'runMetricTotal',
            projectUuid,
            exploreName,
            metricName,
            dateRange?.[0],
            dateRange?.[1],
            timeFrame,
            granularity,
            comparisonType,
        ],
        queryFn: () =>
            postRunMetricTotal({
                projectUuid: projectUuid!,
                exploreName: exploreName!,
                metricName: metricName!,
                dateRange: dateRange!,
                timeFrame: timeFrame!,
                granularity: granularity!,
                comparisonType: comparisonType!,
            }),
        ...options,
    });
};
