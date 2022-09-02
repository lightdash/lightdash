import { Button } from '@blueprintjs/core';
import { Popover2 } from '@blueprintjs/popover2';
import { ChartType } from '@lightdash/common';
import React from 'react';
import useEcharts from '../../hooks/echarts/useEcharts';
import { useVisualizationContext } from '../LightdashVisualization/VisualizationProvider';
import ChartConfigTabs from './ChartConfigTabs';

export const ChartConfigPanel: React.FC = () => {
    const { chartType } = useVisualizationContext();
    const eChartsOptions = useEcharts();
    const disabled =
        chartType === ChartType.TABLE ||
        (chartType === ChartType.CARTESIAN && !eChartsOptions);

    return (
        <Popover2
            content={<ChartConfigTabs />}
            interactionKind="click"
            position="bottom"
            disabled={disabled}
        >
            <Button
                minimal
                rightIcon="caret-down"
                text="Configure"
                disabled={disabled}
            />
        </Popover2>
    );
};

export default ChartConfigPanel;
