import {
    type ApiError,
    type ApiMetricsExplorerQueryResults,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';

type RunMetricExplorerQueryArgs = {
    projectUuid: string;
    exploreName: string;
    metricName: string;
};

const postRunMetricExplorerQuery = async ({
    projectUuid,
    exploreName,
    metricName,
}: RunMetricExplorerQueryArgs) => {
    return lightdashApi<ApiMetricsExplorerQueryResults['results']>({
        url: `/projects/${projectUuid}/metricsExplorer/${exploreName}/${metricName}/runMetricExplorerQuery`,
        method: 'POST',
        body: undefined,
    });
};

export const useRunMetricExplorerQuery = ({
    projectUuid,
    exploreName,
    metricName,
}: Partial<RunMetricExplorerQueryArgs>) => {
    return useQuery<ApiMetricsExplorerQueryResults['results'], ApiError>({
        queryKey: [
            'runMetricExplorerQuery',
            projectUuid,
            exploreName,
            metricName,
        ],
        queryFn: () =>
            postRunMetricExplorerQuery({
                projectUuid: projectUuid!,
                exploreName: exploreName!,
                metricName: metricName!,
            }),
        enabled: !!projectUuid && !!exploreName && !!metricName,
    });
};
