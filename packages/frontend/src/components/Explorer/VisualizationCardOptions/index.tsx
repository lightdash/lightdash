import {
    CartesianSeriesType,
    ChartKind,
    ChartType,
    FeatureFlags,
    isSeriesWithMixedChartTypes,
} from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Center,
    Group,
    Paper,
    Tooltip,
    useMantineTheme,
} from '@mantine/core';
import { memo, useMemo, useTransition, type FC } from 'react';
import { useFeatureFlagEnabled } from '../../../hooks/useFeatureFlagEnabled';
import { useApp } from '../../../providers/AppProvider';
import MantineIcon from '../../common/MantineIcon';
import { getChartIcon } from '../../common/ResourceIcon';
import { isBigNumberVisualizationConfig } from '../../LightdashVisualization/VisualizationBigNumberConfig';
import { isCartesianVisualizationConfig } from '../../LightdashVisualization/VisualizationConfigCartesian';
import { isPieVisualizationConfig } from '../../LightdashVisualization/VisualizationConfigPie';
import { isTableVisualizationConfig } from '../../LightdashVisualization/VisualizationConfigTable';
import { isCustomVisualizationConfig } from '../../LightdashVisualization/VisualizationCustomConfig';
import { useVisualizationContext } from '../../LightdashVisualization/VisualizationProvider';

type VisualizationActionIconProps = {
    chartKind: ChartKind;
    label: string;
    onClick: () => void;
    disabled: boolean;
    selected: boolean;
};

const VisualizationActionIcon: FC<VisualizationActionIconProps> = ({
    chartKind,
    label,
    onClick,
    disabled,
    selected,
}) => {
    const { colors } = useMantineTheme();
    const ICON_SELECTED_COLOR = colors.violet[6];
    const ICON_UNSELECTED_COLOR = colors.gray[7];

    return (
        <Tooltip variant="xs" label={label} withinPortal>
            <Box>
                <ActionIcon disabled={disabled} onClick={onClick}>
                    <Paper
                        display="flex"
                        component={Center}
                        w={32}
                        h={32}
                        withBorder
                        radius="sm"
                        shadow={selected ? 'sm' : 'none'}
                        sx={(theme) => ({
                            flexGrow: 0,
                            flexShrink: 0,
                            backgroundColor: selected
                                ? theme.colors.violet[0]
                                : 'white',
                            '&[data-with-border]': {
                                borderColor: selected
                                    ? ICON_SELECTED_COLOR
                                    : 'none',
                            },
                        })}
                    >
                        <MantineIcon
                            icon={getChartIcon(chartKind)}
                            color={
                                selected
                                    ? ICON_SELECTED_COLOR
                                    : ICON_UNSELECTED_COLOR
                            }
                            fill={
                                selected
                                    ? ICON_SELECTED_COLOR
                                    : ICON_UNSELECTED_COLOR
                            }
                            transform={
                                chartKind === ChartKind.HORIZONTAL_BAR
                                    ? 'rotate(90)'
                                    : undefined
                            }
                            size="lg"
                            stroke={1.5}
                            fillOpacity={0.1}
                        />
                    </Paper>
                </ActionIcon>
            </Box>
        </Tooltip>
    );
};

