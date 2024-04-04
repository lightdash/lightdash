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

const VisualizationCardOptions: FC = memo(() => {
    const { health } = useApp();
    const customVizEnabled = useFeatureFlagEnabled(
        FeatureFlags.CustomVisualizationsEnabled,
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

    return (
        <Group spacing="sm">
            <ActionIcon
                disabled={disabled}
                onClick={() => {
                    setCartesianType({
                        type: CartesianSeriesType.BAR,
                        flipAxes: false,
                        hasAreaStyle: false,
                    });
                    setChartType(ChartType.CARTESIAN);
                }}
            >
                <ChartIcon
                    color={
                        isChartTypeTheSameForAllSeries &&
                        isCartesianVisualizationConfig(visualizationConfig) &&
                        cartesianType === CartesianSeriesType.BAR &&
                        !cartesianFlipAxis
                            ? 'violet.6'
                            : 'gray.7'
                    }
                    chartKind={ChartKind.VERTICAL_BAR}
                />
            </ActionIcon>
            <ActionIcon
                disabled={disabled}
                onClick={() => {
                    setCartesianType({
                        type: CartesianSeriesType.BAR,
                        flipAxes: true,
                        hasAreaStyle: false,
                    });
                    if (!pivotDimensions) setStacking(false);
                    setChartType(ChartType.CARTESIAN);
                }}
            >
                <ChartIcon
                    color={
                        isChartTypeTheSameForAllSeries &&
                        isCartesianVisualizationConfig(visualizationConfig) &&
                        cartesianType === CartesianSeriesType.BAR &&
                        cartesianFlipAxis
                            ? 'violet.6'
                            : 'gray.7'
                    }
                    chartKind={ChartKind.HORIZONTAL_BAR}
                />
            </ActionIcon>
            <ActionIcon
                disabled={disabled}
                onClick={() => {
                    setCartesianType({
                        type: CartesianSeriesType.LINE,
                        flipAxes: false,
                        hasAreaStyle: false,
                    });
                    setStacking(false);
                    setChartType(ChartType.CARTESIAN);
                }}
            >
                <ChartIcon
                    color={
                        isChartTypeTheSameForAllSeries &&
                        isCartesianVisualizationConfig(visualizationConfig) &&
                        cartesianType === CartesianSeriesType.LINE
                            ? 'violet.6'
                            : 'gray.7'
                    }
                    chartKind={ChartKind.LINE}
                />
            </ActionIcon>
            <ActionIcon
                disabled={disabled}
                onClick={() => {
                    setCartesianType({
                        type: CartesianSeriesType.LINE,
                        flipAxes: false,
                        hasAreaStyle: true,
                    });
                    setStacking(true);
                    setChartType(ChartType.CARTESIAN);
                }}
            >
                <ChartIcon
                    color={
                        isChartTypeTheSameForAllSeries &&
                        isCartesianVisualizationConfig(visualizationConfig) &&
                        cartesianType === CartesianSeriesType.AREA
                            ? 'violet.6'
                            : 'gray.7'
                    }
                    chartKind={ChartKind.AREA}
                />
            </ActionIcon>
            <ActionIcon
                disabled={disabled}
                onClick={() => {
                    setCartesianType({
                        type: CartesianSeriesType.SCATTER,
                        flipAxes: false,
                        hasAreaStyle: false,
                    });
                    setStacking(false);
                    setChartType(ChartType.CARTESIAN);
                }}
            >
                <ChartIcon
                    color={
                        isChartTypeTheSameForAllSeries &&
                        isCartesianVisualizationConfig(visualizationConfig) &&
                        cartesianType === CartesianSeriesType.SCATTER
                            ? 'violet.6'
                            : 'gray.7'
                    }
                    chartKind={ChartKind.SCATTER}
                />
            </ActionIcon>
            <ActionIcon
                disabled={disabled}
                onClick={() => {
                    setPivotDimensions(undefined);
                    setStacking(undefined);
                    setCartesianType(undefined);
                    setChartType(ChartType.PIE);
                }}
            >
                <ChartIcon
                    color={
                        isPieVisualizationConfig(visualizationConfig)
                            ? 'violet.6'
                            : 'gray.7'
                    }
                    chartKind={ChartKind.PIE}
                />
            </ActionIcon>
            <ActionIcon
                disabled={disabled}
                onClick={() => {
                    setPivotDimensions(undefined);
                    setStacking(undefined);
                    setCartesianType(undefined);
                    setChartType(ChartType.TABLE);
                }}
            >
                <ChartIcon
                    color={
                        isTableVisualizationConfig(visualizationConfig)
                            ? 'violet.6'
                            : 'gray.7'
                    }
                    chartKind={ChartKind.TABLE}
                />
            </ActionIcon>
            <ActionIcon
                disabled={disabled}
                onClick={() => {
                    setPivotDimensions(undefined);
                    setStacking(undefined);
                    setCartesianType(undefined);
                    setChartType(ChartType.BIG_NUMBER);
                }}
            >
                <ChartIcon
                    color={
                        isBigNumberVisualizationConfig(visualizationConfig)
                            ? 'violet.6'
                            : 'gray.7'
                    }
                    chartKind={ChartKind.BIG_NUMBER}
                />
            </ActionIcon>
            {(health.data?.customVisualizationsEnabled || customVizEnabled) && (
                <ActionIcon
                    disabled={disabled}
                    onClick={() => {
                        setPivotDimensions(undefined);
                        setStacking(undefined);
                        setCartesianType(undefined);
                        setChartType(ChartType.CUSTOM);
                    }}
                >
                    <ChartIcon
                        color={
                            isCustomVisualizationConfig(visualizationConfig)
                                ? 'violet.6'
                                : 'gray.7'
                        }
                        chartKind={ChartKind.CUSTOM}
                    />
                </ActionIcon>
            )}
        </Group>
    );
});

export default VisualizationCardOptions;
