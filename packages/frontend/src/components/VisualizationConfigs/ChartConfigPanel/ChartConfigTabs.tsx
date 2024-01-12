import { Tabs } from '@mantine/core';
import { FC, memo, useMemo } from 'react';
import { useVisualizationContext } from '../../LightdashVisualization/VisualizationProvider';
import AxesOptions from './AxesOptions';
import FieldLayoutOptions from './FieldLayoutOptions';
import GridPanel from './Grid';
import LegendPanel from './Legend';
import SeriesTab from './Series';

const ChartConfigTabs: FC = memo(() => {
    const { itemsMap } = useVisualizationContext();

    const items = useMemo(() => Object.values(itemsMap || {}), [itemsMap]);

    return (
        <Tabs defaultValue="layout" keepMounted={false}>
            <Tabs.List mb="sm">
                <Tabs.Tab px="sm" value="layout">
                    Layout
                </Tabs.Tab>
                <Tabs.Tab px="sm" value="series">
                    Series
                </Tabs.Tab>
                <Tabs.Tab px="sm" value="axes">
                    Axes
                </Tabs.Tab>
                <Tabs.Tab px="sm" value="legend">
                    Display
                </Tabs.Tab>
                <Tabs.Tab px="sm" value="grid">
                    Margins
                </Tabs.Tab>
            </Tabs.List>
            <Tabs.Panel value="layout">
                <FieldLayoutOptions items={items} />
            </Tabs.Panel>
            <Tabs.Panel value="series">
                <SeriesTab items={items} />
            </Tabs.Panel>
            <Tabs.Panel value="axes">
                <AxesOptions itemsMap={itemsMap} />
            </Tabs.Panel>
            <Tabs.Panel value="legend">
                <LegendPanel items={items} />
            </Tabs.Panel>
            <Tabs.Panel value="grid">
                <GridPanel />
            </Tabs.Panel>
        </Tabs>
    );
});

export default ChartConfigTabs;
