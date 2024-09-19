import {
    assertUnreachable,
    DimensionType,
    FieldType,
    isApiSqlRunnerJobPivotQuerySuccessResponse,
    isErrorDetails,
    SemanticLayerFieldType,
    VIZ_DEFAULT_AGGREGATION,
    type ApiJobScheduledResponse,
    type IResultsRunner,
    type PivotChartData,
    type RawResultRow,
    type RunPivotQuery,
    type SemanticLayerField,
    type SemanticLayerQuery,
    type SqlRunnerPivotQueryBody,
    type VizColumn,
    type VizSortBy,
} from '@lightdash/common';
import { lightdashApi } from '../../../api';
import { getResultsFromStream } from '../../../utils/request';
import {
    BaseResultsRunner,
    getVizIndexTypeFromSemanticLayerFieldType,
} from '../../semanticViewer/runners/SemanticViewerResultsRunner';
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
            fileUrl: url,
        };
    } else {
        throw job;
    }
};

const getSemanticLayerFieldTypeFromDimensionType = (
    type: DimensionType,
): SemanticLayerFieldType => {
    switch (type) {
        case DimensionType.STRING:
            return SemanticLayerFieldType.STRING;
        case DimensionType.NUMBER:
            return SemanticLayerFieldType.NUMBER;
        case DimensionType.BOOLEAN:
            return SemanticLayerFieldType.BOOLEAN;
        case DimensionType.DATE:
        case DimensionType.TIMESTAMP:
            return SemanticLayerFieldType.TIME;
        default:
            return assertUnreachable(type, `Unknown field type: ${type}`);
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
        if (!customMetric) {
            throw new Error('Unexpected error: incorrect pivot configuration');
        }
        return customMetric;
    });
    const groupBy = query.pivot?.on.map((on) => {
        const f = fields.find((field) => field.name === on);
        if (!f) {
            throw new Error('Unexpected error: incorrect pivot configuration');
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
            aggregation: value.aggType ?? VIZ_DEFAULT_AGGREGATION,
        })),
        groupByColumns: groupBy?.map((f) => ({ reference: f.name })),
    };
};

// TEMPORARY
export const getPivotQueryFunctionForSqlRunner = ({
    projectUuid,
    slug,
    uuid,
    limit,
    sortBy,
    sql,
    fields,
}: {
    projectUuid: string;
    slug?: string;
    uuid?: string;
    limit: number;
    sql: string;
    sortBy?: VizSortBy[];
    fields: SemanticLayerField[];
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
            slug,
            uuid,
            sql,
            indexColumn,
            valuesColumns,
            groupByColumns,
            limit,
            sortBy,
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

export class SqlRunnerResultsRunnerFrontend
    extends BaseResultsRunner
    implements IResultsRunner
{
    constructor({
        columns,
        rows,
        projectUuid,
        limit,
        sql,
        slug,
        uuid,
    }: {
        columns: VizColumn[];
        rows: RawResultRow[];
        projectUuid: string;
        limit: number;
        sql: string;
        slug?: string;
        uuid?: string;
    }) {
        const fields: SemanticLayerField[] = columns.map((column) => ({
            kind: FieldType.DIMENSION,
            name: column.reference,
            type: getSemanticLayerFieldTypeFromDimensionType(
                column.type || DimensionType.STRING,
            ),
            visible: true,
            label: column.reference,
            // why are these required?
            availableGranularities: [],
            availableOperators: [],
        }));
        super({
            fields,
            rows,
            columnNames: fields.map((field) => field.name),
            runPivotQuery: getPivotQueryFunctionForSqlRunner({
                projectUuid,
                slug,
                uuid,
                limit,
                sql,
                fields,
            }),
        });
    }
}
