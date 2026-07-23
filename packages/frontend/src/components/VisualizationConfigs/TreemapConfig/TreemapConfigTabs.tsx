import { Tabs } from '@mantine-8/core';
import { memo, type FC } from 'react';
import { Display } from './TreemapDisplayConfig';
import { Layout } from './TreemapLayoutConfig';

export const ConfigTabs: FC = memo(() => {
    return (
        <>
            <Tabs defaultValue="layout" keepMounted={false}>
                <Tabs.List mb="sm">
                    <Tabs.Tab px="sm" value="layout">
                        Layout
                    </Tabs.Tab>
                    <Tabs.Tab px="sm" value="display">
                        Display
                    </Tabs.Tab>
                </Tabs.List>

                <Tabs.Panel value="layout">
                    <Layout />
                </Tabs.Panel>

                <Tabs.Panel value="display">
                    <Display />
                </Tabs.Panel>
            </Tabs>
        </>
    );
});
