import { Button, Colors, Menu } from '@blueprintjs/core';
import { MenuItem2, Popover2 } from '@blueprintjs/popover2';
import {
    CartesianSeriesType,
    ChartType,
    isSeriesWithMixedChartTypes,
} from '@lightdash/common';
import {
    IconChartArea,
    IconChartAreaLine,
    IconChartBar,
    IconChartDots,
    IconChartLine,
    IconSquareNumber1,
    IconTable,
} from '@tabler/icons-react';
import { FC, memo, useMemo, useState } from 'react';
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
    const [isOpen, setIsOpen] = useState<boolean>(false);
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
                            <IconChartAreaLine
                                size={20}
                                color={
                                    disabled ? Colors.LIGHT_GRAY1 : Colors.GRAY1
                                }
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
                                <IconChartArea
                                    size={20}
                                    color={
                                        disabled
                                            ? Colors.LIGHT_GRAY1
                                            : Colors.GRAY1
                                    }
                                />
                            ),
                        };
                    case CartesianSeriesType.LINE:
                        setStacking(false);
                        return {
                            text: 'Line chart',
                            icon: (
                                <IconChartLine
                                    size={20}
                                    color={
                                        disabled
                                            ? Colors.LIGHT_GRAY1
                                            : Colors.GRAY1
                                    }
                                />
                            ),
                        };

                    case CartesianSeriesType.BAR:
                        return cartesianFlipAxis
                            ? {
                                  text: 'Horizontal bar chart',
                                  icon: (
                                      <IconChartBar
                                          size={20}
                                          style={{ rotate: '90deg' }}
                                          color={
                                              disabled
                                                  ? Colors.LIGHT_GRAY1
                                                  : Colors.GRAY1
                                          }
                                      />
                                  ),
                              }
                            : {
                                  text: 'Bar chart',
                                  icon: (
                                      <IconChartBar
                                          size={20}
                                          color={
                                              disabled
                                                  ? Colors.LIGHT_GRAY1
                                                  : Colors.GRAY1
                                          }
                                      />
                                  ),
                              };
                    case CartesianSeriesType.SCATTER:
                        setStacking(false);

                        return {
                            text: 'Scatter chart',
                            icon: (
                                <IconChartDots
                                    size={20}
                                    color={
                                        disabled
                                            ? Colors.LIGHT_GRAY1
                                            : Colors.GRAY1
                                    }
                                />
                            ),
                        };
                    default:
                        const never: never = cartesianType;
                        throw new Error('Cartesian type not supported');
                }
            }
            case ChartType.TABLE:
                return {
                    text: 'Table',
                    icon: (
                        <IconTable
                            size={20}
                            color={disabled ? Colors.LIGHT_GRAY1 : Colors.GRAY1}
                        />
                    ),
                };
            case ChartType.BIG_NUMBER:
                return {
                    text: 'Big value',
                    icon: (
                        <IconSquareNumber1
                            size={20}
                            color={disabled ? Colors.LIGHT_GRAY1 : Colors.GRAY1}
                        />
                    ),
                };
            default: {
                const never: never = chartType;
                throw new Error('Chart type not supported');
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
        <Popover2
            content={
                <Menu>
                    <MenuItem2
                        active={
                            isChartTypeTheSameForAllSeries &&
                            chartType === ChartType.CARTESIAN &&
                            cartesianType === CartesianSeriesType.BAR &&
                            !cartesianFlipAxis
                        }
                        icon={<IconChartBar size={20} color={Colors.GRAY1} />}
                        onClick={() => {
                            setChartType(ChartType.CARTESIAN);
                            cartesianConfig.setType(
                                CartesianSeriesType.BAR,
                                false,
                                false,
                            );
                            setIsOpen(false);
                        }}
                        disabled={disabled}
                        text="Bar chart"
                    />

                    <MenuItem2
                        active={
                            isChartTypeTheSameForAllSeries &&
                            chartType === ChartType.CARTESIAN &&
                            cartesianType === CartesianSeriesType.BAR &&
                            cartesianFlipAxis
                        }
                        icon={
                            <IconChartBar
                                size={20}
                                style={{ rotate: '90deg' }}
                                color={Colors.GRAY1}
                            />
                        }
                        onClick={() => {
                            setChartType(ChartType.CARTESIAN);
                            cartesianConfig.setType(
                                CartesianSeriesType.BAR,
                                true,
                                false,
                            );
                            setIsOpen(false);
                        }}
                        disabled={disabled}
                        text="Horizontal bar chart"
                    />

                    <MenuItem2
                        active={
                            isChartTypeTheSameForAllSeries &&
                            chartType === ChartType.CARTESIAN &&
                            cartesianType === CartesianSeriesType.LINE
                        }
                        icon={<IconChartLine size={20} color={Colors.GRAY1} />}
                        onClick={() => {
                            setChartType(ChartType.CARTESIAN);
                            cartesianConfig.setType(
                                CartesianSeriesType.LINE,
                                false,
                                false,
                            );
                            setIsOpen(false);
                        }}
                        disabled={disabled}
                        text="Line chart"
                    />

                    <MenuItem2
                        active={
                            isChartTypeTheSameForAllSeries &&
                            chartType === ChartType.CARTESIAN &&
                            cartesianType === CartesianSeriesType.AREA
                        }
                        icon={<IconChartArea size={20} color={Colors.GRAY1} />}
                        onClick={() => {
                            setChartType(ChartType.CARTESIAN);
                            cartesianConfig.setType(
                                CartesianSeriesType.LINE,
                                false,
                                true,
                            );
                            setIsOpen(false);
                        }}
                        disabled={disabled}
                        text="Area chart"
                    />

                    <MenuItem2
                        active={
                            isChartTypeTheSameForAllSeries &&
                            chartType === ChartType.CARTESIAN &&
                            cartesianType === CartesianSeriesType.SCATTER
                        }
                        icon={<IconChartDots size={20} color={Colors.GRAY1} />}
                        onClick={() => {
                            setChartType(ChartType.CARTESIAN);
                            cartesianConfig.setType(
                                CartesianSeriesType.SCATTER,
                                false,
                                false,
                            );
                            setIsOpen(false);
                        }}
                        disabled={disabled}
                        text="Scatter chart"
                    />

                    <MenuItem2
                        active={chartType === ChartType.TABLE}
                        icon={<IconTable size={20} color={Colors.GRAY1} />}
                        onClick={() => {
                            setChartType(ChartType.TABLE);
                            setPivotDimensions(undefined);
                            setIsOpen(false);
                        }}
                        disabled={disabled}
                        text="Table"
                    />

                    <MenuItem2
                        active={chartType === ChartType.BIG_NUMBER}
                        icon={
                            <IconSquareNumber1 size={20} color={Colors.GRAY1} />
                        }
                        onClick={() => {
                            setChartType(ChartType.BIG_NUMBER);
                            setPivotDimensions(undefined);
                            setIsOpen(false);
                        }}
                        disabled={disabled}
                        text="Big value"
                    />
                </Menu>
            }
            interactionKind="click"
            isOpen={isOpen}
            onInteraction={setIsOpen}
            position="bottom"
            disabled={disabled}
        >
            <Button
                minimal
                icon={selectedChartType.icon}
                rightIcon="caret-down"
                text={selectedChartType.text}
                disabled={disabled}
            />
        </Popover2>
    );
});

export default VisualizationCardOptions;
