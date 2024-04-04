import {
    CartesianSeriesType,
    ChartKind,
    ChartType,
    FeatureFlags,
    isSeriesWithMixedChartTypes,
} from '@lightdash/common';
import { ActionIcon, Group } from '@mantine/core';
import { memo, useMemo, type FC } from 'react';
import { useFeatureFlagEnabled } from '../../../hooks/useFeatureFlagEnabled';
import { useApp } from '../../../providers/AppProvider';
import { ChartIcon } from '../../common/ResourceIcon';
import { isBigNumberVisualizationConfig } from '../../LightdashVisualization/VisualizationBigNumberConfig';
import { isCartesianVisualizationConfig } from '../../LightdashVisualization/VisualizationConfigCartesian';
import { isPieVisualizationConfig } from '../../LightdashVisualization/VisualizationConfigPie';
import { isTableVisualizationConfig } from '../../LightdashVisualization/VisualizationConfigTable';
import { isCustomVisualizationConfig } from '../../LightdashVisualization/VisualizationCustomConfig';
import { useVisualizationContext } from '../../LightdashVisualization/VisualizationProvider';

enum ICON_COLORS {
    SELECTED = 'violet.6',
    UNSELECTED = 'gray.7',
}

type VisualizationActionIconProps = {
    chartKind: ChartKind;
    onClick: () => void;
    disabled: boolean;
    selected: boolean;
};

const VisualizationActionIcon: FC<VisualizationActionIconProps> = ({
    chartKind,
    onClick,
    disabled,
    selected,
}) => (
    <ActionIcon
        disabled={disabled}
        onClick={onClick}
        opacity={disabled ? 0.3 : 1}
    >
        <ChartIcon
            color={selected ? ICON_COLORS.SELECTED : ICON_COLORS.UNSELECTED}
            chartKind={chartKind}
        />
    </ActionIcon>
);

