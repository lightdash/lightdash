import {
    METRICS_EXPLORER_DATE_FORMAT,
    type ApiCompiledQueryResults,
    type ApiMetricsExplorerQueryResults,
    type ApiMetricsExplorerTotalResults,
    type MetricExplorerDateRange,
    type MetricTotalComparisonType,
    type TimeFrames,
} from '@lightdash/common';
import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { type LightdashApi } from '../../../api';
import { useLightdashApi } from '../../../providers/LightdashApi/useLightdashApi';

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
    rollingDays?: number;
};

const postRunMetricTotal = async (
    lightdashApi: LightdashApi,
    {
        projectUuid,
        exploreName,
        metricName,
        dateRange,
        timeFrame,
        granularity,
        comparisonType,
        rollingDays,
    }: RunMetricTotalArgs,
) => {
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
            rollingDays,
        }),
    });
};

const postCompileMetricTotalQuery = async (
    lightdashApi: LightdashApi,
    {
        projectUuid,
        exploreName,
        metricName,
        dateRange,
        timeFrame,
        granularity,
        comparisonType,
        rollingDays,
    }: RunMetricTotalArgs,
) => {
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
            rollingDays,
        }),
    });
};

type RunMetricSeriesArgs = {
    projectUuid: string;
    exploreName: string;
    metricName: string;
    dateRange: MetricExplorerDateRange;
    granularity: TimeFrames;
};

const postRunMetricSeries = async (
    lightdashApi: LightdashApi,
    {
        projectUuid,
        exploreName,
        metricName,
        dateRange,
        granularity,
    }: RunMetricSeriesArgs,
) => {
    const queryString = getUrlParams({
        dateRange,
        granularity,
    });

    return lightdashApi<ApiMetricsExplorerQueryResults['results']>({
        url: `/projects/${projectUuid}/metricsExplorer/${exploreName}/${metricName}/runMetricSeries${
            queryString ? `?${queryString}` : ''
        }`,
        method: 'POST',
        body: undefined,
    });
};

export const useRunMetricSeries = ({
    projectUuid,
    exploreName,
    metricName,
    dateRange,
    granularity,
    options,
}: Partial<RunMetricSeriesArgs> & {
    options?: UseQueryOptions<ApiMetricsExplorerQueryResults['results']>;
}) => {
    const lightdashApi = useLightdashApi();
    return useQuery({
        queryKey: [
            'runMetricSeries',
            projectUuid,
            exploreName,
            metricName,
            granularity,
            dateRange?.[0],
            dateRange?.[1],
        ],
        queryFn: () =>
            postRunMetricSeries(lightdashApi, {
                projectUuid: projectUuid!,
                exploreName: exploreName!,
                metricName: metricName!,
                dateRange: dateRange!,
                granularity: granularity!,
            }),
        ...options,
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
    rollingDays,
    options,
}: Partial<RunMetricTotalArgs> & {
    options?: UseQueryOptions<ApiMetricsExplorerTotalResults['results']>;
}) => {
    const lightdashApi = useLightdashApi();
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
            rollingDays,
        ],
        queryFn: () =>
            postRunMetricTotal(lightdashApi, {
                projectUuid: projectUuid!,
                exploreName: exploreName!,
                metricName: metricName!,
                dateRange: dateRange!,
                timeFrame: timeFrame!,
                granularity: granularity!,
                comparisonType: comparisonType!,
                rollingDays,
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
    rollingDays,
    options,
}: Partial<RunMetricTotalArgs> & {
    options?: UseQueryOptions<ApiCompiledQueryResults>;
}) => {
    const lightdashApi = useLightdashApi();
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
            rollingDays,
        ],
        queryFn: () =>
            postCompileMetricTotalQuery(lightdashApi, {
                projectUuid: projectUuid!,
                exploreName: exploreName!,
                metricName: metricName!,
                dateRange: dateRange!,
                timeFrame: timeFrame!,
                granularity: granularity!,
                comparisonType: comparisonType!,
                rollingDays,
            }),
        ...options,
    });
};
