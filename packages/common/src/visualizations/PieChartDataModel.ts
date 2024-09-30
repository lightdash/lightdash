import { DimensionType } from '../types/field';
import { type RawResultRow } from '../types/results';
import { ChartKind } from '../types/savedCharts';
import {
    type SemanticLayerPivot,
    type SemanticLayerQuery,
} from '../types/semanticLayer';
import {
    VizAggregationOptions,
    VizIndexType,
    type PivotChartData,
    type VizConfigErrors,
    type VizPieChartConfig,
    type VizPieChartDisplay,
} from './types';
import {
    type IResultsRunner,
    type PivotChartLayout,
} from './types/IResultsRunner';

const defaultPieChartConfig: VizPieChartConfig = {
    metadata: {
        version: 1,
    },
    type: ChartKind.PIE,
    fieldConfig: {
        x: {
            reference: 'x',
            axisType: VizIndexType.CATEGORY,
            dimensionType: DimensionType.STRING,
        },
        y: [
            {
                reference: 'y',
                aggregation: VizAggregationOptions.SUM,
            },
        ],
        groupBy: [],
    },
};

export class PieChartDataModel {
    private readonly resultsRunner: IResultsRunner;

    private readonly config: VizPieChartConfig;

    private pivotedChartData: PivotChartData | undefined;

    constructor(args: {
        resultsRunner: IResultsRunner;
        config?: VizPieChartConfig;
    }) {
        this.resultsRunner = args.resultsRunner;
        this.config = args.config ?? defaultPieChartConfig;
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
            dimensionType: groupField.dimensionType,
            axisType: groupField.axisType,
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
        fieldConfig: PivotChartLayout | undefined,
    ): VizPieChartConfig {
        const newDefaultLayout = this.getDefaultLayout();

        const mergedLayout =
            newDefaultLayout?.x?.reference === fieldConfig?.x?.reference
                ? fieldConfig
                : newDefaultLayout;

        return {
            metadata: {
                version: 1,
            },
            type: chartKind,
            fieldConfig: mergedLayout,
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
        query: SemanticLayerQuery | undefined,
    ): Promise<PivotChartData | undefined> {
        if (!query) {
            return undefined;
        }

        return this.resultsRunner.getPivotedVisualizationData(query);
    }

    getEchartsSpec(
        transformedData: Awaited<ReturnType<typeof this.getTransformedData>>,
        display: VizPieChartDisplay | undefined,
    ) {
        if (!transformedData) {
            return {};
        }

        return {
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
                        value: result[transformedData.valuesColumns[0]],
                    })),
                },
            ],
        };
    }

    async getPivotedChartData({
        sortBy,
        filters,
        limit,
        sql,
    }: Pick<
        SemanticLayerQuery,
        'sortBy' | 'filters' | 'limit' | 'sql'
    >): Promise<PivotChartData | undefined> {
        // TODO: dupe code - see cartesian chart
        const allSelectedDimensions = [
            this.config.fieldConfig?.x?.reference,
            ...(this.config.fieldConfig?.groupBy?.map(
                (groupBy) => groupBy.reference,
            ) ?? []),
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
        const metrics =
            this.config.fieldConfig?.y?.map((y) => ({
                name: y.reference,
            })) ?? [];
        const pivot = {
            index: this.config?.fieldConfig?.x?.reference
                ? [this.config.fieldConfig.x?.reference]
                : [],
            on:
                this.config?.fieldConfig?.groupBy?.map(
                    (groupBy) => groupBy.reference,
                ) ?? [],
            values: this.config?.fieldConfig?.y?.map((y) => y.reference) ?? [],
        };
        const semanticQuery: SemanticLayerQuery = {
            filters,
            limit,
            sql,
            sortBy,
            dimensions,
            metrics,
            timeDimensions,
            pivot,
        };
        const pivotedChartData = await this.getTransformedData(semanticQuery);

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

    getSpec(display?: VizPieChartDisplay): Record<string, any> {
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
                        value: result[transformedData.valuesColumns[0]],
                    })),
                },
            ],
        };

        return spec;
    }
}
