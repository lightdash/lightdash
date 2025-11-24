import {
    assertUnreachable,
    CartesianSeriesType,
    ChartType,
    FeatureFlags,
    isSeriesWithMixedChartTypes,
} from '@lightdash/common';
import { Button, Menu } from '@mantine/core';
import {
    IconChartArea,
    IconChartAreaLine,
    IconChartBar,
    IconChartDots,
    IconChartLine,
    IconChartPie,
    IconChartTreemap,
    IconChevronDown,
    IconCode,
    IconFilter,
    IconGauge,
    IconMap,
    IconSquareNumber1,
    IconTable,
} from '@tabler/icons-react';
import { memo, useMemo, type FC, type ReactNode } from 'react';
import { useFeatureFlagEnabled } from '../../../hooks/useFeatureFlagEnabled';
import {
    COLLAPSABLE_CARD_BUTTON_PROPS,
    COLLAPSABLE_CARD_POPOVER_PROPS,
} from '../../common/CollapsableCard/constants';
import MantineIcon from '../../common/MantineIcon';
import {
    isBigNumberVisualizationConfig,
    isCartesianVisualizationConfig,
    isCustomVisualizationConfig,
    isFunnelVisualizationConfig,
    isGaugeVisualizationConfig,
    isMapVisualizationConfig,
    isPieVisualizationConfig,
    isTableVisualizationConfig,
    isTreemapVisualizationConfig,
} from '../../LightdashVisualization/types';
import { useVisualizationContext } from '../../LightdashVisualization/useVisualizationContext';

