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
    IconSquareNumber1,
    IconTable,
    type Icon as TablerIcon,
} from '@tabler/icons-react';
import { type TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { getChartTypeIcon } from '../../../features/chartTypes/utils/chartTypeIcons';
import i18n from '../../../i18n/i18n';
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

const getMixedChartType = (t: TFunction): SelectedChartType => ({
    id: ChartKind.MIXED,
    label: t('chartTypes.mixed'),
    icon: IconChartAreaLine,
    rotatedIcon: false,
});

const getCustomChartType = (t: TFunction): SelectedChartType => ({
    id: ChartKind.CUSTOM,
    label: t('chartTypes.custom'),
    icon: IconCode,
    rotatedIcon: false,
});

/** Pass `null` while the custom chart type is still loading. */
export const projectChartTypeItem = (
    dataAppViz: DataAppViz | null,
): SelectedChartType => ({
    id: ChartKind.DATA_APP_VIZ,
    label: dataAppViz
        ? getAppDisplayName(dataAppViz.name, dataAppViz.dataAppVizUuid)
        : i18n.t('chartTypes.customChartType', { ns: 'explorer' }),
    icon: getChartTypeIcon(dataAppViz?.icon ?? null),
    rotatedIcon: false,
});

export const useChartTypeOptions = () => {
    const { t } = useTranslation('explorer');
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
            id: ChartKind.TABLE,
            label: t('chartTypes.table'),
            icon: IconTable,
            rotatedIcon: false,
            selected: isTableVisualizationConfig(visualizationConfig),
            select: () => resetCartesian(ChartType.TABLE),
        },
        {
            id: ChartKind.VERTICAL_BAR,
            label: t('chartTypes.bar'),
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
            label: t('chartTypes.horizontalBar'),
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
            label: t('chartTypes.line'),
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
            label: t('chartTypes.area'),
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
            label: t('chartTypes.scatter'),
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
            label: t('chartTypes.pie'),
            icon: IconChartPie,
            rotatedIcon: false,
            selected: isPieVisualizationConfig(visualizationConfig),
            select: () => resetCartesian(ChartType.PIE),
        },
        {
            id: ChartKind.FUNNEL,
            label: t('chartTypes.funnel'),
            icon: IconFilter,
            rotatedIcon: false,
            selected: isFunnelVisualizationConfig(visualizationConfig),
            select: () => resetCartesian(ChartType.FUNNEL),
        },
        {
            id: ChartKind.TREEMAP,
            label: t('chartTypes.treemap'),
            icon: IconChartTreemap,
            rotatedIcon: false,
            selected: isTreemapVisualizationConfig(visualizationConfig),
            select: () => resetCartesian(ChartType.TREEMAP),
        },
        {
            id: ChartKind.GAUGE,
            label: t('chartTypes.gauge'),
            icon: IconGauge,
            rotatedIcon: false,
            selected: isGaugeVisualizationConfig(visualizationConfig),
            select: () => resetCartesian(ChartType.GAUGE),
        },
        {
            id: ChartKind.SANKEY,
            label: t('chartTypes.sankey'),
            icon: IconGitMerge,
            rotatedIcon: false,
            selected: isSankeyVisualizationConfig(visualizationConfig),
            select: () => resetCartesian(ChartType.SANKEY),
        },
        {
            id: ChartKind.MAP,
            label: t('chartTypes.map'),
            icon: IconMap,
            rotatedIcon: false,
            selected: isMapVisualizationConfig(visualizationConfig),
            select: () => resetCartesian(ChartType.MAP),
        },
        {
            id: ChartKind.BIG_NUMBER,
            label: t('chartTypes.bigValue'),
            icon: IconSquareNumber1,
            rotatedIcon: false,
            selected: isBigNumberVisualizationConfig(visualizationConfig),
            select: () => resetCartesian(ChartType.BIG_NUMBER),
        },
    ];

    const vegaOption: ChartTypeOption = {
        id: ChartKind.CUSTOM,
        label: t('chartTypes.vega'),
        icon: IconCode,
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
        ? getCustomChartType(t)
        : (options.find((option) => option.selected) ?? getMixedChartType(t));

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
