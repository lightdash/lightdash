import {
    assertUnreachable,
    ChartType,
    type ChartConfig,
    type ItemsMap,
    type ParametersValuesMap,
    type PivotData,
    type SavedChart,
} from '@lightdash/common';
import { type EChartsOption } from 'echarts';
import {
    buildBigNumberModel,
    resolveBigNumberChartConfig,
    type BigNumberModel,
} from './bigNumber';
import { resolveCartesianChartConfig } from './cartesian/config';
import { buildCartesianEchartsOption } from './cartesian/echartsOption';
import { createColorMappings, type ColorMappings } from './colors/mappings';
import { createSeriesColorResolver } from './colors/resolver';
import {
    buildCustomVisualizationData,
    resolveCustomVisualizationConfig,
    type CustomVisualizationData,
} from './custom';
import { buildFunnelEchartsOption, resolveFunnelChartConfig } from './funnel';
import {
    buildGaugeEchartsOption,
    getGaugeSizes,
    resolveGaugeChartConfig,
} from './gauge';
import {
    buildPieEchartsOption,
    getPieFieldPools as getFieldPools,
    resolvePieChartConfig,
} from './pie';
import { buildSankeyEchartsOption, resolveSankeyChartConfig } from './sankey';
import {
    buildTableModel,
    getTableColumnWidth,
    getTableFieldLabelOverride,
    isTableColumnFrozen,
    isTableColumnVisible,
    resolveTableChartConfig,
    type TableModel,
} from './table';
import { LIGHT_VISUALIZATION_THEME, type VisualizationTheme } from './theme';
import {
    buildTreemapEchartsOption,
    resolveTreemapChartConfig,
    type TreemapGroupedSubtotals,
} from './treemap';
import { type VisualizationResults } from './types';

/**
 * Everything `renderChart` needs, all of it data: a saved chart's config,
 * the results of its query and the field definitions. Nothing here runs a
 * query or touches the DOM.
 */
export type RenderChartInput = {
    /** The saved chart's `chartConfig`: its type and per-type config. */
    chartConfig: ChartConfig;
    /** The saved chart's pivot and column order, when it has them. */
    pivotConfig?: SavedChart['pivotConfig'];
    columnOrder?: string[];
    results: VisualizationResults;
    itemsMap: ItemsMap;
    /** The org's chart colors. */
    colorPalette: string[];
    theme?: VisualizationTheme;
    /**
     * Shared color mappings, so the same group value gets the same color in
     * every chart of a page. Left out, each render starts its own.
     */
    colorMappings?: ColorMappings;
    parameters?: ParametersValuesMap;
    resolvedTimezone?: string;
    /** Whether the `CalculateSeriesColor` feature flag is on for the org. */
    calculateSeriesColor?: boolean;
    /** Animate series on first draw; off for exports and screenshots. */
    animation?: boolean;
    /** The box the chart renders in, in px; gauges scale their text to it. */
    size?: { width: number; height: number };
    /** Values that need a further query: totals and subtotals. */
    totals?: Record<string, number>;
    groupedSubtotals?: TreemapGroupedSubtotals;
    /** Pivoted table data, when the table is a pivot. */
    pivotData?: PivotData;
};

export type RenderedChart =
    | {
          kind: 'echarts';
          chartType:
              | ChartType.CARTESIAN
              | ChartType.PIE
              | ChartType.FUNNEL
              | ChartType.TREEMAP
              | ChartType.GAUGE
              | ChartType.SANKEY;
          option: EChartsOption;
      }
    | { kind: 'table'; chartType: ChartType.TABLE; model: TableModel }
    | {
          kind: 'bigNumber';
          chartType: ChartType.BIG_NUMBER;
          model: BigNumberModel;
      }
    | {
          kind: 'custom';
          chartType: ChartType.CUSTOM;
          spec: unknown;
          data: CustomVisualizationData;
      }
    /** A chart type this package does not draw: maps and data-app visualizations. */
    | { kind: 'unsupported'; chartType: ChartType }
    /** Nothing to draw: no rows, or a config with no usable field. */
    | { kind: 'empty'; chartType: ChartType };

const DEFAULT_SIZE = { width: 600, height: 400 };

/**
 * Renders any saved chart: the one call a headless consumer makes. Resolves
 * the saved config against the results the way the explorer does when it
 * mounts a chart, then builds the render output for the chart's type.
 */