const VisualizationCardOptions: FC = memo(() => {
    const {
        visualizationConfig,
        setChartType,
        setCartesianType,
        setStacking,
        isLoading,
        resultsData,
        pivotDimensions,
    } = useVisualizationContext();
    const isMapsEnabled = useFeatureFlagEnabled(FeatureFlags.Maps);
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

    const selectedChartType = useMemo<{
        text: string;
        icon: ReactNode;
    }>(() => {
        switch (visualizationConfig.chartType) {
            case ChartType.CARTESIAN: {
                if (!isChartTypeTheSameForAllSeries) {
                    return {
                        text: 'Mixed',
                        icon: (
                            <MantineIcon
                                icon={IconChartAreaLine}
                                color="ldGray"
                            />
                        ),
                    };
                }

                const cartesianChartType =
                    visualizationConfig.chartConfig.dirtyChartType;

                switch (cartesianChartType) {
                    case CartesianSeriesType.AREA:
                        return {
                            text: 'Area chart',
                            icon: (
                                <MantineIcon
                                    icon={IconChartArea}
                                    color="ldGray"
                                />
                            ),
                        };
                    case CartesianSeriesType.LINE:
                        return {
                            text: 'Line chart',
                            icon: (
                                <MantineIcon
                                    icon={IconChartLine}
                                    color="ldGray"
                                />
                            ),
                        };

                    case CartesianSeriesType.BAR:
                        return cartesianFlipAxis
                            ? {
                                  text: 'Horizontal bar chart',
                                  icon: (
                                      <MantineIcon
                                          icon={IconChartBar}
                                          style={{ rotate: '90deg' }}
                                          color="ldGray"
                                      />
                                  ),
                              }
                            : {
                                  text: 'Bar chart',
                                  icon: (
                                      <MantineIcon
                                          icon={IconChartBar}
                                          color="ldGray"
                                      />
                                  ),
                              };
                    case CartesianSeriesType.SCATTER:
                        return {
                            text: 'Scatter chart',
                            icon: (
                                <MantineIcon
                                    icon={IconChartDots}
                                    color="ldGray"
                                />
                            ),
                        };
                    default:
                        return assertUnreachable(
                            cartesianChartType,
                            `Unknown cartesian type ${cartesianChartType}`,
                        );
                }
            }
            case ChartType.TABLE:
                return {
                    text: 'Table',
                    icon: <MantineIcon icon={IconTable} color="ldGray" />,
                };
            case ChartType.BIG_NUMBER:
                return {
                    text: 'Big value',
                    icon: (
                        <MantineIcon icon={IconSquareNumber1} color="ldGray" />
                    ),
                };
            case ChartType.PIE:
                return {
                    text: 'Pie chart',
                    icon: <MantineIcon icon={IconChartPie} color="ldGray" />,
                };
            case ChartType.FUNNEL:
                return {
                    text: 'Funnel chart',
                    icon: <MantineIcon icon={IconFilter} color="ldGray" />,
                };
            case ChartType.TREEMAP:
                return {
                    text: 'Treemap',
                    icon: (
                        <MantineIcon icon={IconChartTreemap} color="ldGray" />
                    ),
                };
            case ChartType.GAUGE:
                return {
                    text: 'Gauge',
                    icon: <MantineIcon icon={IconGauge} color="ldGray" />,
                };
            case ChartType.MAP:
                return {
                    text: 'Map',
                    icon: <MantineIcon icon={IconMap} color="gray" />,
                };
            case ChartType.CUSTOM:
                return {
                    text: 'Custom',
                    icon: <MantineIcon icon={IconCode} color="ldGray" />,
                };
            default: {
                return assertUnreachable(
                    visualizationConfig,
                    `Unknown visualization chart type`,
                );
            }
        }
    }, [
        visualizationConfig,
        isChartTypeTheSameForAllSeries,
        cartesianFlipAxis,
    ]);

    return (
        <Menu
            {...COLLAPSABLE_CARD_POPOVER_PROPS}
            closeOnItemClick
            disabled={disabled}
        >
            <Menu.Target>
                <Button
                    {...COLLAPSABLE_CARD_BUTTON_PROPS}
                    disabled={disabled}
                    leftIcon={selectedChartType.icon}
                    rightIcon={
                        <MantineIcon icon={IconChevronDown} color="ldGray" />
                    }
                    data-testid="VisualizationCardOptions"
                >
                    {selectedChartType.text}
                </Button>
            </Menu.Target>

            <Menu.Dropdown>
                <Menu.Item
                    disabled={disabled}
                    color={
                        isChartTypeTheSameForAllSeries &&
                        isCartesianVisualizationConfig(visualizationConfig) &&
                        cartesianType === CartesianSeriesType.BAR &&
                        !cartesianFlipAxis
                            ? 'blue'
                            : undefined
                    }
                    icon={<MantineIcon icon={IconChartBar} />}
                    onClick={() => {
                        setCartesianType({
                            type: CartesianSeriesType.BAR,
                            flipAxes: false,
                            hasAreaStyle: false,
                        });
                        setChartType(ChartType.CARTESIAN);
                    }}
                >
                    Bar chart
                </Menu.Item>
                <Menu.Item
                    disabled={disabled}
                    color={
                        isChartTypeTheSameForAllSeries &&
                        isCartesianVisualizationConfig(visualizationConfig) &&
                        cartesianType === CartesianSeriesType.BAR &&
                        cartesianFlipAxis
                            ? 'blue'
                            : undefined
                    }
                    icon={
                        <MantineIcon
                            icon={IconChartBar}
                            style={{ rotate: '90deg' }}
                        />
                    }
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
                    Horizontal bar chart
                </Menu.Item>
                <Menu.Item
                    disabled={disabled}
                    color={
                        isChartTypeTheSameForAllSeries &&
                        isCartesianVisualizationConfig(visualizationConfig) &&
                        cartesianType === CartesianSeriesType.LINE
                            ? 'blue'
                            : undefined
                    }
                    icon={<MantineIcon icon={IconChartLine} />}
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
                    Line chart
                </Menu.Item>
                <Menu.Item
                    disabled={disabled}
                    color={
                        isChartTypeTheSameForAllSeries &&
                        isCartesianVisualizationConfig(visualizationConfig) &&
                        cartesianType === CartesianSeriesType.AREA
                            ? 'blue'
                            : undefined
                    }
                    icon={<MantineIcon icon={IconChartArea} />}
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
                    Area chart
                </Menu.Item>
                <Menu.Item
                    disabled={disabled}
                    color={
                        isChartTypeTheSameForAllSeries &&
                        isCartesianVisualizationConfig(visualizationConfig) &&
                        cartesianType === CartesianSeriesType.SCATTER
                            ? 'blue'
                            : undefined
                    }
                    icon={<MantineIcon icon={IconChartDots} />}
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
                    Scatter chart
                </Menu.Item>

                <Menu.Item
                    disabled={disabled}
                    color={
                        isPieVisualizationConfig(visualizationConfig)
                            ? 'blue'
                            : undefined
                    }
                    icon={<MantineIcon icon={IconChartPie} />}
                    onClick={() => {
                        setStacking(undefined);
                        setCartesianType(undefined);
                        setChartType(ChartType.PIE);
                    }}
                >
                    Pie chart
                </Menu.Item>

                <Menu.Item
                    disabled={disabled}
                    color={
                        isFunnelVisualizationConfig(visualizationConfig)
                            ? 'blue'
                            : undefined
                    }
                    icon={<MantineIcon icon={IconFilter} />}
                    onClick={() => {
                        setStacking(undefined);
                        setCartesianType(undefined);
                        setChartType(ChartType.FUNNEL);
                    }}
                >
                    Funnel chart
                </Menu.Item>

                <Menu.Item
                    disabled={disabled}
                    color={
                        isTreemapVisualizationConfig(visualizationConfig)
                            ? 'blue'
                            : undefined
                    }
                    icon={<MantineIcon icon={IconChartTreemap} />}
                    onClick={() => {
                        setStacking(undefined);
                        setCartesianType(undefined);
                        setChartType(ChartType.TREEMAP);
                    }}
                >
                    Treemap
                </Menu.Item>

                <Menu.Item
                    disabled={disabled}
                    color={
                        isGaugeVisualizationConfig(visualizationConfig)
                            ? 'blue'
                            : undefined
                    }
                    icon={<MantineIcon icon={IconGauge} />}
                    onClick={() => {
                        setStacking(undefined);
                        setCartesianType(undefined);
                        setChartType(ChartType.GAUGE);
                    }}
                >
                    Gauge
                </Menu.Item>

                {isMapsEnabled && (
                    <Menu.Item
                        disabled={disabled}
                        color={
                            isMapVisualizationConfig(visualizationConfig)
                                ? 'blue'
                                : undefined
                        }
                        icon={<MantineIcon icon={IconMap} />}
                        onClick={() => {
                            setStacking(undefined);
                            setCartesianType(undefined);
                            setChartType(ChartType.MAP);
                        }}
                    >
                        Map
                    </Menu.Item>
                )}

                <Menu.Item
                    disabled={disabled}
                    color={
                        isTableVisualizationConfig(visualizationConfig)
                            ? 'blue'
                            : undefined
                    }
                    icon={<MantineIcon icon={IconTable} />}
                    onClick={() => {
                        setStacking(undefined);
                        setCartesianType(undefined);
                        setChartType(ChartType.TABLE);
                    }}
                >
                    Table
                </Menu.Item>
                <Menu.Item
                    disabled={disabled}
                    color={
                        isBigNumberVisualizationConfig(visualizationConfig)
                            ? 'blue'
                            : undefined
                    }
                    icon={<MantineIcon icon={IconSquareNumber1} />}
                    onClick={() => {
                        setStacking(undefined);
                        setCartesianType(undefined);
                        setChartType(ChartType.BIG_NUMBER);
                    }}
                >
                    Big value
                </Menu.Item>

                <Menu.Item
                    disabled={disabled}
                    color={
                        isCustomVisualizationConfig(visualizationConfig)
                            ? 'blue'
                            : undefined
                    }
                    icon={<MantineIcon icon={IconCode} />}
                    onClick={() => {
                        setStacking(undefined);
                        setCartesianType(undefined);
                        setChartType(ChartType.CUSTOM);
                    }}
                >
                    Custom
                </Menu.Item>
            </Menu.Dropdown>
        </Menu>
    );
});

export default VisualizationCardOptions;
