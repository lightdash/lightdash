import {
    assertUnreachable,
    ChartType,
    ECHARTS_DEFAULT_COLORS,
    type BigNumber,
    type CartesianChart,
    type CustomVis,
    type FunnelChart,
    type GaugeChart,
    type ParametersValuesMap,
    type PieChart,
    type SankeyChart,
    type TableChart,
    type TreemapChart,
} from '@lightdash/common';
import { type EChartsOption } from 'echarts';
import {
    buildBigNumberModel,
    resolveBigNumberChartConfig,
    type BigNumberModel,
} from './bigNumber';
import { resolveCartesianChartConfig } from './cartesian/config';
import { buildCartesianEchartsOption } from './cartesian/echartsOption';
import {
    toItemsMap,
    toVisualizationResults,
    type ChartData,
    type ChartView,
} from './chartData';
import {
    toColorAssignments,
    toColorMappings,
    type ColorAssignments,
} from './colors/assignments';
import { createSeriesColorResolver } from './colors/resolver';
import {
    buildCustomVisualizationData,
    resolveCustomVisualizationConfig,
    type CustomVisualizationData,
} from './custom';
import {
    buildFunnelEchartsOption,
    resolveFunnelChartConfig,
    type ResolvedFunnelChartConfig,
} from './funnel';
import {
    buildGaugeEchartsOption,
    getGaugeSizes,
    resolveGaugeChartConfig,
} from './gauge';
import {
    buildPieEchartsOption,
    getPieFieldPools,
    resolvePieChartConfig,
    type ResolvedPieChartConfig,
} from './pie';
import { buildSankeyEchartsOption, resolveSankeyChartConfig } from './sankey';
import { type SankeySeriesDataPoint } from './sankey/transform';
import {
    buildTableModel,
    getTableColumnWidth,
    getTableFieldLabelOverride,
    isTableColumnFrozen,
    isTableColumnVisible,
    resolveTableChartConfig,
    type ResolvedTableChartConfig,
    type TableModel,
} from './table';
import { LIGHT_VISUALIZATION_THEME, type VisualizationTheme } from './theme';
import { resolveThemeColors } from './themeColors';
import {
    buildTreemapEchartsOption,
    resolveTreemapChartConfig,
    type ResolvedTreemapChartConfig,
} from './treemap';

/** Legend entries the viewer turned off, by series name. */
export type LegendSelection = Record<string, boolean>;

/** The organisation's chart colours, and what earlier charts on the page assigned. */
export type ChartColors = {
    /** The colours series and groups take, in order. Defaults to ECharts' own. */
    palette?: string[];
    /** Assignments from earlier charts, so a group value keeps its colour across them. */
    assignments?: ColorAssignments;
    /**
     * Grouped series take a shared colour per group value (the same value is
     * the same colour in every chart) rather than the palette colour for
     * their position. The `CalculateSeriesColor` feature flag in Lightdash.
     */
    sharedSeriesColors?: boolean;
};

/** How to draw, as opposed to what: none of it changes what the chart says. */
export type RenderOptions = {
    /** Defaults to `LIGHT_VISUALIZATION_THEME`. */
    theme?: VisualizationTheme;
    colors?: ChartColors;
    /** The box the chart draws in, in px: gauges scale their text to it, outside legends truncate to it. */
    size?: { width: number; height: number };
    /** Animate the first draw. Defaults to true; off for exports and screenshots. */
    animation?: boolean;
    /**
     * Where tooltips float: in the document `body` (the default), or `inline`
     * in the chart, which touch devices need to keep a tooltip in place while
     * scrolling.
     */
    tooltip?: 'body' | 'inline';
    /** Legend entries turned off. Defaults to the chart's saved selection. */
    legendSelection?: LegendSelection;
    /** Parameter values, for formats and labels that read them. */
    parameters?: ParametersValuesMap;
};

export type EChartsChartType =
    | ChartType.CARTESIAN
    | ChartType.PIE
    | ChartType.FUNNEL
    | ChartType.TREEMAP
    | ChartType.GAUGE
    | ChartType.SANKEY;

/** Why there is nothing to draw. */
export type EmptyReason =
    /** The query returned no rows. */
    | 'noRows'
    /** The config names no field the data has, or the fields cannot be plotted as configured. */
    | 'incompleteConfig'
    /** The chart is pivoted but the data carries no `pivotDetails`. */
    | 'needsPivotDetails'
    /** The table is pivoted but the data carries no `pivotTable`. */
    | 'needsPivotTable';

