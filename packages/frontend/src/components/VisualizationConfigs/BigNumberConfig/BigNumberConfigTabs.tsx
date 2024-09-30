import { MantineProvider, Tabs } from '@mantine/core';
import { memo } from 'react';
import { themeOverride } from '../mantineTheme';
import { Comparison } from './BigNumberComparison';
import { Layout } from './BigNumberLayout';

export const ConfigTabs = memo(() => {
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