export const renderChart = ({
    chartConfig,
    pivotConfig,
    columnOrder = [],
    results,
    itemsMap,
    colorPalette,
    theme = LIGHT_VISUALIZATION_THEME,
    colorMappings = createColorMappings(),
    parameters,
    resolvedTimezone,
    calculateSeriesColor = false,
    animation = true,
    size = DEFAULT_SIZE,
    totals,
    groupedSubtotals,
    pivotData,
}: RenderChartInput): RenderedChart => {
    const pivotKeys = pivotConfig?.columns;
    const context = {
        resultsData: results,
        itemsMap,
        parameters,
        resolvedTimezone: resolvedTimezone ?? results.resolvedTimezone,
        animation,
    };
    const colors = (config: ChartConfig) =>
        createSeriesColorResolver({
            colorPalette,
            colorMappings,
            nullColor: theme.neutral[6],
            chartConfig: config,
            itemsMap,
            calculateSeriesColor,
        });
    const echarts = (
        chartType: Extract<RenderedChart, { kind: 'echarts' }>['chartType'],
        option: EChartsOption | undefined,
    ): RenderedChart =>
        option
            ? { kind: 'echarts', chartType, option }
            : { kind: 'empty', chartType };

    switch (chartConfig.type) {
        case ChartType.CARTESIAN: {
            const validCartesianConfig = resolveCartesianChartConfig({
                chartConfig: chartConfig.config,
                resultsData: results,
                itemsMap,
                pivotKeys,
                columnOrder,
            });
            const { getSeriesColor } = colors({
                type: ChartType.CARTESIAN,
                config: validCartesianConfig,
            });
            return echarts(
                ChartType.CARTESIAN,
                buildCartesianEchartsOption({
                    ...context,
                    validCartesianConfig,
                    tooltipHtmlTemplate:
                        validCartesianConfig.eChartsConfig.tooltip,
                    tooltipSort: validCartesianConfig.eChartsConfig.tooltipSort,
                    pivotDimensions: pivotKeys,
                    getSeriesColor,
                    colorPalette,
                    theme,
                    chartWidth: size.width,
                }) as EChartsOption | undefined,
            );
        }
        case ChartType.PIE: {
            const pieChartConfig = resolvePieChartConfig({
                chartConfig: chartConfig.config,
                resultsData: results,
                itemsMap,
                colorPalette,
                parameters,
            });
            const { getGroupColor } = colors(chartConfig);
            return echarts(
                ChartType.PIE,
                buildPieEchartsOption({
                    ...context,
                    pieChartConfig,
                    getGroupColor,
                    theme,
                })?.eChartsOption,
            );
        }
        case ChartType.FUNNEL: {
            const funnel = resolveFunnelChartConfig({
                chartConfig: chartConfig.config,
                resultsData: results,
                itemsMap,
                colorPalette,
            });
            return echarts(
                ChartType.FUNNEL,
                buildFunnelEchartsOption({
                    ...context,
                    validFunnelConfig: funnel.validConfig,
                    data: funnel.data,
                    maxValue: funnel.maxValue,
                    selectedField: funnel.selectedField,
                    colorDefaults: funnel.colorDefaults,
                    colorPalette,
                    theme,
                }) as EChartsOption | undefined,
            );
        }
        case ChartType.TREEMAP: {
            const pools = getFieldPools(itemsMap);
            const treemap = resolveTreemapChartConfig({
                chartConfig: chartConfig.config,
                resultsData: results,
                itemsMap,
                dimensions: pools.dimensions,
                numericMetrics: pools.numericMetrics,
                groupedSubtotals,
            });
            return echarts(
                ChartType.TREEMAP,
                buildTreemapEchartsOption({
                    ...context,
                    treemapConfig: treemap,
                    colorPalette,
                    theme,
                })?.eChartsOption as EChartsOption | undefined,
            );
        }
        case ChartType.GAUGE: {
            const validGaugeConfig = resolveGaugeChartConfig({
                chartConfig: chartConfig.config,
                itemsMap,
            });
            return echarts(
                ChartType.GAUGE,
                buildGaugeEchartsOption({
                    ...context,
                    validGaugeConfig,
                    theme,
                    ...getGaugeSizes(size),
                }) as EChartsOption | undefined,
            );
        }
        case ChartType.SANKEY: {
            const sankey = resolveSankeyChartConfig({
                chartConfig: chartConfig.config,
                resultsData: results,
                itemsMap,
            });
            return echarts(
                ChartType.SANKEY,
                buildSankeyEchartsOption({
                    ...context,
                    validSankeyConfig: sankey.validConfig,
                    data: sankey.data,
                    colorPalette,
                    theme,
                }) as EChartsOption | undefined,
            );
        }
        case ChartType.BIG_NUMBER: {
            const resolved = resolveBigNumberChartConfig({
                chartConfig: chartConfig.config,
                itemsMap,
            });
            if (results.rows.length === 0) {
                return { kind: 'empty', chartType: ChartType.BIG_NUMBER };
            }
            return {
                kind: 'bigNumber',
                chartType: ChartType.BIG_NUMBER,
                model: buildBigNumberModel({
                    resultsData: results,
                    itemsMap,
                    parameters,
                    chartConfig: resolved,
                }),
            };
        }
        case ChartType.TABLE: {
            const pivotDimensions = pivotKeys;
            const table = resolveTableChartConfig({
                chartConfig: chartConfig.config,
                resultsData: results,
                itemsMap,
                columnOrder,
                pivotDimensions,
                pivotRows: pivotConfig?.rows,
            });
            const columnProperties = table.validConfig.columns ?? {};
            // Without a metric query the selection is every field the results carry.
            const selectedItemIds =
                table.selectedItemIds ??
                (columnOrder.length > 0 ? columnOrder : Object.keys(itemsMap));
            return {
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
                    showTableNames: table.validConfig.showTableNames ?? false,
                    getFieldLabelOverride: (id) =>
                        getTableFieldLabelOverride(columnProperties, id),
                    columnOrder,
                    totals,
                    groupedSubtotals,
                    parameters,
                    rows: results.rows,
                    pivotDimensions,
                    pivotData,
                }),
            };
        }
        case ChartType.CUSTOM: {
            return {
                kind: 'custom',
                chartType: ChartType.CUSTOM,
                spec: resolveCustomVisualizationConfig({
                    chartConfig: chartConfig.config,
                }).spec,
                data: buildCustomVisualizationData(results),
            };
        }
        case ChartType.MAP:
        case ChartType.DATA_APP_VIZ:
            return { kind: 'unsupported', chartType: chartConfig.type };
        default:
            return assertUnreachable(chartConfig, 'Unknown chart type');
    }
};
