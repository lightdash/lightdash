import { type AnyType } from '../types/any';
import { DimensionType } from '../types/field';
import { type RawResultRow } from '../types/results';
import { type ChartKind } from '../types/savedCharts';
import { type SqlRunnerQuery } from '../types/sqlRunner';
import {
    VizAggregationOptions,
    VizIndexType,
    type PivotChartData,
    type PivotChartLayout,
    type VizConfigErrors,
    type VizPieChartConfig,
    type VizPieChartDisplay,
} from './types';
import { type IResultsRunner } from './types/IResultsRunner';

const defaultFieldConfig: PivotChartLayout = {
    x: {
        reference: 'x',
        type: VizIndexType.CATEGORY,
    },
    y: [
        {
            reference: 'y',
            aggregation: VizAggregationOptions.SUM,
        },
    ],
    groupBy: [],
};

export class PieChartDataModel {
    private readonly resultsRunner: IResultsRunner;

    private readonly fieldConfig: PivotChartLayout;

    private pivotedChartData: PivotChartData | undefined;

    constructor(args: {
        resultsRunner: IResultsRunner;
        fieldConfig?: PivotChartLayout;
    }) {
        this.resultsRunner = args.resultsRunner;
        this.fieldConfig = args.fieldConfig ?? defaultFieldConfig;
    }

    getDefaultLayout(): PivotChartLayout | undefined {
        const {
            groupFieldOptions,
            metricFieldOptions,
            customMetricFieldOptions,
        } = this.getResultOptions();

        const categoricalFields = groupFieldOptions.filter(
            (field) => field.dimensionType === DimensionType.STRING,
        );
        const booleanFields = groupFieldOptions.filter(
            (field) => field.dimensionType === DimensionType.BOOLEAN,
        );
        const dateFields = groupFieldOptions.filter(
            (field) =>
                field.dimensionType &&
                [DimensionType.DATE, DimensionType.TIMESTAMP].includes(
                    field.dimensionType,
                ),
        );
        const numericFields = groupFieldOptions.filter(
            (field) => field.dimensionType === DimensionType.NUMBER,
        );

        const groupField =
            categoricalFields[0] ||
            booleanFields[0] ||
            dateFields[0] ||
            numericFields[0];
        if (groupField === undefined) {
            return undefined;
        }

        const group = {
            reference: groupField.reference,
            type: groupField.axisType,
        };

        const metricFields = [
            ...metricFieldOptions,
            ...customMetricFieldOptions,
        ];

        const metricField = metricFields.filter(
            (field) => field.reference !== group.reference,
        )[0];

        if (metricField === undefined) {
            return undefined;
        }

        // TODO: this should have its own type so it doesnt reference x and y
        return {
            x: group,
            y: [
                {
                    reference: metricField.reference,
                    aggregation: metricField.aggregation,
                },
            ],
            groupBy: [],
        };
    }

    mergeConfig(
        chartKind: ChartKind.PIE,
        currentVizConfig?: VizPieChartConfig,
    ): VizPieChartConfig {
        const newDefaultLayout = this.getDefaultLayout();

        const mergedLayout =
            newDefaultLayout?.x?.reference ===
            currentVizConfig?.fieldConfig?.x?.reference
                ? currentVizConfig?.fieldConfig
                : newDefaultLayout;

        return {
            metadata: {
                version: 1,
            },
            type: chartKind,
            fieldConfig: mergedLayout ?? currentVizConfig?.fieldConfig,
            display: currentVizConfig?.display ?? {},
        };
    }

    getResultOptions() {
        return {
            groupFieldOptions: this.resultsRunner.getPivotQueryDimensions(),
            metricFieldOptions: this.resultsRunner.getPivotQueryMetrics(),
            customMetricFieldOptions:
                this.resultsRunner.getPivotQueryCustomMetrics(),
        };
    }

    getConfigErrors(config?: PivotChartLayout) {
        if (!config) {
            return undefined;
        }
        const {
            groupFieldOptions,
            metricFieldOptions,
            customMetricFieldOptions,
        } = this.getResultOptions();

        const indexFieldError = Boolean(
            config?.x?.reference &&
                groupFieldOptions.find(
                    (x) => x.reference === config?.x?.reference,
                ) === undefined,
        );

        const metricFieldError = Boolean(
            config?.y?.some(
                (yField) =>
                    yField.reference &&
                    metricFieldOptions.find(
                        (y) => y.reference === yField.reference,
                    ) === undefined,
            ),
        );

        const customMetricFieldError = Boolean(
            config?.y?.some(
                (yField) =>
                    yField.reference &&
                    customMetricFieldOptions.find(
                        (y) => y.reference === yField.reference,
                    ) === undefined,
            ),
        );

        if (!indexFieldError && !metricFieldError && !customMetricFieldError) {
            return undefined;
        }

        return {
            ...(indexFieldError &&
                config?.x?.reference && {
                    indexFieldError: {
                        reference: config.x.reference,
                    },
                }),
            // TODO: can we combine metricFieldError and customMetricFieldError?
            // And maybe take out some noise
            ...(metricFieldError &&
                config?.y?.map((y) => y.reference) && {
                    metricFieldError: {
                        references: config?.y.reduce<
                            NonNullable<
                                VizConfigErrors['metricFieldError']
                            >['references']
                        >((acc, y) => {
                            const valuesLayoutOption = metricFieldOptions.find(
                                (v) => v.reference === y.reference,
                            );
                            if (!valuesLayoutOption) {
                                acc.push(y.reference);
                            }
                            return acc;
                        }, []),
                    },
                }),
            ...(customMetricFieldError &&
                config?.y?.map((y) => y.reference) && {
                    customMetricFieldError: {
                        references: config?.y.reduce<
                            NonNullable<
                                VizConfigErrors['customMetricFieldError']
                            >['references']
                        >((acc, y) => {
                            const valuesLayoutOption =
                                customMetricFieldOptions.find(
                                    (v) => v.reference === y.reference,
                                );
                            if (!valuesLayoutOption) {
                                acc.push(y.reference);
                            }
                            return acc;
                        }, []),
                    },
                }),
        };
    }

