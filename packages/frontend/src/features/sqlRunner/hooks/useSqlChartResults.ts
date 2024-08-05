import {
    isErrorDetails,
    type ApiError,
    type ApiJobScheduledResponse,
    type ResultRow,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';
import { getResultsFromStream, getSqlRunnerCompleteJob } from './requestUtils';

const getSqlChartResults = async ({
    projectUuid,
    slug,
}: {
    projectUuid: string;
    slug: string;
}) => {
    const scheduledJob = await lightdashApi<ApiJobScheduledResponse['results']>(
        {
            url: `/projects/${projectUuid}/sqlRunner/saved/slug/${slug}/results-job`,
            method: 'GET',
            body: undefined,
        },
    );
    const job = await getSqlRunnerCompleteJob(scheduledJob.jobId);
    const url =
        job?.details && !isErrorDetails(job.details)
            ? job.details.fileUrl
            : undefined;
    return getResultsFromStream(url);
};

export const useSqlChartResults = (
    projectUuid: string,
    slug: string | undefined,
) => {
    return useQuery<ResultRow[] | undefined, ApiError>(
        ['sqlChartResults', projectUuid, slug],
        () => {
            return getSqlChartResults({
                projectUuid,
                slug: slug!,
            });
        },
        {
            enabled: Boolean(slug),
        },
    );
};
