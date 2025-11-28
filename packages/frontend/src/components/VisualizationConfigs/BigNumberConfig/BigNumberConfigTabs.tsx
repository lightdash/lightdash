import { MantineProvider, Tabs, useMantineColorScheme } from '@mantine/core';
import { type FC, memo, useMemo } from 'react';
import { getVizConfigThemeOverride } from '../mantineTheme';
import { Comparison } from './BigNumberComparison';
import { Layout } from './BigNumberLayout';

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
                    <Tabs.Tab px="sm" value="comparison">
                        Comparison
                    </Tabs.Tab>
                </Tabs.List>

                <Tabs.Panel value="layout">
                    <Layout />
                </Tabs.Panel>
                <Tabs.Panel value="comparison">
                    <Comparison />
                </Tabs.Panel>
            </Tabs>
        </MantineProvider>
    );
});