const VisualizationCardOptions: FC = memo(() => {
    const [, startTransition] = useTransition();

    const { health } = useApp();
    const customVizEnabled = useFeatureFlagEnabled(
        FeatureFlags.CustomVisualizationsEnabled,
    );

    const isCustomConfigEnabled = useMemo(
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
                label: 'Bar chart',
                chartKind: ChartKind.VERTICAL_BAR,
                onClick: () => {
                    startTransition(() => {
                        setCartesianType({
                            type: CartesianSeriesType.BAR,
                            flipAxes: false,
                            hasAreaStyle: false,
                        });
                        setChartType(ChartType.CARTESIAN);
                    });
                },
                selected: !!(
                    isChartTypeTheSameForAllSeries &&
                    isCartesianVisualizationConfig(visualizationConfig) &&
                    cartesianType === CartesianSeriesType.BAR &&
                    !cartesianFlipAxis
                ),
            },
            {
                label: 'Horizontal bar chart',
                chartKind: ChartKind.HORIZONTAL_BAR,
                onClick: () => {
                    startTransition(() => {
                        setCartesianType({
                            type: CartesianSeriesType.BAR,
                            flipAxes: true,
                            hasAreaStyle: false,
                        });
                        if (!pivotDimensions) setStacking(false);
                        setChartType(ChartType.CARTESIAN);
                    });
                },
                selected: !!(
                    isChartTypeTheSameForAllSeries &&
                    isCartesianVisualizationConfig(visualizationConfig) &&
                    cartesianType === CartesianSeriesType.BAR &&
                    cartesianFlipAxis
                ),
            },
            {
                label: 'Line chart',
                chartKind: ChartKind.LINE,
                onClick: () => {
                    startTransition(() => {
                        setCartesianType({
                            type: CartesianSeriesType.LINE,
                            flipAxes: false,
                            hasAreaStyle: false,
                        });
                        setStacking(false);
                        setChartType(ChartType.CARTESIAN);
                    });
                },
                selected: !!(
                    isChartTypeTheSameForAllSeries &&
                    isCartesianVisualizationConfig(visualizationConfig) &&
                    cartesianType === CartesianSeriesType.LINE
                ),
            },
            {
                label: 'Area chart',
                chartKind: ChartKind.AREA,
                onClick: () => {
                    startTransition(() => {
                        setCartesianType({
                            type: CartesianSeriesType.LINE,
                            flipAxes: false,
                            hasAreaStyle: true,
                        });
                        setStacking(true);
                        setChartType(ChartType.CARTESIAN);
                    });
                },
                selected: !!(
                    isChartTypeTheSameForAllSeries &&
                    isCartesianVisualizationConfig(visualizationConfig) &&
                    cartesianType === CartesianSeriesType.AREA
                ),
            },
            {
                label: 'Scatter plot',
                chartKind: ChartKind.SCATTER,
                onClick: () => {
                    startTransition(() => {
                        setCartesianType({
                            type: CartesianSeriesType.SCATTER,
                            flipAxes: false,
                            hasAreaStyle: false,
                        });
                        setStacking(false);
                        setChartType(ChartType.CARTESIAN);
                    });
                },
                selected: !!(
                    isChartTypeTheSameForAllSeries &&
                    isCartesianVisualizationConfig(visualizationConfig) &&
                    cartesianType === CartesianSeriesType.SCATTER
                ),
            },
            {
                label:
                    (isChartTypeTheSameForAllSeries &&
                        isCartesianVisualizationConfig(visualizationConfig)) ||
                    isTableVisualizationConfig(visualizationConfig) ||
                    isBigNumberVisualizationConfig(visualizationConfig) ||
                    isPieVisualizationConfig(visualizationConfig)
                        ? 'Mixed chart - Use series tab to configure it'
                        : 'Mixed chart',
                chartKind: ChartKind.MIXED,
                disabled:
                    (isChartTypeTheSameForAllSeries &&
                        isCartesianVisualizationConfig(visualizationConfig)) ||
                    disabled,
                onClick: () => {},
                selected:
                    !isChartTypeTheSameForAllSeries &&
                    isCartesianVisualizationConfig(visualizationConfig),
            },
            {
                label: 'Pie chart',
                chartKind: ChartKind.PIE,
                onClick: () => {
                    startTransition(() => {
                        setPivotDimensions(undefined);
                        setStacking(undefined);
                        setCartesianType(undefined);
                        setChartType(ChartType.PIE);
                    });
                },
                selected: isPieVisualizationConfig(visualizationConfig),
            },
            {
                label: 'Table',
                chartKind: ChartKind.TABLE,
                onClick: () => {
                    startTransition(() => {
                        setPivotDimensions(undefined);
                        setStacking(undefined);
                        setCartesianType(undefined);
                        setChartType(ChartType.TABLE);
                    });
                },
                selected: isTableVisualizationConfig(visualizationConfig),
            },
            {
                label: 'Big number',
                chartKind: ChartKind.BIG_NUMBER,
                onClick: () => {
                    startTransition(() => {
                        setPivotDimensions(undefined);
                        setStacking(undefined);
                        setCartesianType(undefined);
                        setChartType(ChartType.BIG_NUMBER);
                    });
                },
                selected: isBigNumberVisualizationConfig(visualizationConfig),
            },
            {
                label: isCustomConfigEnabled
                    ? 'Custom'
                    : `Custom - This feature is currently unavailable.`,
                chartKind: ChartKind.CUSTOM,
                disabled: !isCustomConfigEnabled,
                onClick: () => {
                    startTransition(() => {
                        setPivotDimensions(undefined);
                        setStacking(undefined);
                        setCartesianType(undefined);
                        setChartType(ChartType.CUSTOM);
                    });
                },
                selected: isCustomVisualizationConfig(visualizationConfig),
            },
        ],
        [
            cartesianFlipAxis,
            cartesianType,
            disabled,
            isChartTypeTheSameForAllSeries,
            isCustomConfigEnabled,
            pivotDimensions,
            setCartesianType,
            setChartType,
            setPivotDimensions,
            setStacking,
            visualizationConfig,
        ],
    );

    return (
        <Group spacing="md">
            {visualizations.map((viz) => (
                <VisualizationActionIcon
                    key={viz.chartKind}
                    label={viz.label}
                    disabled={viz.disabled ?? disabled}
                    onClick={viz.onClick}
                    selected={viz.selected}
                    chartKind={viz.chartKind}
                />
            ))}
        </Group>
    );
});

export default VisualizationCardOptions;
