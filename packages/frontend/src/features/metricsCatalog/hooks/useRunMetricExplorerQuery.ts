import {
    assertUnreachable,
    MetricExplorerComparison,
    type ApiError,
    type ApiMetricsExplorerQueryResults,
    type MetricExplorerComparisonType,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';

type RunMetricExplorerQueryArgs = {
    projectUuid: string;
    exploreName: string;
    metricName: string;
    comparison: MetricExplorerComparisonType;
};

const getUrlParams = (comparison: MetricExplorerComparisonType) => {
    const params = new URLSearchParams();
    switch (comparison.type) {
        case MetricExplorerComparison.NONE:
            return undefined;
        case MetricExplorerComparison.PREVIOUS_PERIOD:
            params.append('compareToPreviousPeriod', 'true');
            return params.toString();
        case MetricExplorerComparison.DIFFERENT_METRIC:
            params.append('compareToMetric', comparison.metricName);
            return params.toString();
        default:
            return assertUnreachable(comparison, `Unknown comparison type`);
    }
};

const postRunMetricExplorerQuery = async ({
    projectUuid,
    exploreName,
    metricName,
    comparison,
}: RunMetricExplorerQueryArgs) => {
    const queryString = getUrlParams(comparison);

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
}: Partial<RunMetricExplorerQueryArgs>) => {
    return useQuery<ApiMetricsExplorerQueryResults['results'], ApiError>({
        queryKey: [
            'runMetricExplorerQuery',
            projectUuid,
            exploreName,
            metricName,
            comparison?.type ?? 'none',
        ],
        queryFn: () =>
            postRunMetricExplorerQuery({
                projectUuid: projectUuid!,
                exploreName: exploreName!,
                metricName: metricName!,
                comparison: comparison!,
            }),
        enabled: !!projectUuid && !!exploreName && !!metricName && !!comparison,
    });
};
