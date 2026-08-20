import { Tabs } from '@mantine/core';
import { memo, type FC } from 'react';
import ConfigTabsList from '../../common/ChartGallery/ConfigTabsList';
import { Display } from './PieChartDisplayConfig';
import { Layout } from './PieChartLayoutConfig';
import { Series } from './PieChartSeriesConfig';

export const ConfigTabs: FC = memo(() => {
    return (
        <Tabs defaultValue="layout" keepMounted={false}>
            <ConfigTabsList mb="sm">
                <Tabs.Tab px="sm" value="layout">
                    Layout
                </Tabs.Tab>
                <Tabs.Tab px="sm" value="series">
                    Series
                </Tabs.Tab>
                <Tabs.Tab px="sm" value="display">
                    Display
                </Tabs.Tab>
            </ConfigTabsList>

            <Tabs.Panel value="layout">
                <Layout />
            </Tabs.Panel>

            <Tabs.Panel value="series">
                <Series />
            </Tabs.Panel>

            <Tabs.Panel value="display">
                <Display />
            </Tabs.Panel>
        </Tabs>
    );
});
