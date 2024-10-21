import {
    isApiSqlRunnerJobErrorResponse,
    isApiSqlRunnerJobSuccessResponse,
    isErrorDetails,
    type ApiJobScheduledResponse,
} from '@lightdash/common';
import { lightdashApi } from '../../../api';
import { getSqlRunnerCompleteJob } from './requestUtils';
import { type useResultsFromStreamWorker } from './useResultsFromStreamWorker';

const getSqlChartResults = async ({
    url,
    getResultsFromStream,
    context,
}: {
    url: string;
    getResultsFromStream: ReturnType<
        typeof useResultsFromStreamWorker
    >['getResultsFromStream'];
    context: string | undefined;
}) => {
    const scheduledJob = await lightdashApi<ApiJobScheduledResponse['results']>(
        {
            url: `${url}${context ? `?context=${context}` : ''}`,
            method: 'GET',
            body: undefined,
        },
    );
    const job = await getSqlRunnerCompleteJob(scheduledJob.jobId);

    if (isApiSqlRunnerJobErrorResponse(job)) {
        throw job;
    }
    const fileUrl =
        isApiSqlRunnerJobSuccessResponse(job) &&
        job?.details &&
        !isErrorDetails(job.details)
            ? job.details.fileUrl
            : undefined;
    const results = await getResultsFromStream(fileUrl);

    return {
        fileUrl: fileUrl!,
        results,
        columns:
            isApiSqlRunnerJobSuccessResponse(job) &&
            job?.details &&
            !isErrorDetails(job.details)
                ? job.details.columns
                : [],
    };
};

export const getSqlChartResultsByUuid = async ({
    projectUuid,
    chartUuid,
    getResultsFromStream,
    context,
}: {
    projectUuid: string;
    chartUuid: string;
    getResultsFromStream: Parameters<
        typeof getSqlChartResults
    >[0]['getResultsFromStream'];
    context: Parameters<typeof getSqlChartResults>[0]['context'];
}) => {
    return getSqlChartResults({
        url: `/projects/${projectUuid}/sqlRunner/saved/${chartUuid}/results-job`,
        getResultsFromStream,
        context,
    });
};
