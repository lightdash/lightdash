import { Button } from '@blueprintjs/core';
import { Tooltip2 } from '@blueprintjs/popover2';
import { CartesianSeriesType, ChartType } from 'common';
import React, { FC } from 'react';
import { useVisualizationContext } from '../../LightdashVisualization/VisualizationProvider';

const VisualizationCardOptions: FC = () => {
    const { chartType, setChartType, isLoading, plotData, cartesianConfig } =
        useVisualizationContext();
    const disabled = isLoading || plotData.length <= 0;
    const cartesianType = (cartesianConfig.dirtyConfig?.series || [])[0]?.type;
    const cartesianFlipAxis = (cartesianConfig.dirtyConfig?.series || [])[0]
        ?.flipAxes;

    return (
        <>
            <Tooltip2
                content="Column"
                placement="top"
                interactionKind="hover"
                disabled={disabled}
            >
                <Button
                    minimal
                    active={
                        chartType === ChartType.CARTESIAN &&
                        cartesianType === CartesianSeriesType.BAR &&
                        !cartesianFlipAxis
                    }
                    icon="timeline-bar-chart"
                    onClick={() => {
                        setChartType(ChartType.CARTESIAN);
                        cartesianConfig.setType(CartesianSeriesType.BAR, false);
                    }}
                    disabled={disabled}
                    name="Column"
                />
            </Tooltip2>
            <Tooltip2
                content="Bar"
                placement="top"
                interactionKind="hover"
                disabled={disabled}
            >
                <Button
                    minimal
                    active={
                        chartType === ChartType.CARTESIAN &&
                        cartesianType === CartesianSeriesType.BAR &&
                        cartesianFlipAxis
                    }
                    icon="horizontal-bar-chart"
                    onClick={() => {
                        setChartType(ChartType.CARTESIAN);
                        cartesianConfig.setType(CartesianSeriesType.BAR, true);
                    }}
                    disabled={disabled}
                    name="Bar"
                />
            </Tooltip2>
            <Tooltip2
                content="Line"
                placement="top"
                interactionKind="hover"
                disabled={disabled}
            >
                <Button
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
                    }}
                    disabled={disabled}
                    name="Line"
                />
            </Tooltip2>
            <Tooltip2
                content="Scatter"
                placement="top"
                interactionKind="hover"
                disabled={disabled}
            >
                <Button
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
                    }}
                    disabled={disabled}
                    name="Scatter"
                />
            </Tooltip2>
            <Tooltip2
                content="Table"
                placement="top"
                interactionKind="hover"
                disabled={disabled}
            >
                <Button
                    minimal
                    active={chartType === ChartType.TABLE}
                    icon="panel-table"
                    onClick={() => {
                        setChartType(ChartType.TABLE);
                    }}
                    disabled={disabled}
                    name="Table"
                />
            </Tooltip2>
            <Tooltip2
                content="Big number"
                placement="top"
                interactionKind="hover"
                disabled={disabled}
            >
                <Button
                    minimal
                    active={chartType === ChartType.BIG_NUMBER}
                    icon="numerical"
                    onClick={() => {
                        setChartType(ChartType.BIG_NUMBER);
                    }}
                    disabled={disabled}
                    name="Big Number"
                />
            </Tooltip2>
        </>
    );
};

export default VisualizationCardOptions;