const VisualizationCardOptions: FC = memo(() => {
    const { health } = useApp();
    const customVizEnabled = useFeatureFlagEnabled(
        FeatureFlags.CustomVisualizationsEnabled,
    );

    const isCustomConfigVisible = useMemo(
        () => !!(health.data?.customVisualizationsEnabled || customVizEnabled),
        [customVizEnabled, health.data?.customVisualizationsEnabled],
    );

    const {
        visualizationConfig,
        setChartType,
        setCartesianType,
        setStacking,
        isLoading,
        resultsData,
        setPivotDimensions,
        pivotDimensions,
    } = useVisualizationContext();
    const disabled = isLoading || !resultsData || resultsData.rows.length <= 0;

    const cartesianConfig = useMemo(() => {
        if (isCartesianVisualizationConfig(visualizationConfig)) {
            return visualizationConfig.chartConfig;
        }
        return undefined;
    }, [visualizationConfig]);

    const cartesianType = cartesianConfig?.dirtyChartType;

    const cartesianFlipAxis = cartesianConfig?.dirtyLayout?.flipAxes;
    const isChartTypeTheSameForAllSeries = cartesianConfig
        ? !isSeriesWithMixedChartTypes(
              cartesianConfig.dirtyEchartsConfig?.series,
          )
        : undefined;

    const visualizations = useMemo(
        () => [
            {
                chartKind: ChartKind.VERTICAL_BAR,
                onClick: () => {
                    setCartesianType({
                        type: CartesianSeriesType.BAR,
                        flipAxes: false,
                        hasAreaStyle: false,
                    });
                    setChartType(ChartType.CARTESIAN);
                },
                selected: !!(
                    isChartTypeTheSameForAllSeries &&
                    isCartesianVisualizationConfig(visualizationConfig) &&
                    cartesianType === CartesianSeriesType.BAR &&
                    !cartesianFlipAxis
                ),
            },
            {
                chartKind: ChartKind.HORIZONTAL_BAR,
                onClick: () => {
                    setCartesianType({
                        type: CartesianSeriesType.BAR,
                        flipAxes: true,
                        hasAreaStyle: false,
                    });
                    if (!pivotDimensions) setStacking(false);
                    setChartType(ChartType.CARTESIAN);
                },
                selected: !!(
                    isChartTypeTheSameForAllSeries &&
                    isCartesianVisualizationConfig(visualizationConfig) &&
                    cartesianType === CartesianSeriesType.BAR &&
                    cartesianFlipAxis
                ),
            },
            {
                chartKind: ChartKind.LINE,
                onClick: () => {
                    setCartesianType({
                        type: CartesianSeriesType.LINE,
                        flipAxes: false,
                        hasAreaStyle: false,
                    });
                    setStacking(false);
                    setChartType(ChartType.CARTESIAN);
                },
                selected: !!(
                    isChartTypeTheSameForAllSeries &&
                    isCartesianVisualizationConfig(visualizationConfig) &&
                    cartesianType === CartesianSeriesType.LINE
                ),
            },
            {
                chartKind: ChartKind.AREA,
                onClick: () => {
                    setCartesianType({
                        type: CartesianSeriesType.LINE,
                        flipAxes: false,
                        hasAreaStyle: true,
                    });
                    setStacking(true);
                    setChartType(ChartType.CARTESIAN);
                },
                selected: !!(
                    isChartTypeTheSameForAllSeries &&
                    isCartesianVisualizationConfig(visualizationConfig) &&
                    cartesianType === CartesianSeriesType.AREA
                ),
            },
            {
                chartKind: ChartKind.SCATTER,
                onClick: () => {
                    setCartesianType({
                        type: CartesianSeriesType.SCATTER,
                        flipAxes: false,
                        hasAreaStyle: false,
                    });
                    setStacking(false);
                    setChartType(ChartType.CARTESIAN);
                },
                selected: !!(
                    isChartTypeTheSameForAllSeries &&
                    isCartesianVisualizationConfig(visualizationConfig) &&
                    cartesianType === CartesianSeriesType.SCATTER
                ),
            },
            {
                chartKind: ChartKind.PIE,
                onClick: () => {
                    setPivotDimensions(undefined);
                    setStacking(undefined);
                    setCartesianType(undefined);
                    setChartType(ChartType.PIE);
                },
                selected: isPieVisualizationConfig(visualizationConfig),
            },
            {
                chartKind: ChartKind.TABLE,
                onClick: () => {
                    setPivotDimensions(undefined);
                    setStacking(undefined);
                    setCartesianType(undefined);
                    setChartType(ChartType.TABLE);
                },
                selected: isTableVisualizationConfig(visualizationConfig),
            },
            {
                chartKind: ChartKind.BIG_NUMBER,
                onClick: () => {
                    setPivotDimensions(undefined);
                    setStacking(undefined);
                    setCartesianType(undefined);
                    setChartType(ChartType.BIG_NUMBER);
                },
                selected: isBigNumberVisualizationConfig(visualizationConfig),
            },
            {
                chartKind: ChartKind.CUSTOM,
                onClick: () => {
                    setPivotDimensions(undefined);
                    setStacking(undefined);
                    setCartesianType(undefined);
                    setChartType(ChartType.CUSTOM);
                },
                selected: isCustomVisualizationConfig(visualizationConfig),
            },
        ],
        [
            cartesianFlipAxis,
            cartesianType,
            isChartTypeTheSameForAllSeries,
            pivotDimensions,
            setCartesianType,
            setChartType,
            setPivotDimensions,
            setStacking,
            visualizationConfig,
        ],
    );

    return (
        <Group spacing="sm">
            {visualizations.map((viz) => (
                <VisualizationActionIcon
                    key={viz.chartKind}
                    disabled={
                        (viz.chartKind === ChartKind.CUSTOM &&
                            !isCustomConfigVisible) ||
                        disabled
                    }
                    onClick={viz.onClick}
                    selected={viz.selected}
                    chartKind={viz.chartKind}
                />
            ))}
        </Group>
    );
});

export default VisualizationCardOptions;
