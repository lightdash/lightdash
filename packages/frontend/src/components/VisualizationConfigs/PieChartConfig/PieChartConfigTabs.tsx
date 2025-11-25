import { MantineProvider, Tabs, useMantineColorScheme } from '@mantine/core';
import { memo, useMemo, type FC } from 'react';
import { getVizConfigThemeOverride } from '../mantineTheme';
import { Display } from './PieChartDisplayConfig';
import { Layout } from './PieChartLayoutConfig';
import { Series } from './PieChartSeriesConfig';

export const ConfigTabs: FC = memo(() => {
    const { colorScheme } = useMantineColorScheme();
    const themeOverride = useMemo(
        () => getVizConfigThemeOverride(colorScheme),
        [colorScheme],
    );

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
                    <Tabs.Tab px="sm" value="display">
                        Display
                    </Tabs.Tab>
                </Tabs.List>

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
        </MantineProvider>
    );
});
