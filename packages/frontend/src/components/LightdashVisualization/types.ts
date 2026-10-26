import {
    ChartType,
    type CustomDimension,
    type DataAppVizChart,
    type DataAppVizChartConfig,
    type Dimension,
    type ItemsMap,
    type Metric,
    type TableCalculation,
} from '@lightdash/common';
import { type JSX } from 'react';
import type useCartesianChartConfig from '../../hooks/cartesianChartConfig/useCartesianChartConfig';
import type useTableConfig from '../../hooks/tableVisualization/useTableConfig';
import type useBigNumberConfig from '../../hooks/useBigNumberConfig';
import type useCustomVisualizationConfig from '../../hooks/useCustomVisualizationConfig';
import type useDataAppVizVisualizationConfig from '../../hooks/useDataAppVizVisualizationConfig';
import type useFunnelChartConfig from '../../hooks/useFunnelChartConfig';
import type useGaugeChartConfig from '../../hooks/useGaugeChartConfig';
import type usePieChartConfig from '../../hooks/usePieChartConfig';
import type useTreemapChartConfig from '../../hooks/useTreemapChartConfig';

export type VisualizationConfigCommon<T extends VisualizationConfig> = {
    onChartConfigChange?: (chartConfig: {
        type: T['chartType'];
        config: T['chartConfig']['validConfig'];
    }) => void;
    children: (props: { visualizationConfig: T }) => JSX.Element;
};

// Big Number

export type VisualizationConfigBigNumber = {
    chartType: ChartType.BIG_NUMBER;
    chartConfig: ReturnType<typeof useBigNumberConfig>;
};

export const isBigNumberVisualizationConfig = (
    visualizationConfig: VisualizationConfig | undefined,
): visualizationConfig is VisualizationConfigBigNumber => {
    return visualizationConfig?.chartType === ChartType.BIG_NUMBER;
};

export type VisualizationBigNumberConfigProps = Pick<
    VisualizationConfigCommon<VisualizationConfigBigNumber>,
    'onChartConfigChange' | 'children'
>;

// Cartesian

export type VisualizationConfigCartesian = {
    chartType: ChartType.CARTESIAN;
    chartConfig: ReturnType<typeof useCartesianChartConfig>;
};

export const isCartesianVisualizationConfig = (
    visualizationConfig: VisualizationConfig | undefined,
): visualizationConfig is VisualizationConfigCartesian => {
    return visualizationConfig?.chartType === ChartType.CARTESIAN;
};

export type VisualizationCartesianConfigProps = Pick<
    VisualizationConfigCommon<VisualizationConfigCartesian>,
    'onChartConfigChange' | 'children'
>;

// Funnel

export type VisualizationConfigFunnelType = {
    chartType: ChartType.FUNNEL;
    chartConfig: ReturnType<typeof useFunnelChartConfig>;
    dimensions: Record<string, CustomDimension | Dimension>;
    numericFields: Record<string, Metric | TableCalculation>;
};

export const isFunnelVisualizationConfig = (
    visualizationConfig: VisualizationConfig | undefined,
): visualizationConfig is VisualizationConfigFunnelType => {
    return visualizationConfig?.chartType === ChartType.FUNNEL;
};

export type VisualizationConfigFunnelProps = Pick<
    VisualizationConfigCommon<VisualizationConfigFunnelType>,
    'onChartConfigChange' | 'children'
>;

// Pie

export type VisualizationConfigPie = {
    chartType: ChartType.PIE;
    chartConfig: ReturnType<typeof usePieChartConfig>;
    dimensions: Record<string, CustomDimension | Dimension>;
    numericMetrics: Record<string, Metric | TableCalculation>;
};

export const isPieVisualizationConfig = (
    visualizationConfig: VisualizationConfig | undefined,
): visualizationConfig is VisualizationConfigPie => {
    return visualizationConfig?.chartType === ChartType.PIE;
};

export type VisualizationConfigPieProps = Pick<
    VisualizationConfigCommon<VisualizationConfigPie>,
    'onChartConfigChange' | 'children'
>;

// Table

export type VisualizationConfigTable = {
    chartType: ChartType.TABLE;
    chartConfig: ReturnType<typeof useTableConfig>;
};

export const isTableVisualizationConfig = (
    visualizationConfig: VisualizationConfig | undefined,
): visualizationConfig is VisualizationConfigTable => {
    return visualizationConfig?.chartType === ChartType.TABLE;
};

export type VisualizationTableConfigProps = Pick<
    VisualizationConfigCommon<VisualizationConfigTable>,
    'onChartConfigChange' | 'children'
>;

// Treemap

