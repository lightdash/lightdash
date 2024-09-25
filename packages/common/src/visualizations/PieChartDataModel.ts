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
    display: {},
};

export class PieChartDataModel {
    private readonly resultsRunner: IResultsRunner;

    private readonly config: VizPieChartConfig;

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
        display: VizPieChartDisplay | undefined,
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
            display,
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
        query: SemanticLayerQuery,
    ): Promise<PivotChartData> {
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

    // TODO: This should be specific to pie chart
    getPivotConfig(): SemanticLayerPivot {
        return {
            on: this.config?.fieldConfig?.x?.reference
                ? [this.config.fieldConfig.x?.reference]
                : [],
            index:
                this.config?.fieldConfig?.groupBy?.map(
                    (groupBy) => groupBy.reference,
                ) ?? [],
            values: this.config?.fieldConfig?.y?.map((y) => y.reference) ?? [],
        };
    }

    async getPivotedChartData(
        query: SemanticLayerQuery | undefined,
    ): Promise<PivotChartData | undefined> {
        if (!query) {
            return undefined;
        }

        return this.getTransformedData({
            ...query,
            pivot: this.getPivotConfig(),
        });
    }

    async getSpec(query?: SemanticLayerQuery): Promise<{
        spec: Record<string, any>;
        pivotedChartData:
            | { columns: string[]; rows: RawResultRow[] }
            | undefined;
    }> {
        const transformedData = await this.getPivotedChartData(query);

        if (!transformedData) {
            return {
                spec: {},
                pivotedChartData: undefined,
            };
        }

        const display = this.config?.display;

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

        return {
            spec,
            pivotedChartData: {
                columns: Object.keys(transformedData.results[0]) ?? [],
                rows: transformedData.results,
            },
        };
    }
}
