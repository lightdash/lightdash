import { Button } from '@blueprintjs/core';
import { Tooltip2 } from '@blueprintjs/popover2';
import { DBChartTypes } from 'common';
import React, { FC } from 'react';
import { useVisualizationContext } from '../../LightdashVisualization/VisualizationProvider';

const VisualizationCardOptions: FC = () => {
    const { chartType, setChartType, chartConfig } = useVisualizationContext();
    const disabled = !chartConfig?.plotData;
    return (
        <>
            <Tooltip2 content="Column" placement="top" interactionKind="hover">
                <Button
                    minimal
                    active={chartType === DBChartTypes.COLUMN}
                    icon="timeline-bar-chart"
                    onClick={() => setChartType(DBChartTypes.COLUMN)}
                    disabled={disabled}
                    name="Column"
                />
            </Tooltip2>
            <Tooltip2 content="Bar" placement="top" interactionKind="hover">
                <Button
                    minimal
                    active={chartType === DBChartTypes.BAR}
                    icon="horizontal-bar-chart"
                    onClick={() => setChartType(DBChartTypes.BAR)}
                    disabled={disabled}
                    name="Bar"
                />
            </Tooltip2>
            <Tooltip2 content="Line" placement="top" interactionKind="hover">
                <Button
                    minimal
                    active={chartType === DBChartTypes.LINE}
                    icon="timeline-line-chart"
                    onClick={() => setChartType(DBChartTypes.LINE)}
                    disabled={disabled}
                    name="Line"
                />
            </Tooltip2>
            <Tooltip2 content="Scatter" placement="top" interactionKind="hover">
                <Button
                    minimal
                    active={chartType === DBChartTypes.SCATTER}
                    icon="scatter-plot"
                    onClick={() => setChartType(DBChartTypes.SCATTER)}
                    disabled={disabled}
                    name="Scatter"
                />
            </Tooltip2>
            <Tooltip2 content="Table" placement="top" interactionKind="hover">
                <Button
                    minimal
                    active={chartType === DBChartTypes.TABLE}
                    icon="panel-table"
                    onClick={() => setChartType(DBChartTypes.TABLE)}
                    disabled={disabled}
                    name="Table"
                />
            </Tooltip2>
            <Tooltip2
                content="Big number"
                placement="top"
                interactionKind="hover"
            >
                <Button
                    minimal
                    active={chartType === DBChartTypes.BIG_NUMBER}
                    icon="numerical"
                    onClick={() => setChartType(DBChartTypes.BIG_NUMBER)}
                    disabled={disabled}
                    name="Big Number"
                />
            </Tooltip2>
        </>
    );
};

export default VisualizationCardOptions;
