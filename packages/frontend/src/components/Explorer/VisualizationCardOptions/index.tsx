import { Button, IconName } from '@blueprintjs/core';
import { Popover2 } from '@blueprintjs/popover2';
import { CartesianSeriesType, ChartType } from 'common';
import React, { FC, useState } from 'react';
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

    const selectChartType = () => {
        if (chartType === ChartType.CARTESIAN) {
            switch (cartesianType) {
                case 'line':
                    return { text: 'Line chart', icon: 'timeline-line-chart' };
                case 'bar':
                    return cartesianFlipAxis
                        ? { text: 'Bar chart', icon: 'horizontal-bar-chart' }
                        : { text: 'Column chart', icon: 'timeline-bar-chart' };
                case 'scatter':
                    return { text: 'Scatter chart', icon: 'scatter-plot' };
                default:
                    break;
            }
        }
        if (chartType === ChartType.TABLE) {
            return {
                text: 'Table',
                icon: 'panel-table',
            };
        }

        if (chartType === ChartType.BIG_NUMBER) {
            return {
                text: 'Big number',
                icon: 'numerical',
            };
        } else {
            return { text: 'Bar chart', icon: 'horizontal-bar-chart' };
        }
    };

    const [activeChartType, setActiveChartType] = useState(selectChartType());

    return (
        <Popover2
            content={
                <ChartOptionsWrapper>
                    <ChartOption
                        minimal
                        active={
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
                            setActiveChartType(selectChartType);
                        }}
                        disabled={disabled}
                        name="Column"
                        text="Column chart"
                    />

                    <ChartOption
                        minimal
                        active={
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
                            setActiveChartType(selectChartType);
                        }}
                        disabled={disabled}
                        name="Bar"
                        text="Bar chart"
                    />

                    <ChartOption
                        minimal
                        active={
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
                            setActiveChartType(selectChartType);
                        }}
                        disabled={disabled}
                        name="Line"
                        text="Line chart"
                    />

                    <ChartOption
                        minimal
                        active={
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
                            setActiveChartType(selectChartType);
                        }}
                        disabled={disabled}
                        name="Scatter"
                        text="Scatter chart"
                    />

                    <ChartOption
                        minimal
                        active={chartType === ChartType.TABLE}
                        icon="panel-table"
                        onClick={() => {
                            setChartType(ChartType.TABLE);
                            setPivotDimensions(undefined);
                             setActiveChartType(selectChartType);
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
                            setActiveChartType(selectChartType);
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
                icon={selectChartType().icon as IconName}
                rightIcon="caret-down"
                text={selectChartType().text}
                disabled={disabled}
            />
        </Popover2>
    );
};

export default VisualizationCardOptions;