/** What a chart draws as. */
export type RenderOutput =
    | { kind: 'echarts'; chartType: EChartsChartType; option: EChartsOption }
    | { kind: 'table'; chartType: ChartType.TABLE; model: TableModel }
    | {
          kind: 'bigNumber';
          chartType: ChartType.BIG_NUMBER;
          model: BigNumberModel;
      }
    | {
          kind: 'custom';
          chartType: ChartType.CUSTOM;
          /** The Vega-Lite spec, to draw with `data`. */
          spec: CustomVis['spec'];
          data: CustomVisualizationData;
      }
    | { kind: 'empty'; chartType: ChartType; reason: EmptyReason }
    /** Drawn outside this package: maps and data-app visualizations. */
    | {
          kind: 'unsupported';
          chartType: ChartType.MAP | ChartType.DATA_APP_VIZ;
      };

/** A drawn chart, and the colour assignments including its own. */
export type RenderedChart = RenderOutput & {
    colorAssignments: ColorAssignments;
};

type Resolved<T extends ChartType, Config, Derived = {}> = {
    chartType: T;
    /** The saved config with its defaults filled and stale references repaired. */
    config: Config;
    /** What the config and the data imply together, which the drawing needs. */
    derived: Derived;
};

/**
 * A chart resolved against its data, the way the explorer settles it when
 * the chart mounts: defaults filled, fields that left the data replaced,
 * series expanded for every y field and pivot value.
 */
export type ResolvedChart =
    | Resolved<ChartType.CARTESIAN, CartesianChart, { pivotColumns?: string[] }>
    | Resolved<
          ChartType.PIE,
          PieChart,
          Omit<ResolvedPieChartConfig, 'validConfig'>
      >
    | Resolved<
          ChartType.FUNNEL,
          FunnelChart,
          Omit<ResolvedFunnelChartConfig, 'validConfig'>
      >
    | Resolved<
          ChartType.TREEMAP,
          TreemapChart,
          Omit<ResolvedTreemapChartConfig, 'validConfig'>
      >
    | Resolved<ChartType.GAUGE, GaugeChart>
    | Resolved<ChartType.SANKEY, SankeyChart, { data: SankeySeriesDataPoint }>
    | Resolved<ChartType.BIG_NUMBER, BigNumber>
    | Resolved<
          ChartType.TABLE,
          TableChart,
          Omit<ResolvedTableChartConfig, 'validConfig'> & {
              columnOrder: string[];
              pivotColumns?: string[];
          }
      >
    | Resolved<ChartType.CUSTOM, CustomVis>
    | Resolved<ChartType.MAP | ChartType.DATA_APP_VIZ, unknown>;

const DEFAULT_SIZE = { width: 600, height: 400 };

const paletteOf = (options: RenderOptions | undefined) =>
    options?.colors?.palette ?? ECHARTS_DEFAULT_COLORS;

/**
 * Resolves a chart against its data: the one-shot equivalent of what the
 * explorer's editor settles on when the chart mounts.
 */
export const resolveChart = (
    chart: ChartView,
    data: ChartData,
    options?: Pick<RenderOptions, 'colors' | 'parameters'>,
): ResolvedChart => {
    const itemsMap = toItemsMap(data.fields);
    const resultsData = toVisualizationResults(data, itemsMap);
    const columnOrder = chart.tableConfig?.columnOrder ?? [];
    const pivotColumns = chart.pivotConfig?.columns;
    const colorPalette = paletteOf(options);
    const { chartConfig } = chart;

    switch (chartConfig.type) {
        case ChartType.CARTESIAN:
            return {
                chartType: ChartType.CARTESIAN,
                config: resolveCartesianChartConfig({
                    chartConfig: chartConfig.config,
                    resultsData,
                    itemsMap,
                    pivotKeys: pivotColumns,
                    columnOrder,
                }),
                derived: { pivotColumns },
            };
        case ChartType.PIE: {
            const { validConfig, ...derived } = resolvePieChartConfig({
                chartConfig: chartConfig.config,
                resultsData,
                itemsMap,
                colorPalette,
                parameters: options?.parameters,
            });
            return { chartType: ChartType.PIE, config: validConfig, derived };
        }
        case ChartType.FUNNEL: {
            const { validConfig, ...derived } = resolveFunnelChartConfig({
                chartConfig: chartConfig.config,
                resultsData,
                itemsMap,
                colorPalette,
            });
            return {
                chartType: ChartType.FUNNEL,
                config: validConfig,
                derived,
            };
        }
        case ChartType.TREEMAP: {
            const pools = getPieFieldPools(itemsMap);
            const { validConfig, ...derived } = resolveTreemapChartConfig({
                chartConfig: chartConfig.config,
                resultsData,
                itemsMap,
                dimensions: pools.dimensions,
                numericMetrics: pools.numericMetrics,
                groupedSubtotals: data.groupedSubtotals,
            });
            return {
                chartType: ChartType.TREEMAP,
                config: validConfig,
                derived,
            };
        }
        case ChartType.GAUGE:
            return {
                chartType: ChartType.GAUGE,
                config: resolveGaugeChartConfig({
                    chartConfig: chartConfig.config,
                    itemsMap,
                }),
                derived: {},
            };
        case ChartType.SANKEY: {
            const { validConfig, data: sankeyData } = resolveSankeyChartConfig({
                chartConfig: chartConfig.config,
                resultsData,
                itemsMap,
            });
            return {
                chartType: ChartType.SANKEY,
                config: validConfig,
                derived: { data: sankeyData },
            };
        }
        case ChartType.BIG_NUMBER:
            return {
                chartType: ChartType.BIG_NUMBER,
                config: resolveBigNumberChartConfig({
                    chartConfig: chartConfig.config,
                    itemsMap,
                }),
                derived: {},
            };
        case ChartType.TABLE: {
            const { validConfig, ...derived } = resolveTableChartConfig({
                chartConfig: chartConfig.config,
                resultsData,
                itemsMap,
                columnOrder,
                pivotDimensions: pivotColumns,
                pivotRows: chart.pivotConfig?.rows,
            });
            return {
                chartType: ChartType.TABLE,
                config: validConfig,
                derived: { ...derived, columnOrder, pivotColumns },
            };
        }
        case ChartType.CUSTOM:
            return {
                chartType: ChartType.CUSTOM,
                config: resolveCustomVisualizationConfig({
                    chartConfig: chartConfig.config,
                }),
                derived: {},
            };
        case ChartType.MAP:
        case ChartType.DATA_APP_VIZ:
            return {
                chartType: chartConfig.type,
                config: chartConfig.config,
                derived: {},
            };
        default:
            return assertUnreachable(chartConfig, 'Unknown chart type');
    }
};

