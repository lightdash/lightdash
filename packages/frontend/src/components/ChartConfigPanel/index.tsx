import { Button, Popover } from '@mantine/core';
import React from 'react';
import useEcharts from '../../hooks/echarts/useEcharts';
import {
    COLLAPSABLE_CARD_BUTTON_PROPS,
    COLLAPSABLE_CARD_POPOVER_PROPS,
} from '../common/CollapsableCard';
import ChartConfigTabs from './ChartConfigTabs';

const ChartConfigPanel: React.FC = () => {
    const eChartsOptions = useEcharts();
    const disabled = !eChartsOptions;

    return (
        <Popover
            {...COLLAPSABLE_CARD_POPOVER_PROPS}
            disabled={disabled}
            // TODO: remove once blueprint migration is complete
            zIndex={15}
        >
            <Popover.Target>
                <Button {...COLLAPSABLE_CARD_BUTTON_PROPS} disabled={disabled}>
                    Configure
                </Button>
            </Popover.Target>

            <Popover.Dropdown>
                <ChartConfigTabs />
            </Popover.Dropdown>
        </Popover>
    );
};

export default ChartConfigPanel;
