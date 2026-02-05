import {
    METRICS_EXPLORER_DATE_FORMAT,
    type ApiCompiledQueryResults,
    type ApiMetricsExplorerTotalResults,
    type MetricExplorerDateRange,
    type MetricTotalComparisonType,
    type TimeFrames,
} from '@lightdash/common';
import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { lightdashApi } from '../../../api';

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

const postCompileMetricTotalQuery = async ({
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

    return lightdashApi<ApiCompiledQueryResults>({
        url: `/projects/${projectUuid}/metricsExplorer/${exploreName}/${metricName}/compileMetricTotalQuery${
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

export const useCompileMetricTotalQuery = ({
    projectUuid,
    exploreName,
    metricName,
    dateRange,
    timeFrame,
    granularity,
    comparisonType,
    options,
}: Partial<RunMetricTotalArgs> & {
    options?: UseQueryOptions<ApiCompiledQueryResults>;
}) => {
    return useQuery({
        queryKey: [
            'compileMetricTotalQuery',
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
            postCompileMetricTotalQuery({
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
