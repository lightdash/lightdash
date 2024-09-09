import {
    DimensionType,
    getAxisType,
    isApiSqlRunnerJobPivotQuerySuccessResponse,
    isErrorDetails,
    VizAggregationOptions,
    vizAggregationOptions,
    VizIndexType,
    VIZ_DEFAULT_AGGREGATION,
    type ApiJobScheduledResponse,
    type IResultsRunner,
    type PivotChartData,
    type RawResultRow,
    type SqlRunnerPivotQueryBody,
    type VizChartLayout,
    type VizColumn,
    type VizIndexLayoutOptions,
    type VizPivotLayoutOptions,
    type VizValuesLayoutOptions,
} from '@lightdash/common';
import { intersectionBy } from 'lodash';
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

export class SqlRunnerResultsRunner implements IResultsRunner<VizChartLayout> {
    protected readonly rows: RawResultRow[];

    protected readonly columns: VizColumn[];

    constructor({ rows, columns }: SqlRunnerResultsRunnerDeps) {
        this.rows = rows;
        this.columns = columns;
    }

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
                        type: VizIndexType.TIME,
                    });
                    break;
                case DimensionType.TIMESTAMP:
                    options.push({
                        reference: column.reference,
                        type: VizIndexType.TIME,
                    });
                    break;
                case DimensionType.STRING:
                case DimensionType.NUMBER:
                case DimensionType.BOOLEAN:
                    options.push({
                        reference: column.reference,
                        type: VizIndexType.CATEGORY,
                    });
                    break;
                default:
                    break;
            }
        }
        return options;
    }

    pivotChartValuesLayoutOptions(): VizValuesLayoutOptions[] {
        return this.columns.reduce<VizValuesLayoutOptions[]>((acc, column) => {
            switch (column.type) {
                case DimensionType.NUMBER:
                    return [
                        ...acc,
                        {
                            reference: column.reference,
                            aggregationOptions: vizAggregationOptions,
                        },
                    ];

                case DimensionType.STRING:
                case DimensionType.BOOLEAN:
                    return [
                        ...acc,
                        {
                            reference: column.reference,
                            aggregationOptions: vizAggregationOptions.filter(
                                (option) =>
                                    option === VizAggregationOptions.COUNT,
                            ),
                        },
                    ];

                default:
                    return acc;
            }
        }, [] as VizValuesLayoutOptions[]);
    }

    pivotChartOptions(): {
        indexLayoutOptions: VizIndexLayoutOptions[];
        valuesLayoutOptions: VizValuesLayoutOptions[];
        pivotLayoutOptions: VizPivotLayoutOptions[];
    } {
        return {
            indexLayoutOptions: this.pivotChartIndexLayoutOptions(),
            valuesLayoutOptions: this.pivotChartValuesLayoutOptions(),
            pivotLayoutOptions: this.pivotChartLayoutOptions(),
        };
    }

    defaultPivotChartLayout(): VizChartLayout | undefined {
        const categoricalColumns = this.columns.filter(
            (column) => column.type === DimensionType.STRING,
        );
        const booleanColumns = this.columns.filter(
            (column) => column.type === DimensionType.BOOLEAN,
        );
        const dateColumns = this.columns.filter(
            (column) =>
                column.type &&
                [DimensionType.DATE, DimensionType.TIMESTAMP].includes(
                    column.type,
                ),
        );
        const numericColumns = this.columns.filter(
            (column) => column.type === DimensionType.NUMBER,
        );

        const xColumn =
            categoricalColumns[0] ||
            booleanColumns[0] ||
            dateColumns[0] ||
            numericColumns[0];
        if (xColumn === undefined) {
            return undefined;
        }
        const x: VizChartLayout['x'] = {
            reference: xColumn.reference,
            type: getAxisType(xColumn),
        };

        const yColumn =
            numericColumns.filter(
                (column) => column.reference !== x.reference,
            )[0] ||
            booleanColumns.filter(
                (column) => column.reference !== x.reference,
            )[0] ||
            categoricalColumns.filter(
                (column) => column.reference !== x.reference,
            )[0] ||
            numericColumns[0] ||
            booleanColumns[0] ||
            categoricalColumns[0];

        if (yColumn === undefined) {
            return undefined;
        }
        const y: VizChartLayout['y'] = [
            {
                reference: yColumn.reference,
                aggregation:
                    yColumn.type === DimensionType.NUMBER
                        ? VizAggregationOptions.SUM
                        : VizAggregationOptions.COUNT,
            },
        ];

        return {
            x,
            y,
            groupBy: undefined,
        };
    }

    mergePivotChartLayout(currentConfig?: VizChartLayout) {
        const newDefaultLayout = this.defaultPivotChartLayout();

        const someFieldsMatch =
            currentConfig?.x?.reference === newDefaultLayout?.x?.reference ||
            intersectionBy(
                currentConfig?.y || [],
                newDefaultLayout?.y || [],
                'reference',
            ).length > 0;

        let mergedLayout = currentConfig;

        if (!currentConfig || !someFieldsMatch) {
            mergedLayout = newDefaultLayout;
        }

        return mergedLayout;
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
