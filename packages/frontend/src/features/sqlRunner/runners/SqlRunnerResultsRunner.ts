import {
    DimensionType,
    isApiSqlRunnerJobPivotQuerySuccessResponse,
    isErrorDetails,
    MetricType,
    VizAggregationOptions,
    vizAggregationOptions,
    VizIndexType,
    VIZ_DEFAULT_AGGREGATION,
    type ApiJobScheduledResponse,
    type IResultsRunner,
    type PivotChartData,
    type RawResultRow,
    type SqlRunnerPivotChartLayout,
    type SqlRunnerPivotQueryBody,
    type VizColumn,
    type VizCustomMetricLayoutOptions,
    type VizIndexLayoutOptions,
    type VizPivotLayoutOptions,
    type VizValuesLayoutOptions,
} from '@lightdash/common';
import { lightdashApi } from '../../../api';
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

export class SqlRunnerResultsRunner implements IResultsRunner {
    protected readonly rows: RawResultRow[];

    protected readonly columns: VizColumn[];

    constructor({ rows, columns }: SqlRunnerResultsRunnerDeps) {
        this.rows = rows;
        this.columns = columns;
    }

    // args should be rows, columns, values (blocked by db migration)
    async getPivotedVisualizationData(
        config: SqlRunnerPivotChartLayout,
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
                type: config.x.axisType,
            },
            valuesColumns: config.y.map((y) => ({
                reference: y.reference,
                aggregation: y.aggregation ?? VIZ_DEFAULT_AGGREGATION,
            })),
            groupByColumns:
                config.groupBy && config.groupBy.length > 0
                    ? config.groupBy
                    : undefined,
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

    pivotChartLayoutOptions(): VizPivotLayoutOptions[] {
        const options: VizPivotLayoutOptions[] = [];
        for (const column of this.columns) {
            switch (column.type) {
                case DimensionType.STRING:
                case DimensionType.BOOLEAN:
                    options.push({
                        reference: column.reference,
                    });
                    break;
                default:
                    break;
            }
        }
        return options;
    }

    // should the conversion from DimensionType to XLayoutType actually be done in an echarts specific function?
    // The output 'category' | 'time' is echarts specific. or is this more general?
    pivotChartIndexLayoutOptions(): VizIndexLayoutOptions[] {
        const options: VizIndexLayoutOptions[] = [];
        for (const column of this.columns) {
            switch (column.type) {
                case DimensionType.DATE:
                    options.push({
                        reference: column.reference,
                        axisType: VizIndexType.TIME,
                        dimensionType: column.type,
                    });
                    break;
                case DimensionType.TIMESTAMP:
                    options.push({
                        reference: column.reference,
                        axisType: VizIndexType.TIME,
                        dimensionType: column.type,
                    });
                    break;
                case DimensionType.STRING:
                case DimensionType.NUMBER:
                case DimensionType.BOOLEAN:
                    options.push({
                        reference: column.reference,
                        axisType: VizIndexType.CATEGORY,
                        dimensionType: column.type,
                    });
                    break;
                default:
                    break;
            }
        }
        return options;
    }

    pivotChartValuesLayoutOptions(): VizCustomMetricLayoutOptions[] {
        return this.columns.reduce<VizCustomMetricLayoutOptions[]>(
            (acc, column) => {
                switch (column.type) {
                    case DimensionType.NUMBER:
                        return [
                            ...acc,
                            {
                                reference: column.reference,
                                aggregationOptions: vizAggregationOptions,
                                metricType: MetricType.NUMBER,
                                dimensionType: DimensionType.NUMBER,
                                axisType: VizIndexType.CATEGORY,
                            },
                        ];

                    case DimensionType.STRING:
                    case DimensionType.BOOLEAN:
                        return [
                            ...acc,
                            {
                                reference: column.reference,
                                aggregationOptions:
                                    vizAggregationOptions.filter(
                                        (option) =>
                                            option ===
                                            VizAggregationOptions.COUNT,
                                    ),
                                metricType: MetricType.COUNT,
                                dimensionType: column.type,
                                axisType: VizIndexType.CATEGORY,
                            },
                        ];

                    default:
                        return acc;
                }
            },
            [] as VizCustomMetricLayoutOptions[],
        );
    }

    getDimensions(): VizIndexLayoutOptions[] {
        return this.pivotChartIndexLayoutOptions();
    }

    getMetrics(): VizValuesLayoutOptions[] {
        return this.pivotChartValuesLayoutOptions();
    }

    getPivotQueryDimensions(): VizIndexLayoutOptions[] {
        return this.pivotChartIndexLayoutOptions();
    }

    getPivotQueryMetrics(): VizValuesLayoutOptions[] {
        // SQL Runner doesn't support pre-aggregated metrics
        return [];
    }

    getPivotQueryCustomMetrics(): VizCustomMetricLayoutOptions[] {
        return this.pivotChartValuesLayoutOptions();
    }

    getColumns(): string[] {
        return this.columns.map((column) => column.reference);
    }

    // Shared
    getColumnsAccessorFn(column: string) {
        return (row: RawResultRow) => row[column];
    }

    getRows() {
        return this.rows;
    }
}
