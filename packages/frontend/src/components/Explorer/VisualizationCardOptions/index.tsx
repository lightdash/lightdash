import {
    assertUnreachable,
    CartesianSeriesType,
    ChartType,
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
    IconChevronDown,
    IconCode,
    IconSquareNumber1,
    IconTable,
} from '@tabler/icons-react';
import { useFeatureFlagEnabled } from 'posthog-js/react';
import { FC, memo, useMemo } from 'react';
import { useApp } from '../../../providers/AppProvider';
import {
    COLLAPSABLE_CARD_BUTTON_PROPS,
    COLLAPSABLE_CARD_POPOVER_PROPS,
} from '../../common/CollapsableCard';
import MantineIcon from '../../common/MantineIcon';
import { useVisualizationContext } from '../../LightdashVisualization/VisualizationProvider';

const VisualizationCardOptions: FC = memo(() => {
    const { health } = useApp();

    // FEATURE FLAG: custom-visualizations-enabled
    const customVizEnabled = useFeatureFlagEnabled(
        'custom-visualizations-enabled',
    );

    const {
        setChartType,
        isLoading,
        resultsData,
        visualizationConfig,
        setPivotDimensions,
        pivotDimensions,
    } = useVisualizationContext();

    const isCartesian = visualizationConfig?.chartType === ChartType.CARTESIAN;
    const cartesianType = isCartesian
        ? visualizationConfig.chartConfig.dirtyChartType
        : undefined;
    const isCartesianChartTypeTheSameForAllSeries =
        isCartesian &&
        isSeriesWithMixedChartTypes(
            visualizationConfig.chartConfig.dirtyEchartsConfig?.series,
        );

    const cartesianFlipAxis = isCartesian
        ? visualizationConfig.chartConfig.dirtyLayout?.flipAxes
        : undefined;

    const disabled = isLoading || !resultsData || resultsData.rows.length <= 0;

    const selectedChartType = useMemo(() => {
        if (!visualizationConfig) return null;

        switch (visualizationConfig.chartType) {
            case ChartType.CARTESIAN: {
                if (!isCartesianChartTypeTheSameForAllSeries) {
                    return {
                        text: 'Mixed',
                        icon: (
                            <MantineIcon
                                icon={IconChartAreaLine}
                                color="gray"
                            />
                        ),
                    };
                }

                switch (cartesianType) {
                    case undefined:
                        throw new Error(
                            'Cartesian type should not be undefined',
                        );
                    case CartesianSeriesType.AREA:
                        visualizationConfig.chartConfig.setStacking(true);

                        return {
                            text: 'Area chart',
                            icon: (
                                <MantineIcon
                                    icon={IconChartArea}
                                    color="gray"
                                />
                            ),
                        };
                    case CartesianSeriesType.LINE:
                        visualizationConfig.chartConfig.setStacking(false);
                        return {
                            text: 'Line chart',
                            icon: (
                                <MantineIcon
                                    icon={IconChartLine}
                                    color="gray"
                                />
                            ),
                        };

                    case CartesianSeriesType.BAR:
                        if (!pivotDimensions) {
                            visualizationConfig.chartConfig.setStacking(false);
                        }

                        return cartesianFlipAxis
                            ? {
                                  text: 'Horizontal bar chart',
                                  icon: (
                                      <MantineIcon
                                          icon={IconChartBar}
                                          style={{ rotate: '90deg' }}
                                          color="gray"
                                      />
                                  ),
                              }
                            : {
                                  text: 'Bar chart',
                                  icon: (
                                      <MantineIcon
                                          icon={IconChartBar}
                                          color="gray"
                                      />
                                  ),
                              };
                    case CartesianSeriesType.SCATTER:
                        visualizationConfig.chartConfig.setStacking(false);

                        return {
                            text: 'Scatter chart',
                            icon: (
                                <MantineIcon
                                    icon={IconChartDots}
                                    color="gray"
                                />
                            ),
                        };
                    default:
                        return assertUnreachable(
                            cartesianType,
                            `Unknown cartesian type ${cartesianType}`,
                        );
                }
            }
            case ChartType.TABLE:
                return {
                    text: 'Table',
                    icon: <MantineIcon icon={IconTable} color="gray" />,
                };
            case ChartType.BIG_NUMBER:
                return {
                    text: 'Big value',
                    icon: <MantineIcon icon={IconSquareNumber1} color="gray" />,
                };
            case ChartType.PIE:
                return {
                    text: 'Pie chart',
                    icon: <MantineIcon icon={IconChartPie} color="gray" />,
                };
            case ChartType.CUSTOM:
                return {
                    text: 'Custom',
                    icon: <MantineIcon icon={IconCode} color="gray" />,
                };
            default: {
                return assertUnreachable(
                    visualizationConfig,
                    'Unknown chart type',
                );
            }
        }
    }, [
        visualizationConfig,
        cartesianType,
        cartesianFlipAxis,
        isCartesianChartTypeTheSameForAllSeries,
        pivotDimensions,
    ]);

    return (
        <Menu
            {...COLLAPSABLE_CARD_POPOVER_PROPS}
            closeOnItemClick
            disabled={disabled}
        >
            {selectedChartType && (
                <Menu.Target>
                    <Button
                        {...COLLAPSABLE_CARD_BUTTON_PROPS}
                        disabled={disabled}
                        leftIcon={selectedChartType.icon}
                        rightIcon={
                            <MantineIcon icon={IconChevronDown} color="gray" />
                        }
                        data-testid="VisualizationCardOptions"
                    >
                        {selectedChartType.text}
                    </Button>
                </Menu.Target>
            )}

            <Menu.Dropdown>
                <Menu.Item
                    disabled={disabled}
                    color={
                        isCartesianChartTypeTheSameForAllSeries &&
                        cartesianType === CartesianSeriesType.BAR &&
                        !cartesianFlipAxis
                            ? 'blue'
                            : undefined
                    }
                    icon={<MantineIcon icon={IconChartBar} />}
                    onClick={() => {
                        if (isCartesian) {
                            setChartType(ChartType.CARTESIAN);
                            visualizationConfig.chartConfig.setType(
                                CartesianSeriesType.BAR,
                                false,
                                false,
                            );
                        }
                    }}
                >
                    Bar chart
                </Menu.Item>

                <Menu.Item
                    disabled={disabled}
                    color={
                        isCartesianChartTypeTheSameForAllSeries &&
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
                        if (isCartesian) {
                            setChartType(ChartType.CARTESIAN);
                            visualizationConfig.chartConfig.setType(
                                CartesianSeriesType.BAR,
                                true,
                                false,
                            );
                        }
                    }}
                >
                    Horizontal bar chart
                </Menu.Item>

                <Menu.Item
                    disabled={disabled}
                    color={
                        isCartesianChartTypeTheSameForAllSeries &&
                        cartesianType === CartesianSeriesType.LINE
                            ? 'blue'
                            : undefined
                    }
                    icon={<MantineIcon icon={IconChartLine} />}
                    onClick={() => {
                        if (isCartesian) {
                            setChartType(ChartType.CARTESIAN);
                            visualizationConfig.chartConfig.setType(
                                CartesianSeriesType.LINE,
                                false,
                                false,
                            );
                        }
                    }}
                >
                    Line chart
                </Menu.Item>

                <Menu.Item
                    disabled={disabled}
                    color={
                        isCartesianChartTypeTheSameForAllSeries &&
                        cartesianType === CartesianSeriesType.AREA
                            ? 'blue'
                            : undefined
                    }
                    icon={<MantineIcon icon={IconChartArea} />}
                    onClick={() => {
                        if (isCartesian) {
                            setChartType(ChartType.CARTESIAN);
                            visualizationConfig.chartConfig.setType(
                                CartesianSeriesType.LINE,
                                false,
                                true,
                            );
                        }
                    }}
                >
                    Area chart
                </Menu.Item>

                <Menu.Item
                    disabled={disabled}
                    color={
                        isCartesianChartTypeTheSameForAllSeries &&
                        cartesianType === CartesianSeriesType.SCATTER
                            ? 'blue'
                            : undefined
                    }
                    icon={<MantineIcon icon={IconChartDots} />}
                    onClick={() => {
                        if (isCartesian) {
                            setChartType(ChartType.CARTESIAN);
                            visualizationConfig.chartConfig.setType(
                                CartesianSeriesType.SCATTER,
                                false,
                                false,
                            );
                        }
                    }}
                >
                    Scatter chart
                </Menu.Item>

                <Menu.Item
                    disabled={disabled}
                    color={
                        visualizationConfig?.chartType === ChartType.PIE
                            ? 'blue'
                            : undefined
                    }
                    icon={<MantineIcon icon={IconChartPie} />}
                    onClick={() => {
                        setChartType(ChartType.PIE);
                        setPivotDimensions(undefined);
                    }}
                >
                    Pie chart
                </Menu.Item>

                <Menu.Item
                    disabled={disabled}
                    color={
                        visualizationConfig?.chartType === ChartType.TABLE
                            ? 'blue'
                            : undefined
                    }
                    icon={<MantineIcon icon={IconTable} />}
                    onClick={() => {
                        setChartType(ChartType.TABLE);
                        setPivotDimensions(undefined);
                    }}
                >
                    Table
                </Menu.Item>

                <Menu.Item
                    disabled={disabled}
                    color={
                        visualizationConfig?.chartType === ChartType.BIG_NUMBER
                            ? 'blue'
                            : undefined
                    }
                    icon={<MantineIcon icon={IconSquareNumber1} />}
                    onClick={() => {
                        setChartType(ChartType.BIG_NUMBER);
                        setPivotDimensions(undefined);
                    }}
                >
                    Big value
                </Menu.Item>
                {health.data &&
                    health.data.customVisualizationsEnabled &&
                    customVizEnabled && (
                        <Menu.Item
                            disabled={disabled}
                            color={
                                visualizationConfig?.chartType ===
                                ChartType.CUSTOM
                                    ? 'blue'
                                    : undefined
                            }
                            icon={<MantineIcon icon={IconCode} />}
                            onClick={() => {
                                setChartType(ChartType.CUSTOM);
                                setPivotDimensions(undefined);
                            }}
                        >
                            Custom
                        </Menu.Item>
                    )}
            </Menu.Dropdown>
        </Menu>
    );
});

export default VisualizationCardOptions;
