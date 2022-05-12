import { Button, IconName } from '@blueprintjs/core';
import { Popover2 } from '@blueprintjs/popover2';
import {
    CartesianSeriesType,
    ChartType,
    isSeriesWithMixedChartTypes,
} from 'common';
import React, { FC, useMemo, useState } from 'react';
import { useVisualizationContext } from '../../LightdashVisualization/VisualizationProvider';
import {
    ChartOption,
    ChartOptionsWrapper,
} from './VisualizationCardOptions.style';

const VisualizationCardOptions: FC = () => {
    const {
        chartType,
        setChartType,
        isLoading,
        plotData,
        cartesianConfig,
        setPivotDimensions,
    } = useVisualizationContext();
    const disabled = isLoading || plotData.length <= 0;
    const cartesianType = cartesianConfig.dirtyChartType;
    const cartesianFlipAxis = cartesianConfig.dirtyLayout?.flipAxes;
    const [isOpen, setIsOpen] = useState<boolean>(false);
    const isChartTypeTheSameForAllSeries: boolean =
        !isSeriesWithMixedChartTypes(
            cartesianConfig.dirtyEchartsConfig?.series,
        );

    const selectedChartType = useMemo<{ text: string; icon: IconName }>(() => {
        switch (chartType) {
            case ChartType.CARTESIAN: {
                if (!isChartTypeTheSameForAllSeries) {
                    return {
                        text: 'Mixed',
                        icon: 'chart',
                    };
                }
                switch (cartesianType) {
                    case CartesianSeriesType.LINE:
                        return {
                            text: 'Line chart',
                            icon: 'timeline-line-chart',
                        };
                    case CartesianSeriesType.BAR:
                        return cartesianFlipAxis
                            ? {
                                  text: 'Bar chart',
                                  icon: 'horizontal-bar-chart',
                              }
                            : {
                                  text: 'Column chart',
                                  icon: 'timeline-bar-chart',
                              };
                    case CartesianSeriesType.SCATTER:
                        return { text: 'Scatter chart', icon: 'scatter-plot' };
                    default:
                        const never: never = cartesianType;
                        throw new Error('Cartesian type not supported');
                }
            }
            case ChartType.TABLE:
                return {
                    text: 'Table',
                    icon: 'panel-table',
                };
            case ChartType.BIG_NUMBER:
                return {
                    text: 'Big number',
                    icon: 'numerical',
                };
            case ChartType.DONUT:
                return {
                    text: 'Donut',
                    icon: 'doughnut-chart',
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
    ]);

    return (
        <Popover2
            content={
                <ChartOptionsWrapper>
                    <ChartOption
                        minimal
                        active={
                            isChartTypeTheSameForAllSeries &&
                            chartType === ChartType.CARTESIAN &&
                            cartesianType === CartesianSeriesType.BAR &&
                            !cartesianFlipAxis
                        }
                        icon="timeline-bar-chart"
                        onClick={() => {
                            setChartType(ChartType.CARTESIAN);
                            cartesianConfig.setType(
                                CartesianSeriesType.BAR,
                                false,
                            );
                            setIsOpen(false);
                        }}
                        disabled={disabled}
                        name="Column"
                        text="Column chart"
                    />

                    <ChartOption
                        minimal
                        active={
                            isChartTypeTheSameForAllSeries &&
                            chartType === ChartType.CARTESIAN &&
                            cartesianType === CartesianSeriesType.BAR &&
                            cartesianFlipAxis
                        }
                        icon="horizontal-bar-chart"
                        onClick={() => {
                            setChartType(ChartType.CARTESIAN);
                            cartesianConfig.setType(
                                CartesianSeriesType.BAR,
                                true,
                            );
                            setIsOpen(false);
                        }}
                        disabled={disabled}
                        name="Bar"
                        text="Bar chart"
                    />

                    <ChartOption
                        minimal
                        active={
                            isChartTypeTheSameForAllSeries &&
                            chartType === ChartType.CARTESIAN &&
                            cartesianType === CartesianSeriesType.LINE
                        }
                        icon="timeline-line-chart"
                        onClick={() => {
                            setChartType(ChartType.CARTESIAN);
                            cartesianConfig.setType(
                                CartesianSeriesType.LINE,
                                false,
                            );
                            setIsOpen(false);
                        }}
                        disabled={disabled}
                        name="Line"
                        text="Line chart"
                    />

                    <ChartOption
                        minimal
                        active={
                            isChartTypeTheSameForAllSeries &&
                            chartType === ChartType.CARTESIAN &&
                            cartesianType === CartesianSeriesType.SCATTER
                        }
                        icon="scatter-plot"
                        onClick={() => {
                            setChartType(ChartType.CARTESIAN);
                            cartesianConfig.setType(
                                CartesianSeriesType.SCATTER,
                                false,
                            );
                            setIsOpen(false);
                        }}
                        disabled={disabled}
                        name="Scatter"
                        text="Scatter chart"
                    />
                    <ChartOption
                        minimal
                        active={chartType === ChartType.DONUT}
                        icon="doughnut-chart"
                        onClick={() => {
                            setChartType(ChartType.DONUT);
                            setPivotDimensions(undefined);
                            setIsOpen(false);
                        }}
                        disabled={disabled}
                        name="Donut"
                        text="Donut"
                    />
                    <ChartOption
                        minimal
                        active={chartType === ChartType.TABLE}
                        icon="panel-table"
                        onClick={() => {
                            setChartType(ChartType.TABLE);
                            setPivotDimensions(undefined);
                            setIsOpen(false);
                        }}
                        disabled={disabled}
                        name="Table"
                        text="Table"
                    />

                    <ChartOption
                        minimal
                        active={chartType === ChartType.BIG_NUMBER}
                        icon="numerical"
                        onClick={() => {
                            setChartType(ChartType.BIG_NUMBER);
                            setPivotDimensions(undefined);
                            setIsOpen(false);
                        }}
                        disabled={disabled}
                        name="Big Number"
                        text="Big number"
                    />
                </ChartOptionsWrapper>
            }
            interactionKind="click"
            isOpen={isOpen}
            onInteraction={setIsOpen}
            position="bottom"
            lazy={false}
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
};

export default VisualizationCardOptions;