export type VisualizationConfigTreemap = {
    chartType: ChartType.TREEMAP;
    chartConfig: ReturnType<typeof useTreemapChartConfig>;
    dimensions: Record<string, CustomDimension | Dimension>;
    numericMetrics: Record<string, Metric | TableCalculation>;
};

export const isTreemapVisualizationConfig = (
    visualizationConfig: VisualizationConfig | undefined,
): visualizationConfig is VisualizationConfigTreemap => {
    return visualizationConfig?.chartType === ChartType.TREEMAP;
};

export type VisualizationConfigTreemapProps = Pick<
    VisualizationConfigCommon<VisualizationConfigTreemap>,
    'onChartConfigChange' | 'children'
>;

// Custom

export type VisualizationCustomConfigType = {
    chartType: ChartType.CUSTOM;
    chartConfig: ReturnType<typeof useCustomVisualizationConfig>;
};

export const isCustomVisualizationConfig = (
    visualizationConfig: VisualizationConfig | undefined,
): visualizationConfig is VisualizationCustomConfigType => {
    return visualizationConfig?.chartType === ChartType.CUSTOM;
};

export type VisualizationCustomConfigProps = Pick<
    VisualizationConfigCommon<VisualizationCustomConfigType>,
    'onChartConfigChange' | 'children'
>;

// Data app viz

export type VisualizationConfigDataAppViz = {
    chartType: ChartType.DATA_APP_VIZ;
    chartConfig: ReturnType<typeof useDataAppVizVisualizationConfig>;
};

export const isDataAppVizVisualizationConfig = (
    visualizationConfig: VisualizationConfig | undefined,
): visualizationConfig is VisualizationConfigDataAppViz => {
    return visualizationConfig?.chartType === ChartType.DATA_APP_VIZ;
};

// Local state is null while the chart points at no viz; the saved chart
// carries that as an absent config, so the two sides are typed apart.
export type VisualizationDataAppVizConfigProps = Pick<
    VisualizationConfigCommon<VisualizationConfigDataAppViz>,
    'children'
> & {
    initialChartConfig: DataAppVizChart | undefined;
    onChartConfigChange?: (chartConfig: DataAppVizChartConfig) => void;
};

// Gauge

export type VisualizationConfigGauge = {
    chartType: ChartType.GAUGE;
    chartConfig: ReturnType<typeof useGaugeChartConfig>;
    numericMetrics: ItemsMap;
};

export const isGaugeVisualizationConfig = (
    visualizationConfig: VisualizationConfig | undefined,
): visualizationConfig is VisualizationConfigGauge => {
    return visualizationConfig?.chartType === ChartType.GAUGE;
};

export type VisualizationConfigGaugeProps = Pick<
    VisualizationConfigCommon<VisualizationConfigGauge>,
    'onChartConfigChange' | 'children'
>;

// Map

import type useMapChartConfig from '../../hooks/useMapChartConfig';

export type VisualizationConfigMap = {
    chartType: ChartType.MAP;
    chartConfig: ReturnType<typeof useMapChartConfig>;
};

export const isMapVisualizationConfig = (
    visualizationConfig: VisualizationConfig | undefined,
): visualizationConfig is VisualizationConfigMap => {
    return visualizationConfig?.chartType === ChartType.MAP;
};

export type VisualizationConfigMapProps = Pick<
    VisualizationConfigCommon<VisualizationConfigMap>,
    'onChartConfigChange' | 'children'
>;

// Sankey

import type useSankeyChartConfig from '../../hooks/useSankeyChartConfig';

export type VisualizationConfigSankeyType = {
    chartType: ChartType.SANKEY;
    chartConfig: ReturnType<typeof useSankeyChartConfig>;
    dimensions: Record<string, CustomDimension | Dimension>;
    numericFields: Record<string, Metric | TableCalculation>;
};

export const isSankeyVisualizationConfig = (
    visualizationConfig: VisualizationConfig | undefined,
): visualizationConfig is VisualizationConfigSankeyType => {
    return visualizationConfig?.chartType === ChartType.SANKEY;
};

export type VisualizationConfigSankeyProps = Pick<
    VisualizationConfigCommon<VisualizationConfigSankeyType>,
    'onChartConfigChange' | 'children'
>;

// Union of all visualization configs

export type VisualizationConfig =
    | VisualizationConfigBigNumber
    | VisualizationConfigCartesian
    | VisualizationConfigPie
    | VisualizationConfigFunnelType
    | VisualizationConfigTable
    | VisualizationConfigTreemap
    | VisualizationConfigGauge
    | VisualizationConfigMap
    | VisualizationCustomConfigType
    | VisualizationConfigSankeyType
    | VisualizationConfigDataAppViz;
