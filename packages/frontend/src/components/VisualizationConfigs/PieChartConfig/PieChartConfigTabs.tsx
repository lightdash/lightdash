import { Tabs } from '@mantine/core';
import React, { memo } from 'react';
import PieChartDisplayConfig from './PieChartDisplayConfig';
import PieChartLayoutConfig from './PieChartLayoutConfig';
import PieChartSeriesConfig from './PieChartSeriesConfig';

const PieChartConfigTabs: React.FC = memo(() => {
    return (
        <Tabs defaultValue="layout" keepMounted={false}>
            <Tabs.List mb="sm">
                <Tabs.Tab value="layout">Layout</Tabs.Tab>
                <Tabs.Tab value="series">Series</Tabs.Tab>
                <Tabs.Tab value="display">Display</Tabs.Tab>
            </Tabs.List>

            <Tabs.Panel value="layout">
                <PieChartLayoutConfig />
            </Tabs.Panel>

            <Tabs.Panel value="series">
                <PieChartSeriesConfig />
            </Tabs.Panel>

            <Tabs.Panel value="display">
                <PieChartDisplayConfig />
            </Tabs.Panel>
        </Tabs>
    );
});

export default PieChartConfigTabs;
