import {
    isApiSqlRunnerJobPivotQuerySuccessResponse,
    isErrorDetails,
    VIZ_DEFAULT_AGGREGATION,
    type ApiJobScheduledResponse,
    type PivotChartData,
    type RawResultRow,
    type SqlRunnerPivotQueryBody,
    type VizChartLayout,
    type VizColumn,
} from '@lightdash/common';
import { lightdashApi } from '../../../api';
import { ResultsRunner } from '../../../components/DataViz/transformers/ResultsRunner';
import { getResultsFromStream } from '../../../utils/request';
import { getSqlRunnerCompleteJob } from '../hooks/requestUtils';

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
) => Promise<Omit<PivotChartData, 'columns'>>;

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
    columns: VizColumn[];
};

export class SqlRunnerResultsRunner extends ResultsRunner {
    // args should be rows, columns, values (blocked by db migration)
    async getPivotedVisualizationData(
        config: VizChartLayout,
        sql: string,
        projectUuid: string,
        limit: number,
        slug?: string,
        uuid?: string,
    ): Promise<PivotChartData> {
        if (config.x === undefined || config.y.length === 0) {
            return {
                results: [],
                indexColumn: undefined,
                valuesColumns: [],
                columns: [],
            };
        }

        const pivotResults = await pivotQueryFn({
            projectUuid,
            slug,
            uuid,
            sql,
            indexColumn: {
                reference: config.x.reference,
                type: config.x.type,
            },
            valuesColumns: config.y.map((y) => ({
                reference: y.reference,
                aggregation: y.aggregation ?? VIZ_DEFAULT_AGGREGATION,
            })),
            groupByColumns: config.groupBy,
            limit,
        });

        const columns: VizColumn[] = [
            ...(pivotResults.indexColumn?.reference
                ? [pivotResults.indexColumn.reference]
                : []),
            ...pivotResults.valuesColumns,
        ].map((field) => ({
            reference: field,
        }));

        return {
            results: pivotResults.results,
            indexColumn: pivotResults.indexColumn,
            valuesColumns: pivotResults.valuesColumns,
            columns,
        };
    }
}