const hasPivotColumns = (pivotColumns: string[] | undefined) =>
    pivotColumns !== undefined && pivotColumns.length > 0;

/** Draws a resolved chart. */
export const buildChart = (
    resolved: ResolvedChart,
    data: ChartData,
    options: RenderOptions = {},
): RenderedChart => {
    const itemsMap = toItemsMap(data.fields);
    const resultsData = toVisualizationResults(data, itemsMap);
    const theme = options.theme ?? LIGHT_VISUALIZATION_THEME;
    const colorPalette = paletteOf(options);
    const size = options.size ?? DEFAULT_SIZE;
    const colorMappings = toColorMappings(options.colors?.assignments);
    const context = {
        resultsData,
        itemsMap,
        parameters: options.parameters,
        resolvedTimezone: data.timezone ?? undefined,
        animation: options.animation ?? true,
        tooltipAppendToBody: (options.tooltip ?? 'body') === 'body',
    };
    const colorResolver = () =>
        createSeriesColorResolver({
            colorPalette,
            colorMappings,
            nullColor: theme.neutral[6],
            chartConfig:
                resolved.chartType === ChartType.CARTESIAN
                    ? { type: ChartType.CARTESIAN, config: resolved.config }
                    : undefined,
            itemsMap,
            calculateSeriesColor: options.colors?.sharedSeriesColors ?? false,
        });
    const done = (output: RenderOutput): RenderedChart => ({
        ...output,
        colorAssignments: toColorAssignments(colorMappings),
    });
    const noRows = data.rows.length === 0;
    const empty = (chartType: ChartType, reason?: EmptyReason) =>
        done({
            kind: 'empty',
            chartType,
            reason: reason ?? (noRows ? 'noRows' : 'incompleteConfig'),
        });
    const echarts = (
        chartType: EChartsChartType,
        option: EChartsOption | undefined,
    ) =>
        option
            ? done({
                  kind: 'echarts',
                  chartType,
                  // Plain colours, so the option draws the same without
                  // Lightdash's stylesheet. The web app's hooks call the
                  // builders directly and keep the CSS variables.
                  option: resolveThemeColors(option, theme),
              })
            : empty(chartType);

    switch (resolved.chartType) {
        case ChartType.CARTESIAN: {
            const { config, derived } = resolved;
            if (hasPivotColumns(derived.pivotColumns) && !data.pivotDetails) {
                return empty(ChartType.CARTESIAN, 'needsPivotDetails');
            }
            return echarts(
                ChartType.CARTESIAN,
                buildCartesianEchartsOption({
                    ...context,
                    validCartesianConfig: config,
                    tooltipHtmlTemplate: config.eChartsConfig.tooltip,
                    tooltipSort: config.eChartsConfig.tooltipSort,
                    pivotDimensions: derived.pivotColumns,
                    getSeriesColor: colorResolver().getSeriesColor,
                    colorPalette,
                    theme,
                    legendSelected:
                        options.legendSelection ??
                        config.eChartsConfig.legend?.selected,
                    chartWidth: size.width,
                }) as EChartsOption | undefined,
            );
        }
        case ChartType.PIE:
            return echarts(
                ChartType.PIE,
                buildPieEchartsOption({
                    ...context,
                    pieChartConfig: {
                        validConfig: resolved.config,
                        ...resolved.derived,
                    },
                    getGroupColor: colorResolver().getGroupColor,
                    theme,
                    legendSelected: options.legendSelection,
                })?.eChartsOption,
            );
        case ChartType.FUNNEL:
            return echarts(
                ChartType.FUNNEL,
                buildFunnelEchartsOption({
                    ...context,
                    validFunnelConfig: resolved.config,
                    data: resolved.derived.data,
                    maxValue: resolved.derived.maxValue,
                    selectedField: resolved.derived.selectedField,
                    colorDefaults: resolved.derived.colorDefaults,
                    colorPalette,
                    theme,
                    legendSelected: options.legendSelection,
                }) as EChartsOption | undefined,
            );
        case ChartType.TREEMAP:
            return echarts(
                ChartType.TREEMAP,
                buildTreemapEchartsOption({
                    ...context,
                    treemapConfig: {
                        validConfig: resolved.config,
                        ...resolved.derived,
                    },
                    colorPalette,
                    theme,
                })?.eChartsOption as EChartsOption | undefined,
            );
        case ChartType.GAUGE:
            return echarts(
                ChartType.GAUGE,
                buildGaugeEchartsOption({
                    ...context,
                    validGaugeConfig: resolved.config,
                    theme,
                    ...getGaugeSizes(size),
                }) as EChartsOption | undefined,
            );
        case ChartType.SANKEY:
            return echarts(
                ChartType.SANKEY,
                buildSankeyEchartsOption({
                    ...context,
                    validSankeyConfig: resolved.config,
                    data: resolved.derived.data,
                    colorPalette,
                    theme,
                }) as EChartsOption | undefined,
            );
        case ChartType.BIG_NUMBER:
            if (noRows) return empty(ChartType.BIG_NUMBER, 'noRows');
            return done({
                kind: 'bigNumber',
                chartType: ChartType.BIG_NUMBER,
                model: buildBigNumberModel({
                    resultsData,
                    itemsMap,
                    parameters: options.parameters,
                    chartConfig: resolved.config,
                }),
            });
        case ChartType.TABLE: {
            const { config, derived } = resolved;
            const pivoted = hasPivotColumns(derived.pivotColumns);
            if (pivoted && !data.pivotTable) {
                return empty(ChartType.TABLE, 'needsPivotTable');
            }
            const columnProperties = config.columns ?? {};
            // Without a query the selection is every field, in the chart's order.
            const selectedItemIds =
                derived.selectedItemIds ??
                (derived.columnOrder.length > 0
                    ? derived.columnOrder
                    : Object.keys(itemsMap));
            return done({
                kind: 'table',
                chartType: ChartType.TABLE,
                model: buildTableModel({
                    itemsMap,
                    selectedItemIds,
                    isColumnVisible: (id) =>
                        isTableColumnVisible(columnProperties, id),
                    isColumnFrozen: (id) =>
                        isTableColumnFrozen(columnProperties, id),
                    getColumnWidth: (id) =>
                        getTableColumnWidth(columnProperties, id),
                    showTableNames: config.showTableNames ?? false,
                    getFieldLabelOverride: (id) =>
                        getTableFieldLabelOverride(columnProperties, id),
                    columnOrder:
                        derived.columnOrder.length > 0
                            ? derived.columnOrder
                            : selectedItemIds,
                    totals: data.totals,
                    groupedSubtotals: data.groupedSubtotals,
                    parameters: options.parameters,
                    rows: data.rows,
                    pivotDimensions: derived.pivotColumns,
                    pivotData: data.pivotTable,
                }),
            });
        }
        case ChartType.CUSTOM:
            return done({
                kind: 'custom',
                chartType: ChartType.CUSTOM,
                spec: resolved.config.spec,
                data: buildCustomVisualizationData(resultsData),
            });
        case ChartType.MAP:
        case ChartType.DATA_APP_VIZ:
            return done({ kind: 'unsupported', chartType: resolved.chartType });
        default:
            return assertUnreachable(resolved, 'Unknown chart type');
    }
};

/**
 * Draws a chart from its data: the one call a renderer makes. The same as
 * `buildChart(resolveChart(chart, data, options), data, options)`.
 */
export const renderChart = (
    chart: ChartView,
    data: ChartData,
    options?: RenderOptions,
): RenderedChart =>
    buildChart(resolveChart(chart, data, options), data, options);
