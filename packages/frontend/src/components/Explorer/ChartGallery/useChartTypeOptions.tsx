import {
    CartesianSeriesType,
    ChartKind,
    ChartType,
    getAppDisplayName,
    isSeriesWithMixedChartTypes,
    type DataAppViz,
} from '@lightdash/common';
import { type Icon as TablerIcon } from '@tabler/icons-react';
import { getChartTypeIcon } from '../../../features/chartTypes/utils/chartTypeIcons';
import {
    AreaChartIcon,
    BarChartIcon,
    BigNumberIcon,
    FunnelChartIcon,
    GaugeChartIcon,
    LineChartIcon,
    MapChartIcon,
    MixedChartIcon,
    PieChartIcon,
    SankeyChartIcon,
    ScatterChartIcon,
    TableIcon,
    TreemapChartIcon,
    VegaChartIcon,
} from '../../common/ContentIcons';
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
import {
    useVisualizationConfig,
    useVisualizationInputs,
    useVisualizationServices,
} from '../../LightdashVisualization/useVisualizationContext';

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
    icon: MixedChartIcon,
    rotatedIcon: false,
};

const CUSTOM_CHART_TYPE: SelectedChartType = {
    id: ChartKind.CUSTOM,
    label: 'Custom',
    icon: VegaChartIcon,
    rotatedIcon: false,
};

/** Pass `null` while the custom chart type is still loading. */
export const projectChartTypeItem = (
    dataAppViz: DataAppViz | null,
): SelectedChartType => ({
    id: ChartKind.DATA_APP_VIZ,
    label: dataAppViz
        ? getAppDisplayName(dataAppViz.name, dataAppViz.dataAppVizUuid)
        : 'Custom chart type',
    icon: getChartTypeIcon(dataAppViz?.icon ?? null),
    rotatedIcon: false,
});

export const useChartTypeOptions = () => {
    const { setChartType, setCartesianType, setStacking } =
        useVisualizationServices();
    const visualizationConfig = useVisualizationConfig();
    const { isLoading, resultsData, pivotDimensions } =
        useVisualizationInputs();

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
            id: ChartKind.TABLE,
            label: 'Table',
            icon: TableIcon,
            rotatedIcon: false,
            selected: isTableVisualizationConfig(visualizationConfig),
            select: () => resetCartesian(ChartType.TABLE),
        },
        {
            id: ChartKind.VERTICAL_BAR,
            label: 'Bar chart',
            icon: BarChartIcon,
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
            icon: BarChartIcon,
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
            icon: LineChartIcon,
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
            icon: AreaChartIcon,
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
            icon: ScatterChartIcon,
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
            icon: PieChartIcon,
            rotatedIcon: false,
            selected: isPieVisualizationConfig(visualizationConfig),
            select: () => resetCartesian(ChartType.PIE),
        },
        {
            id: ChartKind.FUNNEL,
            label: 'Funnel chart',
            icon: FunnelChartIcon,
            rotatedIcon: false,
            selected: isFunnelVisualizationConfig(visualizationConfig),
            select: () => resetCartesian(ChartType.FUNNEL),
        },
        {
            id: ChartKind.TREEMAP,
            label: 'Treemap',
            icon: TreemapChartIcon,
            rotatedIcon: false,
            selected: isTreemapVisualizationConfig(visualizationConfig),
            select: () => resetCartesian(ChartType.TREEMAP),
        },
        {
            id: ChartKind.GAUGE,
            label: 'Gauge',
            icon: GaugeChartIcon,
            rotatedIcon: false,
            selected: isGaugeVisualizationConfig(visualizationConfig),
            select: () => resetCartesian(ChartType.GAUGE),
        },
        {
            id: ChartKind.SANKEY,
            label: 'Sankey',
            icon: SankeyChartIcon,
            rotatedIcon: false,
            selected: isSankeyVisualizationConfig(visualizationConfig),
            select: () => resetCartesian(ChartType.SANKEY),
        },
        {
            id: ChartKind.MAP,
            label: 'Map',
            icon: MapChartIcon,
            rotatedIcon: false,
            selected: isMapVisualizationConfig(visualizationConfig),
            select: () => resetCartesian(ChartType.MAP),
        },
        {
            id: ChartKind.BIG_NUMBER,
            label: 'Big value',
            icon: BigNumberIcon,
            rotatedIcon: false,
            selected: isBigNumberVisualizationConfig(visualizationConfig),
            select: () => resetCartesian(ChartType.BIG_NUMBER),
        },
    ];

    const vegaOption: ChartTypeOption = {
        id: ChartKind.CUSTOM,
        label: 'Vega (JSON editor)',
        icon: VegaChartIcon,
        rotatedIcon: false,
        selected: isCustomVisualizationConfig(visualizationConfig),
        select: () => resetCartesian(ChartType.CUSTOM),
    };

    const isCustomChart =
        isCustomVisualizationConfig(visualizationConfig) ||
        isDataAppVizVisualizationConfig(visualizationConfig);
    // Vega and custom chart types share one "Custom" entry in the picker;
    // cartesian series that do not resolve to a single entry are mixed.
    const selectedChartType: SelectedChartType = isCustomChart
        ? CUSTOM_CHART_TYPE
        : (options.find((option) => option.selected) ?? MIXED_CHART_TYPE);

    // The picker collapses Vega and custom chart types into a single "Custom"
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
