import { Button, Popover, Tabs } from '@mantine/core';
import { IconChevronDown } from '@tabler/icons-react';
import React from 'react';
import {
    COLLAPSABLE_CARD_BUTTON_PROPS,
    COLLAPSABLE_CARD_POPOVER_PROPS,
} from '../../common/CollapsableCard';
import MantineIcon from '../../common/MantineIcon';
import { useVisualizationContext } from '../../LightdashVisualization/VisualizationProvider';
import PieChartDisplayConfig from './PieChartDisplayConfig';
import PieLayoutConfig from './PieChartLayoutConfig';
import PieChartSeriesConfig from './PieChartSeriesConfig';

const PieChartConfig: React.FC = () => {
    const { resultsData } = useVisualizationContext();
    const disabled = !resultsData;

    return (
        <Popover {...COLLAPSABLE_CARD_POPOVER_PROPS} disabled={disabled}>
            <Popover.Target>
                <Button
                    {...COLLAPSABLE_CARD_BUTTON_PROPS}
                    disabled={disabled}
                    rightIcon={
                        <MantineIcon icon={IconChevronDown} color="gray" />
                    }
                >
                    Configure
                </Button>
            </Popover.Target>

            <Popover.Dropdown>
                <Tabs w={320} defaultValue="layout">
                    <Tabs.List mb="sm">
                        <Tabs.Tab value="layout">Layout</Tabs.Tab>
                        <Tabs.Tab value="series">Series</Tabs.Tab>
                        <Tabs.Tab value="display">Display</Tabs.Tab>
                    </Tabs.List>

                    <Tabs.Panel value="layout">
                        <PieLayoutConfig />
                    </Tabs.Panel>

                    <Tabs.Panel value="series">
                        <PieChartSeriesConfig />
                    </Tabs.Panel>

                    <Tabs.Panel value="display">
                        <PieChartDisplayConfig />
                    </Tabs.Panel>
                </Tabs>
            </Popover.Dropdown>
        </Popover>
    );
};

export default PieChartConfig;
