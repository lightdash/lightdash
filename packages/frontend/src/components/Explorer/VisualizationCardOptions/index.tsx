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
    IconSquareNumber1,
    IconTable,
} from '@tabler/icons-react';
import { FC, memo, useMemo } from 'react';
import {
    COLLAPSABLE_CARD_BUTTON_PROPS,
    COLLAPSABLE_CARD_POPOVER_PROPS,
} from '../../common/CollapsableCard';
import MantineIcon from '../../common/MantineIcon';
import { useVisualizationContext } from '../../LightdashVisualization/VisualizationProvider';

const VisualizationCardOptions: FC = memo(() => {
    const {
        chartType,
        setChartType,
        isLoading,
        resultsData,
        cartesianConfig,
        setPivotDimensions,
        pivotDimensions,
        cartesianConfig: { setStacking },
    } = useVisualizationContext();
    const disabled = isLoading || !resultsData || resultsData.rows.length <= 0;
    const cartesianType = cartesianConfig.dirtyChartType;
    const cartesianFlipAxis = cartesianConfig.dirtyLayout?.flipAxes;
    const isChartTypeTheSameForAllSeries: boolean =
        !isSeriesWithMixedChartTypes(
            cartesianConfig.dirtyEchartsConfig?.series,
        );

    const selectedChartType = useMemo<{
        text: string;
        icon: JSX.Element;
    }>(() => {
        switch (chartType) {
            case ChartType.CARTESIAN: {
                if (!isChartTypeTheSameForAllSeries) {
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
                    case CartesianSeriesType.AREA:
                        setStacking(true);

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
                        setStacking(false);
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
                        if (!pivotDimensions) setStacking(false);
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
                        setStacking(false);

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
            default: {
                return assertUnreachable(
                    chartType,
                    `Unknown chart type ${chartType}`,
                );
            }
        }
    }, [
        chartType,
        isChartTypeTheSameForAllSeries,
        cartesianType,
        setStacking,
        pivotDimensions,
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
                        <MantineIcon icon={IconChevronDown} color="gray" />
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
                        chartType === ChartType.CARTESIAN &&
                        cartesianType === CartesianSeriesType.BAR &&
                        !cartesianFlipAxis
                            ? 'blue'
                            : undefined
                    }
                    icon={<MantineIcon icon={IconChartBar} />}
                    onClick={() => {
                        setChartType(ChartType.CARTESIAN);
                        cartesianConfig.setType(
                            CartesianSeriesType.BAR,
                            false,
                            false,
                        );
                    }}
                >
                    Bar chart
                </Menu.Item>

                <Menu.Item
                    disabled={disabled}
                    color={
                        isChartTypeTheSameForAllSeries &&
                        chartType === ChartType.CARTESIAN &&
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
                        setChartType(ChartType.CARTESIAN);
                        cartesianConfig.setType(
                            CartesianSeriesType.BAR,
                            true,
                            false,
                        );
                    }}
                >
                    Horizontal bar chart
                </Menu.Item>

                <Menu.Item
                    disabled={disabled}
                    color={
                        isChartTypeTheSameForAllSeries &&
                        chartType === ChartType.CARTESIAN &&
                        cartesianType === CartesianSeriesType.LINE
                            ? 'blue'
                            : undefined
                    }
                    icon={<MantineIcon icon={IconChartLine} />}
                    onClick={() => {
                        setChartType(ChartType.CARTESIAN);
                        cartesianConfig.setType(
                            CartesianSeriesType.LINE,
                            false,
                            false,
                        );
                    }}
                >
                    Line chart
                </Menu.Item>

                <Menu.Item
                    disabled={disabled}
                    color={
                        isChartTypeTheSameForAllSeries &&
                        chartType === ChartType.CARTESIAN &&
                        cartesianType === CartesianSeriesType.AREA
                            ? 'blue'
                            : undefined
                    }
                    icon={<MantineIcon icon={IconChartArea} />}
                    onClick={() => {
                        setChartType(ChartType.CARTESIAN);
                        cartesianConfig.setType(
                            CartesianSeriesType.LINE,
                            false,
                            true,
                        );
                    }}
                >
                    Area chart
                </Menu.Item>

                <Menu.Item
                    disabled={disabled}
                    color={
                        isChartTypeTheSameForAllSeries &&
                        chartType === ChartType.CARTESIAN &&
                        cartesianType === CartesianSeriesType.SCATTER
                            ? 'blue'
                            : undefined
                    }
                    icon={<MantineIcon icon={IconChartDots} />}
                    onClick={() => {
                        setChartType(ChartType.CARTESIAN);
                        cartesianConfig.setType(
                            CartesianSeriesType.SCATTER,
                            false,
                            false,
                        );
                    }}
                >
                    Scatter chart
                </Menu.Item>

                <Menu.Item
                    disabled={disabled}
                    color={chartType === ChartType.PIE ? 'blue' : undefined}
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
                    color={chartType === ChartType.TABLE ? 'blue' : undefined}
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
                        chartType === ChartType.BIG_NUMBER ? 'blue' : undefined
                    }
                    icon={<MantineIcon icon={IconSquareNumber1} />}
                    onClick={() => {
                        setChartType(ChartType.BIG_NUMBER);
                        setPivotDimensions(undefined);
                    }}
                >
                    Big value
                </Menu.Item>
            </Menu.Dropdown>
        </Menu>
    );
});

export default VisualizationCardOptions;