    async getTransformedData(
        query: SqlRunnerQuery | undefined,
    ): Promise<PivotChartData | undefined> {
        if (!query) {
            return undefined;
        }

        return this.resultsRunner.getPivotedVisualizationData(query);
    }

    // TODO: dupe function code - see cartesian chart
    async getPivotedChartData({
        sortBy,
        filters,
        limit,
        sql,
    }: Pick<SqlRunnerQuery, 'sortBy' | 'filters' | 'limit' | 'sql'>): Promise<
        PivotChartData | undefined
    > {
        const allDimensionNames = new Set(
            this.resultsRunner
                .getPivotQueryDimensions()
                .map((d) => d.reference),
        );
        const allSelectedDimensions = [
            this.fieldConfig.x?.reference,
            ...(this.fieldConfig.groupBy?.map((groupBy) => groupBy.reference) ??
                []),
        ];
        const [timeDimensions, dimensions] = this.resultsRunner
            .getPivotQueryDimensions()
            .reduce<
                [
                    { name: string }[],
                    {
                        name: string;
                    }[],
                ]
            >(
                (acc, dimension) => {
                    if (allSelectedDimensions.includes(dimension.reference)) {
                        if (
                            dimension.dimensionType === DimensionType.DATE ||
                            dimension.dimensionType === DimensionType.TIMESTAMP
                        ) {
                            acc[0].push({ name: dimension.reference });
                        } else {
                            acc[1].push({ name: dimension.reference });
                        }
                    }
                    return acc;
                },
                [[], []],
            );
        const { customMetrics, metrics } = this.fieldConfig.y?.reduce<{
            customMetrics: Required<SqlRunnerQuery>['customMetrics'];
            metrics: SqlRunnerQuery['metrics'];
        }>(
            (acc, field) => {
                if (allDimensionNames.has(field.reference)) {
                    // it's a custom metric
                    const name = `${field.reference}_${field.aggregation}`;
                    acc.customMetrics.push({
                        name,
                        baseDimension: field.reference,
                        aggType: field.aggregation,
                    });
                    acc.metrics.push({ name });
                } else {
                    acc.metrics.push({ name: field.reference });
                }
                return acc;
            },
            { customMetrics: [], metrics: [] },
        ) ?? { customMetrics: [], metrics: [] };
        const pivot = {
            index: this.fieldConfig.x?.reference
                ? [this.fieldConfig.x?.reference]
                : [],
            on:
                this.fieldConfig.groupBy?.map((groupBy) => groupBy.reference) ??
                [],
            values: metrics.map((metric) => metric.name),
        };
        const query: SqlRunnerQuery = {
            sql,
            limit,
            filters,
            sortBy,
            metrics,
            dimensions,
            timeDimensions,
            pivot,
            customMetrics,
        };
        const pivotedChartData = await this.getTransformedData(query);

        this.pivotedChartData = pivotedChartData;

        return pivotedChartData;
    }

    getPivotedTableData(): // TODO: pass display options and use them

    | {
              columns: string[];
              rows: RawResultRow[];
          }
        | undefined {
        const transformedData = this.pivotedChartData;
        if (!transformedData) {
            return undefined;
        }

        return {
            columns: Object.keys(transformedData.results[0]) ?? [],
            rows: transformedData.results,
        };
    }

    getDataDownloadUrl(): string | undefined {
        const transformedData = this.pivotedChartData;
        if (!transformedData) {
            return undefined;
        }

        return transformedData.fileUrl;
    }

    getSpec(display?: VizPieChartDisplay): Record<string, AnyType> {
        const transformedData = this.pivotedChartData;

        if (!transformedData) {
            return {};
        }

        const spec = {
            legend: {
                show: true,
                orient: 'horizontal',
                type: 'scroll',
                left: 'center',
                top: 'top',
                align: 'auto',
            },
            tooltip: {
                trigger: 'item',
            },
            series: [
                {
                    type: 'pie',
                    radius: display?.isDonut ? ['30%', '70%'] : '50%',
                    center: ['50%', '50%'],
                    data: transformedData.results.map((result) => ({
                        name: transformedData.indexColumn?.reference
                            ? result[transformedData.indexColumn.reference]
                            : '-',
                        groupId: transformedData.indexColumn?.reference,
                        // Pie chart uses only the first value column, though others
                        // could be returned from the pivot query. If the pie chart
                        // ever supports pivoting, we'll need to update this.
                        value: result[
                            transformedData.valuesColumns[0].pivotColumnName
                        ],
                    })),
                },
            ],
        };

        return spec;
    }
}
