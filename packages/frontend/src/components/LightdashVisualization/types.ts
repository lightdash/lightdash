import {
    ChartType,
    type ApiQueryResults,
    type CustomDimension,
    type DashboardFilters,
    type Dimension,
    type ItemsMap,
    type Metric,
    type TableCalculation,
    type TableCalculationMetadata,
} from '@lightdash/common';
import { type JSX } from 'react';
import type useCartesianChartConfig from '../../hooks/cartesianChartConfig/useCartesianChartConfig';
import { type CartesianTypeOptions } from '../../hooks/cartesianChartConfig/useCartesianChartConfig';
import type useTableConfig from '../../hooks/tableVisualization/useTableConfig';
import type useBigNumberConfig from '../../hooks/useBigNumberConfig';
import type useCustomVisualizationConfig from '../../hooks/useCustomVisualizationConfig';
import type useFunnelChartConfig from '../../hooks/useFunnelChartConfig';
import type usePieChartConfig from '../../hooks/usePieChartConfig';

export type VisualizationConfigCommon<T extends VisualizationConfig> = {
    resultsData: ApiQueryResults | undefined;
    initialChartConfig: T['chartConfig']['validConfig'] | undefined;
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

export type VisualizationBigNumberConfigProps =
    VisualizationConfigCommon<VisualizationConfigBigNumber> & {
        itemsMap: ItemsMap | undefined;
        tableCalculationsMetadata?: TableCalculationMetadata[];
    };

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

export type VisualizationCartesianConfigProps =
    VisualizationConfigCommon<VisualizationConfigCartesian> & {
        itemsMap: ItemsMap | undefined;
        stacking: boolean | undefined;
        cartesianType: CartesianTypeOptions | undefined;
        columnOrder: string[];
        validPivotDimensions: string[] | undefined;
        setPivotDimensions: React.Dispatch<
            React.SetStateAction<string[] | undefined>
        >;
        colorPalette: string[];
        tableCalculationsMetadata?: TableCalculationMetadata[];
    };

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

export type VisualizationConfigFunnelProps =
    VisualizationConfigCommon<VisualizationConfigFunnelType> & {
        itemsMap: ItemsMap | undefined;
        colorPalette: string[];
        tableCalculationsMetadata?: TableCalculationMetadata[];
    };

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

export type VisualizationConfigPieProps =
    VisualizationConfigCommon<VisualizationConfigPie> & {
        // TODO: shared prop once all visualizations are converted
        itemsMap: ItemsMap | undefined;
        colorPalette: string[];
        tableCalculationsMetadata?: TableCalculationMetadata[];
    };

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

export type VisualizationTableConfigProps =
    VisualizationConfigCommon<VisualizationConfigTable> & {
        itemsMap: ItemsMap | undefined;
        columnOrder: string[];
        validPivotDimensions: string[] | undefined;
        pivotTableMaxColumnLimit: number;
        savedChartUuid: string | undefined;
        dashboardFilters: DashboardFilters | undefined;
        invalidateCache: boolean | undefined;
    };

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

export type VisualizationCustomConfigProps =
    VisualizationConfigCommon<VisualizationCustomConfigType> & {
        // TODO: shared prop once all visualizations are converted
        itemsMap?: ItemsMap | undefined;
    };

// Union of all visualization configs

export type VisualizationConfig =
    | VisualizationConfigBigNumber
    | VisualizationConfigCartesian
    | VisualizationConfigPie
    | VisualizationConfigFunnelType
    | VisualizationConfigTable
    | VisualizationCustomConfigType;
