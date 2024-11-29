import {
    assertUnreachable,
    MetricExplorerComparison,
    type ApiError,
    type ApiMetricsExplorerQueryResults,
    type MetricExplorerComparisonType,
    type MetricExplorerDateRange,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';

type RunMetricExplorerQueryArgs = {
    projectUuid: string;
    exploreName: string;
    metricName: string;
    comparison: MetricExplorerComparisonType;
    dateRange?: MetricExplorerDateRange;
};

const getUrlParams = (
    comparison: MetricExplorerComparisonType,
    dateRange?: MetricExplorerDateRange,
) => {
    const params = new URLSearchParams();

    // Add comparison params
    switch (comparison.type) {
        case MetricExplorerComparison.NONE:
            break;
        case MetricExplorerComparison.PREVIOUS_PERIOD:
            params.append('compareToPreviousPeriod', 'true');
            break;
        case MetricExplorerComparison.DIFFERENT_METRIC:
            params.append('compareToMetric', comparison.metricName);
            break;
        default:
            return assertUnreachable(comparison, `Unknown comparison type`);
    }

    // Add date range params
    if (dateRange) {
        if (dateRange[0]) params.append('startDate', dateRange[0].toString());
        if (dateRange[1]) params.append('endDate', dateRange[1].toString());
    }

    return params.toString();
};

const postRunMetricExplorerQuery = async ({
    projectUuid,
    exploreName,
    metricName,
    comparison,
    dateRange,
}: RunMetricExplorerQueryArgs) => {
    const queryString = getUrlParams(comparison, dateRange);

    return lightdashApi<ApiMetricsExplorerQueryResults['results']>({
        url: `/projects/${projectUuid}/metricsExplorer/${exploreName}/${metricName}/runMetricExplorerQuery${
            queryString ? `?${queryString}` : ''
        }`,
        method: 'POST',
        body: undefined,
    });
};

export const useRunMetricExplorerQuery = ({
    projectUuid,
    exploreName,
    metricName,
    comparison,
    dateRange,
}: Partial<RunMetricExplorerQueryArgs>) => {
    return useQuery<ApiMetricsExplorerQueryResults['results'], ApiError>({
        queryKey: [
            'runMetricExplorerQuery',
            projectUuid,
            exploreName,
            metricName,
            comparison?.type ?? 'none',
            dateRange?.[0] ?? 'none',
            dateRange?.[1] ?? 'none',
        ],
        queryFn: () =>
            postRunMetricExplorerQuery({
                projectUuid: projectUuid!,
                exploreName: exploreName!,
                metricName: metricName!,
                comparison: comparison!,
                dateRange,
            }),
        enabled: !!projectUuid && !!exploreName && !!metricName && !!comparison,
    });
};
