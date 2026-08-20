import {
    CartesianSeriesType,
    ChartKind,
    ChartType,
    isSeriesWithMixedChartTypes,
} from '@lightdash/common';
import {
    IconChartArea,
    IconChartAreaLine,
    IconChartBar,
    IconChartDots,
    IconChartLine,
    IconChartPie,
    IconChartTreemap,
    IconCode,
    IconFilter,
    IconGauge,
    IconGitMerge,
    IconMap,
    IconSquareNumber1,
    IconTable,
    type Icon as TablerIcon,
} from '@tabler/icons-react';
import {
    isBigNumberVisualizationConfig,
    isCartesianVisualizationConfig,
    isCustomVisualizationConfig,
    isDataAppVizVisualizationConfig,
    isFunnelVisualizationConfig,
    isGaugeVisualizationConfig,
    isMapVisualizationConfig,
    isPieVisualizationConfig,
    isSankeyVisualizationConfig,
    isTableVisualizationConfig,
    isTreemapVisualizationConfig,
} from '../../LightdashVisualization/types';
import { useVisualizationContext } from '../../LightdashVisualization/useVisualizationContext';

export type ChartTypeOption = {
    id: ChartKind;
    label: string;
    description: string;
    icon: TablerIcon;
    rotatedIcon: boolean;
    selected: boolean;
    select: () => void;
};

export type SelectedChartType = Pick<
    ChartTypeOption,
    'id' | 'label' | 'icon' | 'rotatedIcon'
>;

const MIXED_CHART_TYPE: SelectedChartType = {
    id: ChartKind.MIXED,
    label: 'Mixed',
    icon: IconChartAreaLine,
    rotatedIcon: false,
};

const CUSTOM_CHART_TYPE: SelectedChartType = {
    id: ChartKind.CUSTOM,
    label: 'Custom',
    icon: IconCode,
    rotatedIcon: false,
};

