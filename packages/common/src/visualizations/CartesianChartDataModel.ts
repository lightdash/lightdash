import { intersectionBy } from 'lodash';
import {
    capitalize,
    CustomFormatType,
    DimensionType,
    Format,
    friendlyName,
} from '../types/field';
import { type Organization } from '../types/organization';
import { type RawResultRow } from '../types/results';
import {
    ChartKind,
    ECHARTS_DEFAULT_COLORS,
    getEChartsChartTypeFromChartKind,
} from '../types/savedCharts';
import { type SemanticLayerQuery } from '../types/semanticLayer';
import { applyCustomFormat } from '../utils/formatting';
import {
    VizAggregationOptions,
    VizIndexType,
    type PivotChartData,
    type VizCartesianChartConfig,
    type VizCartesianChartOptions,
    type VizConfigErrors,
} from './types';
import {
    type IResultsRunner,
    type PivotChartLayout,
} from './types/IResultsRunner';

// Empty config as default. This makes sense to be defined by the DataModel,
// but is this the right place?
const defaultCartesianChartConfig: VizCartesianChartConfig = {
    metadata: {
        version: 1,
    },
    type: ChartKind.VERTICAL_BAR,
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

type CartesianChartKind = Extract<
    ChartKind,
    ChartKind.LINE | ChartKind.VERTICAL_BAR
>;

export class CartesianChartDataModel {
    private readonly resultsRunner: IResultsRunner;

    private readonly config: VizCartesianChartConfig;

    private readonly organization: Organization;

    private pivotedChartData: PivotChartData | undefined;

    constructor(args: {
        resultsRunner: IResultsRunner;
        config?: VizCartesianChartConfig;
        organization: Organization;
    }) {
        this.resultsRunner = args.resultsRunner;
        this.config = args.config ?? defaultCartesianChartConfig;
        this.organization = args.organization;
    }

    static getTooltipFormatter(format: Format | undefined) {
        if (format === Format.PERCENT) {
            return (value: number) =>
                applyCustomFormat(value, {
                    type: CustomFormatType.PERCENT,
                });
        }
        return undefined;
    }

    mergeConfig(
        chartKind: CartesianChartKind,
        existingLayout: PivotChartLayout | undefined,
    ): VizCartesianChartConfig {
        const newDefaultLayout = this.getDefaultLayout();

        const someFieldsMatch =
            existingLayout?.x?.reference === newDefaultLayout?.x?.reference ||
            intersectionBy(
                existingLayout?.y || [],
                newDefaultLayout?.y || [],
                'reference',
            ).length > 0;

        let mergedLayout: PivotChartLayout | undefined = existingLayout;

        if (!existingLayout || !someFieldsMatch) {
            mergedLayout = newDefaultLayout;
        }
        return {
            metadata: {
                version: 1,
            },
            type: chartKind,
            fieldConfig: mergedLayout,
        };
    }

    getChartOptions(): VizCartesianChartOptions {
        return {
            indexLayoutOptions: this.resultsRunner.getPivotQueryDimensions(),
            valuesLayoutOptions: {
                preAggregated: this.resultsRunner.getPivotQueryMetrics(),
                customAggregations:
                    this.resultsRunner.getPivotQueryCustomMetrics(),
            },
            pivotLayoutOptions: this.resultsRunner.getPivotQueryDimensions(),
        };
    }

    getDefaultLayout(): PivotChartLayout | undefined {
        const dimensions = this.resultsRunner.getPivotQueryDimensions();
        const metrics = this.resultsRunner.getPivotQueryMetrics();

        // TODO: the types could be cleaned up here to have fewer 'in' checks.
        const categoricalColumns = [...dimensions, ...metrics].filter(
            (column) =>
                'dimensionType' in column &&
                column.dimensionType === DimensionType.STRING,
        );
        const booleanColumns = [...dimensions, ...metrics].filter(
            (column) =>
                'dimensionType' in column &&
                column.dimensionType === DimensionType.BOOLEAN,
        );
        const dateColumns = [...dimensions, ...metrics].filter(
            (column) =>
                'dimensionType' in column &&
                [DimensionType.DATE, DimensionType.TIMESTAMP].includes(
                    column.dimensionType,
                ),
        );
        const numericColumns = [...dimensions, ...metrics].filter(
            (column) =>
                'dimensionType' in column &&
                column.dimensionType === DimensionType.NUMBER,
        );

        const xColumn =
            categoricalColumns[0] ||
            booleanColumns[0] ||
            dateColumns[0] ||
            numericColumns[0] ||
            dimensions[0];

        if (xColumn === undefined) {
            return undefined;
        }
        const x = {
            reference: xColumn.reference,
            axisType:
                'axisType' in xColumn
                    ? xColumn.axisType
                    : VizIndexType.CATEGORY,
            dimensionType:
                'dimensionType' in xColumn
                    ? xColumn.dimensionType
                    : DimensionType.STRING,
        };

        const yColumn =
            metrics[0] ||
            numericColumns.filter(
                (column) => column.reference !== x.reference,
            )[0] ||
            booleanColumns.filter(
                (column) => column.reference !== x.reference,
            )[0] ||
            categoricalColumns.filter(
                (column) => column.reference !== x.reference,
            )[0];

        if (yColumn === undefined) {
            return undefined;
        }

        const y = [
            {
                reference: yColumn.reference,
                aggregation:
                    'dimensionType' in yColumn &&
                    yColumn.dimensionType === DimensionType.NUMBER
                        ? VizAggregationOptions.SUM
                        : VizAggregationOptions.COUNT,
            },
        ];

        return {
            x,
            y,
            groupBy: [],
        };
    }

    getConfigErrors(config?: PivotChartLayout) {
        if (!config) {
            return undefined;
        }
        const { indexLayoutOptions, valuesLayoutOptions, pivotLayoutOptions } =
            this.getChartOptions();

        const indexFieldError = Boolean(
            config?.x?.reference &&
                indexLayoutOptions.find(
                    (x) => x.reference === config?.x?.reference,
                ) === undefined,
        );

        const metricFieldError = Boolean(
            config?.y?.some(
                (yField) =>
                    yField.reference &&
                    valuesLayoutOptions.preAggregated.find(
                        (y) => y.reference === yField.reference,
                    ) === undefined &&
                    valuesLayoutOptions.customAggregations.find(
                        (y) => y.reference === yField.reference,
                    ) === undefined,
            ),
        );

        const customMetricFieldError = Boolean(
            config?.y?.some(
                (yField) =>
                    yField.reference &&
                    valuesLayoutOptions.customAggregations.find(
                        (y) => y.reference === yField.reference,
                    ) === undefined,
            ),
        );
        const groupByFieldError = Boolean(
            config?.groupBy?.some(
                (groupByField) =>
                    groupByField.reference &&
                    pivotLayoutOptions.find(
                        (x) => x.reference === groupByField.reference,
                    ) === undefined,
            ),
        );

        if (
            !indexFieldError &&
            !metricFieldError &&
            !customMetricFieldError &&
            !groupByFieldError
        ) {
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
                            const valuesLayoutOption =
                                valuesLayoutOptions.preAggregated.find(
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
                                valuesLayoutOptions.customAggregations.find(
                                    (v) => v.reference === y.reference,
                                );
                            if (!valuesLayoutOption) {
                                acc.push(y.reference);
                            }
                            return acc;
                        }, []),
                    },
                }),
            ...(groupByFieldError &&
                config?.groupBy?.map((gb) => gb.reference) && {
                    groupByFieldError: {
                        references: config.groupBy.map((gb) => gb.reference),
                    },
                }),
        };
    }

    static getDefaultColor(index: number, orgColors?: string[]) {
        const colorPalette = orgColors || ECHARTS_DEFAULT_COLORS;
        // This code assigns a color to a series in the chart
        const color =
            colorPalette[
                index % colorPalette.length // This ensures we cycle through the colors if we have more series than colors
            ];
        return color;
    }

    // eslint-disable-next-line class-methods-use-this
    getEchartsSpec(
        transformedData: PivotChartData | undefined,
        display: CartesianChartDisplay | undefined,
        type: ChartKind,
        orgColors?: string[],
    ) {
        if (!transformedData) {
            return {};
        }

        const DEFAULT_X_AXIS_TYPE = 'category';

        const defaultSeriesType =
            type === ChartKind.VERTICAL_BAR ? 'bar' : 'line';

        const shouldStack = display?.stack === true;
        /*
        // For old colors method
        const possibleXAxisValues = transformedData.results.map((row) =>
            transformedData.indexColumn?.reference
                ? `${row[transformedData.indexColumn.reference]}`
                : '-',
        ); */

        const series = transformedData.valuesColumns.map(
            (seriesColumn, index) => {
                const isSingleAxis = transformedData.valuesColumns.length === 1;
                const foundSeries = Object.values(display?.series || {}).find(
                    (s) => s.yAxisIndex === index,
                );
                const {
                    format,
                    color,
                    label,
                    type: seriesChartType,
                } = foundSeries || {};

                // TODO: A small change was made here that I'm not sure is reflected in getSpec see PR #11648
                const singleYAxisLabel =
                    // NOTE: When there's only one y-axis left, set the label on the series as well
                    isSingleAxis && display?.yAxis?.[0]?.label
                        ? display.yAxis[0].label
                        : undefined;
                const singleYAxisFormat =
                    // NOTE: When there's only one y-axis left, set the format on the series as well
                    isSingleAxis && display?.yAxis?.[0]?.format
                        ? display.yAxis[0].format
                        : undefined;

                return {
                    dimensions: [
                        transformedData.indexColumn?.reference,
                        seriesColumn,
                    ],
                    type:
                        seriesChartType && !isSingleAxis
                            ? getEChartsChartTypeFromChartKind(seriesChartType)
                            : defaultSeriesType,
                    stack: shouldStack ? 'stack-all-series' : undefined, // TODO: we should implement more sophisticated stacking logic once we have multi-pivoted charts
                    name:
                        singleYAxisLabel ||
                        label ||
                        capitalize(seriesColumn.toLowerCase()).replaceAll(
                            '_',
                            ' ',
                        ), // similar to friendlyName, but this will preserve special characters
                    encode: {
                        x: transformedData.indexColumn?.reference,
                        y: seriesColumn,
                    },
                    yAxisIndex:
                        (display?.series &&
                            display.series[seriesColumn]?.yAxisIndex) ||
                        0,
                    tooltip: {
                        valueFormatter:
                            singleYAxisFormat || format
                                ? CartesianChartDataModel.getTooltipFormatter(
                                      singleYAxisFormat ?? format,
                                  )
                                : undefined,
                    },
                    color:
                        color ||
                        CartesianChartDataModel.getDefaultColor(
                            index,
                            orgColors,
                        ),
                    // this.getSeriesColor( seriesColumn, possibleXAxisValues, orgColors),
                };
            },
        );

        return {
            tooltip: {
                trigger: 'axis',
                appendToBody: true, // Similar to rendering a tooltip in a Portal
            },
            legend: {
                show: !!(transformedData.valuesColumns.length > 1),
                type: 'scroll',
            },
            xAxis: {
                type:
                    display?.xAxis?.type ||
                    transformedData.indexColumn?.type ||
                    DEFAULT_X_AXIS_TYPE,
                name:
                    display?.xAxis?.label ||
                    friendlyName(
                        transformedData.indexColumn?.reference || 'xAxisColumn',
                    ),
                nameLocation: 'center',
                nameGap: 30,
                nameTextStyle: {
                    fontWeight: 'bold',
                },
            },
            yAxis: [
                {
                    type: 'value',
                    position: display?.yAxis?.[0]?.position || 'left',
                    name:
                        (display?.yAxis && display.yAxis[0]?.label) ||
                        friendlyName(
                            transformedData.valuesColumns.length === 1
                                ? transformedData.valuesColumns[0]
                                : '',
                        ),
                    nameLocation: 'center',
                    nameGap: 50,
                    nameRotate: 90,
                    nameTextStyle: {
                        fontWeight: 'bold',
                    },
                    ...(display?.yAxis?.[0]?.format
                        ? {
                              axisLabel: {
                                  formatter:
                                      CartesianChartDataModel.getTooltipFormatter(
                                          display?.yAxis?.[0].format,
                                      ),
                              },
                          }
                        : {}),
                },
            ],
            dataset: {
                id: 'dataset',
                source: transformedData.results,
            },
            series,
        };
    }

    async getTransformedData(query?: SemanticLayerQuery) {
        if (!query) {
            return undefined;
        }

        return this.resultsRunner.getPivotedVisualizationData(query);
    }

    // TODO: dupe function code - see pie chart
    async getPivotedChartData({
        sortBy,
        filters,
        limit,
        sql,
    }: Pick<
        SemanticLayerQuery,
        'sortBy' | 'filters' | 'limit' | 'sql'
    >): Promise<PivotChartData | undefined> {
        const allDimensionNames = new Set(
            this.resultsRunner
                .getPivotQueryDimensions()
                .map((d) => d.reference),
        );
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
        const { customMetrics, metrics } = this.config.fieldConfig?.y?.reduce<{
            customMetrics: Required<SemanticLayerQuery>['customMetrics'];
            metrics: SemanticLayerQuery['metrics'];
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
            index: this.config?.fieldConfig?.x?.reference
                ? [this.config.fieldConfig.x?.reference]
                : [],
            on:
                this.config?.fieldConfig?.groupBy?.map(
                    (groupBy) => groupBy.reference,
                ) ?? [],
            values: metrics.map((metric) => metric.name),
        };
        const semanticQuery: SemanticLayerQuery = {
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
        const pivotedChartData = await this.getTransformedData(semanticQuery);

        this.pivotedChartData = pivotedChartData;

        return pivotedChartData;
    }

    getPivotedTableData():
        | {
              columns: string[];
              rows: RawResultRow[];
          }
        | undefined {
        const transformedData = this.pivotedChartData;
        if (!transformedData || !transformedData.results) {
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

    getSpec(display?: CartesianChartDisplay): Record<string, any> {
        const transformedData = this.pivotedChartData;

        if (!transformedData) {
            return {};
        }

        const type = this.config?.type;
        const { chartColors: orgColors } = this.organization;

        const DEFAULT_X_AXIS_TYPE = 'category';

        const defaultSeriesType =
            type === ChartKind.VERTICAL_BAR ? 'bar' : 'line';

        const shouldStack = display?.stack === true;
        /*
        // For old colors method
        const possibleXAxisValues = transformedData.results.map((row) =>
            transformedData.indexColumn?.reference
                ? `${row[transformedData.indexColumn.reference]}`
                : '-',
        ); */

        const series = transformedData.valuesColumns.map(
            (seriesColumn, index) => {
                const seriesFormat = Object.values(display?.series || {}).find(
                    (s) => s.yAxisIndex === index,
                )?.format;

                const singleYAxisLabel =
                    // NOTE: When there's only one y-axis left, set the label on the series as well
                    transformedData.valuesColumns.length === 1 && // PR NOTE: slight change to behaviour, only set label if there's a single value column (post-pivot) we want this to be fields pre-pivot
                    display?.yAxis?.[0]?.label
                        ? display.yAxis[0].label
                        : undefined;
                const seriesLabel =
                    singleYAxisLabel ??
                    Object.values(display?.series || {}).find(
                        (s) => s.yAxisIndex === index,
                    )?.label;

                const seriesColor = Object.values(display?.series || {}).find(
                    (s) => s.yAxisIndex === index,
                )?.color;

                return {
                    dimensions: [
                        transformedData.indexColumn?.reference,
                        seriesColumn,
                    ],
                    type: defaultSeriesType,
                    stack: shouldStack ? 'stack-all-series' : undefined, // TODO: we should implement more sophisticated stacking logic once we have multi-pivoted charts
                    name:
                        seriesLabel ||
                        capitalize(seriesColumn.toLowerCase()).replaceAll(
                            '_',
                            ' ',
                        ), // similar to friendlyName, but this will preserve special characters
                    encode: {
                        x: transformedData.indexColumn?.reference,
                        y: seriesColumn,
                    },
                    yAxisIndex:
                        (display?.series &&
                            display.series[seriesColumn]?.yAxisIndex) ||
                        0,
                    tooltip: {
                        valueFormatter: seriesFormat
                            ? CartesianChartDataModel.getTooltipFormatter(
                                  seriesFormat,
                              )
                            : undefined,
                    },
                    color:
                        seriesColor ||
                        CartesianChartDataModel.getDefaultColor(
                            index,
                            orgColors,
                        ),
                    // this.getSeriesColor( seriesColumn, possibleXAxisValues, orgColors),
                };
            },
        );

        const spec = {
            tooltip: {
                trigger: 'axis',
                appendToBody: true, // Similar to rendering a tooltip in a Portal
            },
            legend: {
                show: !!(transformedData.valuesColumns.length > 1),
                type: 'scroll',
            },
            xAxis: {
                type:
                    display?.xAxis?.type ||
                    transformedData.indexColumn?.type ||
                    DEFAULT_X_AXIS_TYPE,
                name:
                    display?.xAxis?.label ||
                    friendlyName(
                        transformedData.indexColumn?.reference || 'xAxisColumn',
                    ),
                nameLocation: 'center',
                nameGap: 30,
                nameTextStyle: {
                    fontWeight: 'bold',
                },
            },
            yAxis: [
                {
                    type: 'value',
                    position: display?.yAxis?.[0]?.position || 'left',
                    name:
                        (display?.yAxis && display.yAxis[0]?.label) ||
                        friendlyName(
                            transformedData.valuesColumns.length === 1
                                ? transformedData.valuesColumns[0]
                                : '',
                        ),
                    nameLocation: 'center',
                    nameGap: 50,
                    nameRotate: 90,
                    nameTextStyle: {
                        fontWeight: 'bold',
                    },
                    ...(display?.yAxis?.[0]?.format
                        ? {
                              axisLabel: {
                                  formatter:
                                      CartesianChartDataModel.getTooltipFormatter(
                                          display?.yAxis?.[0].format,
                                      ),
                              },
                          }
                        : {}),
                },
            ],
            dataset: {
                id: 'dataset',
                source: transformedData.results,
            },
            series,
        };

        return spec;
    }
}

export type CartesianChartDisplay = {
    xAxis?: {
        label?: string;
        type?: VizIndexType;
    };
    yAxis?: {
        label?: string;
        position?: string;
        format?: Format;
    }[];
    series?: {
        [key: string]: {
            label?: string;
            format?: Format;
            yAxisIndex?: number;
            color?: string;
            type?: ChartKind.LINE | ChartKind.VERTICAL_BAR;
        };
    };
    legend?: {
        position: 'top' | 'bottom' | 'left' | 'right';
        align: 'start' | 'center' | 'end';
    };
    stack?: boolean;
};
