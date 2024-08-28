import {
    isApiSqlRunnerJobPivotQuerySuccessResponse,
    isErrorDetails,
    type ApiJobScheduledResponse,
    type PivotChartData,
    type RawResultRow,
    type SqlRunnerPivotQueryBody,
    type VizChartLayout,
    type VizSqlColumn,
} from '@lightdash/common';
import { lightdashApi } from '../../../api';
import { ResultsRunner } from '../../../components/DataViz/transformers/ResultsRunner';
import {
    getResultsFromStream,
    getSqlRunnerCompleteJob,
} from '../hooks/requestUtils';

const schedulePivotSqlJob = async ({
    projectUuid,
    ...payload
}: {
    projectUuid: string;
} & SqlRunnerPivotQueryBody) =>
    lightdashApi<ApiJobScheduledResponse['results']>({
        url: `/projects/${projectUuid}/sqlRunner/runPivotQuery`,
        method: 'POST',
        body: JSON.stringify(payload),
    });

type PivotQueryFn = (
    args: SqlRunnerPivotQueryBody & {
        projectUuid: string;
    },
) => Promise<PivotChartData>;

const pivotQueryFn: PivotQueryFn = async ({ projectUuid, ...args }) => {
    const scheduledJob = await schedulePivotSqlJob({
        projectUuid,
        ...args,
    });

    const job = await getSqlRunnerCompleteJob(scheduledJob.jobId);

    if (isApiSqlRunnerJobPivotQuerySuccessResponse(job)) {
        const url =
            job.details && !isErrorDetails(job.details)
                ? job.details.fileUrl
                : undefined;
        const results = await getResultsFromStream<RawResultRow>(url);

        return {
            results,
            indexColumn: job.details.indexColumn,
            valuesColumns: job.details.valuesColumns,
        };
    } else {
        throw job;
    }
};

export type SqlRunnerResultsRunnerDeps = {
    rows: RawResultRow[];
    columns: VizSqlColumn[];
};

export class SqlRunnerResultsRunner extends ResultsRunner {
    // args should be rows, columns, values (blocked by db migration)
    public async getPivotChartData(
        config: VizChartLayout,
        sql: string,
        projectUuid: string,
        limit: number,
    ): Promise<PivotChartData> {
        const pivotResults = await pivotQueryFn({
            projectUuid,
            sql,
            indexColumn: {
                reference: config.x.reference,
                type: config.x.type,
            },
            valuesColumns: config.y.map((y) => ({
                reference: y.reference,
                aggregation: y.aggregation,
            })),
            groupByColumns: config.groupBy,
            limit,
        });

        return {
            results: pivotResults.results,
            indexColumn: pivotResults.indexColumn,
            valuesColumns: pivotResults.valuesColumns,
        };
    }
}
