import {
    metricExploreDataPointWithDateValueSchema,
    type ApiMetricsExplorerQueryResults,
    type ApiMetricsExplorerTotalResults,
    type MetricExplorerComparisonType,
    type MetricExplorerDateRange,
    type MetricsExplorerQueryResults,
    type TimeDimensionConfig,
    type TimeFrames,
} from '@lightdash/common';
import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { z } from 'zod';
import { lightdashApi } from '../../../api';

type RunMetricExplorerQueryArgs = {
    projectUuid: string;
    exploreName: string;
    metricName: string;
    dateRange: MetricExplorerDateRange;
    comparison: MetricExplorerComparisonType;
    timeDimensionOverride?: TimeDimensionConfig;
    options?: UseQueryOptions<ApiMetricsExplorerQueryResults['results']>;
};

const getUrlParams = ({
    dateRange,
    timeFrame,
}: {
    dateRange: MetricExplorerDateRange;
    timeFrame?: TimeFrames;
}) => {
    const params = new URLSearchParams();

    // Add date range params
    if (dateRange) {
        params.append('startDate', dateRange[0].toString());
        params.append('endDate', dateRange[1].toString());
    }

    // Add time frame param
    if (timeFrame) {
        params.append('timeFrame', timeFrame);
    }

    return params.toString();
};

const postRunMetricExplorerQuery = async ({
    projectUuid,
    exploreName,
    metricName,
    comparison,
    dateRange,
    timeDimensionOverride,
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
            comparison,
        }),
    });

    return {
        ...response,
        results: z
            .array(metricExploreDataPointWithDateValueSchema)
            .parse(response.results),
    };
};

export const useRunMetricExplorerQuery = ({
    projectUuid,
    exploreName,
    metricName,
    comparison,
    dateRange,
    timeDimensionOverride,
    options,
}: Partial<RunMetricExplorerQueryArgs>) => {
    return useQuery({
        queryKey: [
            'runMetricExplorerQuery',
            projectUuid,
            exploreName,
            metricName,
            dateRange?.[0],
            dateRange?.[1],
            comparison,
            timeDimensionOverride,
        ],
        queryFn: () =>
            postRunMetricExplorerQuery({
                projectUuid: projectUuid!,
                exploreName: exploreName!,
                metricName: metricName!,
                comparison: comparison!,
                dateRange: dateRange!,
                timeDimensionOverride,
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
};

const getMetricTotal = async ({
    projectUuid,
    exploreName,
    metricName,
    dateRange,
    timeFrame,
}: RunMetricTotalArgs) => {
    const queryString = getUrlParams({
        dateRange,
        timeFrame,
    });

    return lightdashApi<ApiMetricsExplorerTotalResults['results']>({
        url: `/projects/${projectUuid}/metricsExplorer/${exploreName}/${metricName}/runMetricTotal${
            queryString ? `?${queryString}` : ''
        }`,
        method: 'GET',
        body: undefined,
    });
};

export const useRunMetricTotal = ({
    projectUuid,
    exploreName,
    metricName,
    dateRange,
    timeFrame,
    options,
}: Partial<RunMetricTotalArgs> & {
    options?: UseQueryOptions<ApiMetricsExplorerTotalResults['results']>;
}) => {
    return useQuery({
        queryKey: ['runMetricTotal', projectUuid, exploreName, metricName],
        queryFn: () =>
            getMetricTotal({
                projectUuid: projectUuid!,
                exploreName: exploreName!,
                metricName: metricName!,
                dateRange: dateRange!,
                timeFrame: timeFrame!,
            }),
        ...options,
    });
};
