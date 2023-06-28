import { Popover2 } from '@blueprintjs/popover2';
import { Button } from '@mantine/core';
import React from 'react';
import useEcharts from '../../hooks/echarts/useEcharts';
import { COLLAPSABLE_CARD_BUTTON_PROPS } from '../common/CollapsableCard';
import ChartConfigTabs from './ChartConfigTabs';

const ChartConfigPanel: React.FC = () => {
    const eChartsOptions = useEcharts();
    const disabled = !eChartsOptions;

    return (
        <Popover2
            disabled={disabled}
            position="bottom"
            content={<ChartConfigTabs />}
        >
            <Button {...COLLAPSABLE_CARD_BUTTON_PROPS} disabled={disabled}>
                Configure
            </Button>
        </Popover2>
    );
};

export default ChartConfigPanel;
