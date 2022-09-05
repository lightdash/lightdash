import { Button } from '@blueprintjs/core';
import { Popover2 } from '@blueprintjs/popover2';
import React from 'react';
import useEcharts from '../../hooks/echarts/useEcharts';
import ChartConfigTabs from './ChartConfigTabs';

export const ChartConfigPanel: React.FC = () => {
    const eChartsOptions = useEcharts();
    const disabled = !eChartsOptions;

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