export const useChartTypeOptions = () => {
    const {
        visualizationConfig,
        setChartType,
        setCartesianType,
        setStacking,
        isLoading,
        resultsData,
        pivotDimensions,
    } = useVisualizationContext();

    const disabled = isLoading || !resultsData || resultsData.rows.length <= 0;
    const cartesianConfig = isCartesianVisualizationConfig(visualizationConfig)
        ? visualizationConfig.chartConfig
        : undefined;
    const cartesianType = cartesianConfig?.dirtyChartType;
    const cartesianFlipAxis = cartesianConfig?.dirtyLayout?.flipAxes;
    const hasSingleCartesianType = cartesianConfig
        ? !isSeriesWithMixedChartTypes(
              cartesianConfig.dirtyEchartsConfig?.series,
          )
        : undefined;

    const resetCartesianState = () => {
        setStacking(undefined);
        setCartesianType(undefined);
    };
    const resetCartesian = (chartType: ChartType) => {
        resetCartesianState();
        setChartType(chartType);
    };

    const options: ChartTypeOption[] = [
        {
            id: ChartKind.VERTICAL_BAR,
            label: 'Bar chart',
            description: 'Compare categories',
            icon: IconChartBar,
            rotatedIcon: false,
            selected:
                hasSingleCartesianType === true &&
                cartesianType === CartesianSeriesType.BAR &&
                !cartesianFlipAxis,
            select: () => {
                setCartesianType({
                    type: CartesianSeriesType.BAR,
                    flipAxes: false,
                    hasAreaStyle: false,
                });
                setChartType(ChartType.CARTESIAN);
            },
        },
        {
            id: ChartKind.HORIZONTAL_BAR,
            label: 'Horizontal bar chart',
            description: 'Compare ranked categories',
            icon: IconChartBar,
            rotatedIcon: true,
            selected:
                hasSingleCartesianType === true &&
                cartesianType === CartesianSeriesType.BAR &&
                cartesianFlipAxis === true,
            select: () => {
                setCartesianType({
                    type: CartesianSeriesType.BAR,
                    flipAxes: true,
                    hasAreaStyle: false,
                });
                if (!pivotDimensions) setStacking(false);
                setChartType(ChartType.CARTESIAN);
            },
        },
        {
            id: ChartKind.LINE,
            label: 'Line chart',
            description: 'Show a trend',
            icon: IconChartLine,
            rotatedIcon: false,
            selected:
                hasSingleCartesianType === true &&
                cartesianType === CartesianSeriesType.LINE,
            select: () => {
                setCartesianType({
                    type: CartesianSeriesType.LINE,
                    flipAxes: false,
                    hasAreaStyle: false,
                });
                setStacking(false);
                setChartType(ChartType.CARTESIAN);
            },
        },
        {
            id: ChartKind.AREA,
            label: 'Area chart',
            description: 'Compare magnitude over time',
            icon: IconChartArea,
            rotatedIcon: false,
            selected:
                hasSingleCartesianType === true &&
                cartesianType === CartesianSeriesType.AREA,
            select: () => {
                setCartesianType({
                    type: CartesianSeriesType.LINE,
                    flipAxes: false,
                    hasAreaStyle: true,
                });
                setStacking(true);
                setChartType(ChartType.CARTESIAN);
            },
        },
        {
            id: ChartKind.SCATTER,
            label: 'Scatter chart',
            description: 'Find relationships and outliers',
            icon: IconChartDots,
            rotatedIcon: false,
            selected:
                hasSingleCartesianType === true &&
                cartesianType === CartesianSeriesType.SCATTER,
            select: () => {
                setCartesianType({
                    type: CartesianSeriesType.SCATTER,
                    flipAxes: false,
                    hasAreaStyle: false,
                });
                setStacking(false);
                setChartType(ChartType.CARTESIAN);
            },
        },
        {
            id: ChartKind.PIE,
            label: 'Pie chart',
            description: 'Show part-to-whole',
            icon: IconChartPie,
            rotatedIcon: false,
            selected: isPieVisualizationConfig(visualizationConfig),
            select: () => resetCartesian(ChartType.PIE),
        },
        {
            id: ChartKind.FUNNEL,
            label: 'Funnel chart',
            description: 'Show stage conversion',
            icon: IconFilter,
            rotatedIcon: false,
            selected: isFunnelVisualizationConfig(visualizationConfig),
            select: () => resetCartesian(ChartType.FUNNEL),
        },
        {
            id: ChartKind.TREEMAP,
            label: 'Treemap',
            description: 'Show hierarchical proportions',
            icon: IconChartTreemap,
            rotatedIcon: false,
            selected: isTreemapVisualizationConfig(visualizationConfig),
            select: () => resetCartesian(ChartType.TREEMAP),
        },
        {
            id: ChartKind.GAUGE,
            label: 'Gauge',
            description: 'Track progress toward a target',
            icon: IconGauge,
            rotatedIcon: false,
            selected: isGaugeVisualizationConfig(visualizationConfig),
            select: () => resetCartesian(ChartType.GAUGE),
        },
        {
            id: ChartKind.SANKEY,
            label: 'Sankey',
            description: 'Show flow between categories',
            icon: IconGitMerge,
            rotatedIcon: false,
            selected: isSankeyVisualizationConfig(visualizationConfig),
            select: () => resetCartesian(ChartType.SANKEY),
        },
        {
            id: ChartKind.MAP,
            label: 'Map',
            description: 'Plot geographic values',
            icon: IconMap,
            rotatedIcon: false,
            selected: isMapVisualizationConfig(visualizationConfig),
            select: () => resetCartesian(ChartType.MAP),
        },
        {
            id: ChartKind.TABLE,
            label: 'Table',
            description: 'Show every result row',
            icon: IconTable,
            rotatedIcon: false,
            selected: isTableVisualizationConfig(visualizationConfig),
            select: () => resetCartesian(ChartType.TABLE),
        },
        {
            id: ChartKind.BIG_NUMBER,
            label: 'Big value',
            description: 'Highlight a single metric',
            icon: IconSquareNumber1,
            rotatedIcon: false,
            selected: isBigNumberVisualizationConfig(visualizationConfig),
            select: () => resetCartesian(ChartType.BIG_NUMBER),
        },
    ];

    const vegaOption: ChartTypeOption = {
        id: ChartKind.CUSTOM,
        label: 'Vega (JSON editor)',
        description: 'Write Vega-Lite JSON by hand',
        icon: IconCode,
        rotatedIcon: false,
        selected: isCustomVisualizationConfig(visualizationConfig),
        select: () => resetCartesian(ChartType.CUSTOM),
    };

    const isCustomChart =
        isCustomVisualizationConfig(visualizationConfig) ||
        isDataAppVizVisualizationConfig(visualizationConfig);
    // Vega and project chart types share one "Custom" entry in the picker;
    // cartesian series that do not resolve to a single entry are mixed.
    const selectedChartType: SelectedChartType = isCustomChart
        ? CUSTOM_CHART_TYPE
        : (options.find((option) => option.selected) ?? MIXED_CHART_TYPE);

    return {
        disabled,
        isCustomChart,
        options,
        resetCartesianState,
        selectedChartType,
        vegaOption,
    };
};
