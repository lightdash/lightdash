import {
    isApiSqlRunnerJobPivotQuerySuccessResponse,
    isErrorDetails,
    VIZ_DEFAULT_AGGREGATION,
    type ApiJobScheduledResponse,
    type PivotChartData,
    type RawResultRow,
    type RunPivotQuery,
    type SemanticLayerField,
    type SemanticLayerQuery,
    type SqlRunnerPivotQueryBody,
    type VizColumn,
    type VizSortBy,
} from '@lightdash/common';
import { lightdashApi } from '../../api';
import { getResultsFromStream } from '../../utils/request';
import { getSqlRunnerCompleteJob } from '../sqlRunner/hooks/requestUtils';
import { getVizIndexTypeFromSemanticLayerFieldType } from './BaseResultsRunner';

const schedulePivotSqlJob = async ({
    projectUuid,
    context,
    ...payload
}: {
    projectUuid: string;
    savedSqlUuid?: string;
    context?: string;
} & SqlRunnerPivotQueryBody) =>
    lightdashApi<ApiJobScheduledResponse['results']>({
        url: `/projects/${projectUuid}/sqlRunner/runPivotQuery${
            context ? `?context=${context}` : ''
        }`,
        method: 'POST',
        body: JSON.stringify(payload),
    });

type PivotQueryFn = (
    args: SqlRunnerPivotQueryBody & {
        projectUuid: string;
        savedSqlUuid?: string;
        context?: string;
    },
) => Promise<Omit<PivotChartData, 'columns'>>;

const pivotQueryFn: PivotQueryFn = async ({
    projectUuid,
    savedSqlUuid,
    context,
    ...args
}) => {
    const scheduledJob = await schedulePivotSqlJob({
        projectUuid,
        savedSqlUuid,
        context,
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
            fileUrl: url,
        };
    } else {
        throw job;
    }
};
// TODO: REMOVE THIS - temporary mapping logic - also needs access to fields :(
const convertSemanticLayerQueryToSqlRunnerPivotQuery = (
    query: SemanticLayerQuery,
    fields: SemanticLayerField[],
): Pick<
    SqlRunnerPivotQueryBody,
    'indexColumn' | 'groupByColumns' | 'valuesColumns'
> => {
    const index = fields.find((field) => field.name === query.pivot?.index[0]);
    const values = query.pivot?.values.map((value) => {
        const customMetric = query.customMetrics?.find(
            (metric) => metric.name === value,
        );

        // This should never be true
        if (!customMetric || customMetric.baseDimension === undefined) {
            throw new Error(
                'Unexpected error: incorrect pivot configuration, no metric',
            );
        }
        return {
            name: customMetric.baseDimension,
            aggregation: customMetric.aggType,
        };
    });
    const groupBy = query.pivot?.on.map((on) => {
        const f = fields.find((field) => field.name === on);
        if (!f) {
            throw new Error(
                'Unexpected error: incorrect pivot configuration, invalid groupBy',
            );
        }
        return f;
    });

    if (index === undefined || values === undefined || values.length === 0) {
        throw new Error('Unexpected error: incorrect pivot configuration');
    }
    return {
        indexColumn: {
            reference: index.name,
            type: getVizIndexTypeFromSemanticLayerFieldType(index.type),
        },
        valuesColumns: values.map((value) => ({
            reference: value.name,
            aggregation: value.aggregation ?? VIZ_DEFAULT_AGGREGATION,
        })),
        groupByColumns: groupBy?.map((f) => ({ reference: f.name })),
    };
};
// TEMPORARY
export const getPivotQueryFunctionForSqlRunner = ({
    projectUuid,
    savedSqlUuid,
    limit,
    sortBy,
    sql,
    fields,
    context,
}: {
    projectUuid: string;
    savedSqlUuid?: string;
    limit?: number;
    sql: string;
    sortBy?: VizSortBy[];
    fields: SemanticLayerField[];
    context?: string;
}): RunPivotQuery => {
    return async (query: SemanticLayerQuery) => {
        const index = query.pivot?.index[0];
        if (index === undefined) {
            return {
                results: [],
                indexColumn: undefined,
                valuesColumns: [],
                columns: [],
                fileUrl: undefined,
            };
        }
        const { indexColumn, valuesColumns, groupByColumns } =
            convertSemanticLayerQueryToSqlRunnerPivotQuery(query, fields);
        const pivotResults = await pivotQueryFn({
            projectUuid,
            savedSqlUuid,
            sql,
            indexColumn,
            valuesColumns,
            groupByColumns,
            limit,
            sortBy,
            context,
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
            fileUrl: pivotResults.fileUrl,
            results: pivotResults.results,
            indexColumn: pivotResults.indexColumn,
            valuesColumns: pivotResults.valuesColumns,
            columns,
        };
    };
};
