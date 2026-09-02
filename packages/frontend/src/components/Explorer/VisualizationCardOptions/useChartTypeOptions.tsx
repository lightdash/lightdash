import {
    CartesianSeriesType,
    ChartKind,
    ChartType,
    getAppDisplayName,
    isSeriesWithMixedChartTypes,
    type DataAppViz,
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
    IconPuzzle,
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

/** Pass `null` while the project chart type is still loading. */
export const projectChartTypeItem = (
    dataAppViz: DataAppViz | null,
): SelectedChartType => ({
    id: ChartKind.DATA_APP_VIZ,
    label: dataAppViz
        ? getAppDisplayName(dataAppViz.name, dataAppViz.dataAppVizUuid)
        : 'Project chart type',
    icon: IconPuzzle,
    rotatedIcon: false,
});

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
            icon: IconChartPie,
            rotatedIcon: false,
            selected: isPieVisualizationConfig(visualizationConfig),
            select: () => resetCartesian(ChartType.PIE),
        },
        {
            id: ChartKind.FUNNEL,
            label: 'Funnel chart',
            icon: IconFilter,
            rotatedIcon: false,
            selected: isFunnelVisualizationConfig(visualizationConfig),
            select: () => resetCartesian(ChartType.FUNNEL),
        },
        {
            id: ChartKind.TREEMAP,
            label: 'Treemap',
            icon: IconChartTreemap,
            rotatedIcon: false,
            selected: isTreemapVisualizationConfig(visualizationConfig),
            select: () => resetCartesian(ChartType.TREEMAP),
        },
        {
            id: ChartKind.GAUGE,
            label: 'Gauge',
            icon: IconGauge,
            rotatedIcon: false,
            selected: isGaugeVisualizationConfig(visualizationConfig),
            select: () => resetCartesian(ChartType.GAUGE),
        },
        {
            id: ChartKind.SANKEY,
            label: 'Sankey',
            icon: IconGitMerge,
            rotatedIcon: false,
            selected: isSankeyVisualizationConfig(visualizationConfig),
            select: () => resetCartesian(ChartType.SANKEY),
        },
        {
            id: ChartKind.MAP,
            label: 'Map',
            icon: IconMap,
            rotatedIcon: false,
            selected: isMapVisualizationConfig(visualizationConfig),
            select: () => resetCartesian(ChartType.MAP),
        },
        {
            id: ChartKind.TABLE,
            label: 'Table',
            icon: IconTable,
            rotatedIcon: false,
            selected: isTableVisualizationConfig(visualizationConfig),
            select: () => resetCartesian(ChartType.TABLE),
        },
        {
            id: ChartKind.BIG_NUMBER,
            label: 'Big value',
            icon: IconSquareNumber1,
            rotatedIcon: false,
            selected: isBigNumberVisualizationConfig(visualizationConfig),
            select: () => resetCartesian(ChartType.BIG_NUMBER),
        },
    ];

    const vegaOption: ChartTypeOption = {
        id: ChartKind.CUSTOM,
        label: 'Vega (JSON editor)',
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

    // The picker collapses Vega and project chart types into a single "Custom"
    // entry, so callers showing the active type resolve it by chart type.
    const getSelectedChartTypeItem = (
        chartType: ChartType,
        dataAppViz: DataAppViz | null,
    ): SelectedChartType => {
        if (chartType === ChartType.DATA_APP_VIZ) {
            return projectChartTypeItem(dataAppViz);
        }
        if (chartType === ChartType.CUSTOM) return vegaOption;
        return selectedChartType;
    };

    return {
        disabled,
        getSelectedChartTypeItem,
        isCustomChart,
        options,
        resetCartesianState,
        selectedChartType,
        vegaOption,
    };
};
