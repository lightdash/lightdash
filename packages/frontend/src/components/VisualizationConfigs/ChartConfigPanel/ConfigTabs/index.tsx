import { MantineProvider, Tabs } from '@mantine/core';
import { memo, useMemo, type FC } from 'react';
import { useVisualizationContext } from '../../../LightdashVisualization/VisualizationProvider';
import { Axes } from '../Axes';
import { Grid } from '../Grid';
import { Layout } from '../Layout';
import { Legend } from '../Legend';
import { Series } from '../Series';
import { themeOverride } from './mantineTheme';

export const ConfigTabs: FC = memo(() => {
    const { itemsMap } = useVisualizationContext();

    const items = useMemo(() => Object.values(itemsMap || {}), [itemsMap]);

    return (
        <MantineProvider inherit theme={themeOverride}>
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
                    <Layout items={items} />
                </Tabs.Panel>
                <Tabs.Panel value="series">
                    <Series items={items} />
                </Tabs.Panel>
                <Tabs.Panel value="axes">
                    <Axes itemsMap={itemsMap} />
                </Tabs.Panel>
                <Tabs.Panel value="legend">
                    <Legend items={items} />
                </Tabs.Panel>
                <Tabs.Panel value="grid">
                    <Grid />
                </Tabs.Panel>
            </Tabs>
        </MantineProvider>
    );
});
