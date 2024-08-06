import {
    isErrorDetails,
    type ApiError,
    type ApiSqlChartWithResults,
    type ResultRow,
    type SqlChart,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';
import { getResultsFromStream, getSqlRunnerCompleteJob } from './requestUtils';

const getSqlChartAndResults = async ({
    projectUuid,
    savedSqlUuid,
}: {
    projectUuid: string;
    savedSqlUuid: string;
}): Promise<{ results: ResultRow[]; chart: SqlChart }> => {
    const chartAndScheduledJob = await lightdashApi<
        ApiSqlChartWithResults['results']
    >({
        url: `/projects/${projectUuid}/sqlRunner/saved/${savedSqlUuid}/chart-and-results`,
        method: 'GET',
        body: undefined,
    });
    const job = await getSqlRunnerCompleteJob(chartAndScheduledJob.jobId);
    const url =
        job?.details && !isErrorDetails(job.details)
            ? job.details.fileUrl
            : undefined;
    const results = await getResultsFromStream(url);

    return {
        chart: chartAndScheduledJob.chart,
        results,
    };
};

export const useSqlChartAndResults = ({
    savedSqlUuid,
    projectUuid,
}: {
    savedSqlUuid: string | null;
    projectUuid: string;
}) => {
    return useQuery<{ results: ResultRow[]; chart: SqlChart }, ApiError>(
        ['sqlChartResults', projectUuid, savedSqlUuid],
        () => {
            return getSqlChartAndResults({
                projectUuid,
                savedSqlUuid: savedSqlUuid!,
            });
        },
        {
            enabled: Boolean(savedSqlUuid),
        },
    );
};
