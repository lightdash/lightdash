import {
    assertUnreachable,
    CartesianSeriesType,
    ChartType,
    isSeriesWithMixedChartTypes,
} from '@lightdash/common';
import { Button, Menu } from '@mantine/core';
import {
    IconCaretDown,
    IconChartArea,
    IconChartAreaLine,
    IconChartBar,
    IconChartDots,
    IconChartLine,
    IconChartPie,
    IconSquareNumber1,
    IconTable,
} from '@tabler/icons-react';
import { FC, memo, useMemo } from 'react';
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
                        icon: <MantineIcon icon={IconChartAreaLine} />,
                    };
                }
                switch (cartesianType) {
                    case CartesianSeriesType.AREA:
                        setStacking(true);

                        return {
                            text: 'Area chart',
                            icon: <MantineIcon icon={IconChartArea} />,
                        };
                    case CartesianSeriesType.LINE:
                        setStacking(false);
                        return {
                            text: 'Line chart',
                            icon: <MantineIcon icon={IconChartLine} />,
                        };

                    case CartesianSeriesType.BAR:
                        return cartesianFlipAxis
                            ? {
                                  text: 'Horizontal bar chart',
                                  icon: (
                                      <MantineIcon
                                          icon={IconChartBar}
                                          style={{ rotate: '90deg' }}
                                      />
                                  ),
                              }
                            : {
                                  text: 'Bar chart',
                                  icon: <MantineIcon icon={IconChartBar} />,
                              };
                    case CartesianSeriesType.SCATTER:
                        setStacking(false);

                        return {
                            text: 'Scatter chart',
                            icon: <MantineIcon icon={IconChartDots} />,
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
                    icon: <MantineIcon icon={IconTable} />,
                };
            case ChartType.BIG_NUMBER:
                return {
                    text: 'Big value',
                    icon: <MantineIcon icon={IconSquareNumber1} />,
                };
            case ChartType.PIE:
                return {
                    text: 'Pie chart',
                    icon: <MantineIcon icon={IconChartPie} />,
                };
            default: {
                return assertUnreachable(
                    chartType,
                    `Unknown chart type ${chartType}`,
                );
            }
        }
    }, [
        isChartTypeTheSameForAllSeries,
        cartesianFlipAxis,
        cartesianType,
        chartType,
        setStacking,
    ]);

    return (
        <Menu
            shadow="md"
            withArrow
            closeOnItemClick
            closeOnClickOutside
            closeOnEscape
            position="bottom"
            disabled={disabled}
            keepMounted
        >
            <Menu.Target>
                <Button
                    disabled={disabled}
                    variant="subtle"
                    color="black"
                    size="xs"
                    leftIcon={selectedChartType.icon}
                    rightIcon={<MantineIcon icon={IconCaretDown} />}
                >
                    {selectedChartType.text}
                </Button>
            </Menu.Target>

            <Menu.Dropdown>
                <Menu.Item
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
                    disabled={disabled}
                >
                    Bar chart
                </Menu.Item>

                <Menu.Item
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
                    disabled={disabled}
                >
                    Horizontal bar chart
                </Menu.Item>

                <Menu.Item
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
                    disabled={disabled}
                >
                    Line chart
                </Menu.Item>

                <Menu.Item
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
                    disabled={disabled}
                >
                    Area chart
                </Menu.Item>

                <Menu.Item
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
                    disabled={disabled}
                >
                    Scatter chart
                </Menu.Item>

                {localStorage.getItem('enablePieCharts') === 'true' && (
                    <Menu.Item
                        color={chartType === ChartType.PIE ? 'blue' : undefined}
                        icon={<MantineIcon icon={IconChartPie} />}
                        onClick={() => {
                            setChartType(ChartType.PIE);
                            setPivotDimensions(undefined);
                        }}
                        disabled={disabled}
                    >
                        Pie chart
                    </Menu.Item>
                )}

                <Menu.Item
                    color={chartType === ChartType.TABLE ? 'blue' : undefined}
                    icon={<MantineIcon icon={IconTable} />}
                    onClick={() => {
                        setChartType(ChartType.TABLE);
                        setPivotDimensions(undefined);
                    }}
                    disabled={disabled}
                >
                    Table
                </Menu.Item>

                <Menu.Item
                    color={
                        chartType === ChartType.BIG_NUMBER ? 'blue' : undefined
                    }
                    icon={<MantineIcon icon={IconSquareNumber1} />}
                    onClick={() => {
                        setChartType(ChartType.BIG_NUMBER);
                        setPivotDimensions(undefined);
                    }}
                    disabled={disabled}
                >
                    Big value
                </Menu.Item>
            </Menu.Dropdown>
        </Menu>
    );
});

export default VisualizationCardOptions;
