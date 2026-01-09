import {
    getMetricFlowQueryResults,
    QueryStatus,
} from '../../../api/MetricFlowAPI';

export const pollMetricFlowQueryResults = async (
    projectUuid: string,
    queryId: string,
): ReturnType<typeof getMetricFlowQueryResults> => {
    const response = await getMetricFlowQueryResults(projectUuid, queryId);
    if (
        response.query.status === QueryStatus.SUCCESSFUL ||
        response.query.status === QueryStatus.FAILED
    ) {
        return response;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return pollMetricFlowQueryResults(projectUuid, queryId);
};
