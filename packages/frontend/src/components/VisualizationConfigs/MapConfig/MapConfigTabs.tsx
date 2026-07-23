import { Tabs } from '@mantine-8/core';
import { memo, type FC } from 'react';
import { Display } from './MapDisplayConfig';
import { Layout } from './MapLayoutConfig';

export const ConfigTabs: FC = memo(() => {
    return (
        <>
            <Tabs defaultValue="general" keepMounted={false}>
                <Tabs.List mb="sm">
                    <Tabs.Tab px="sm" value="general">
                        General
                    </Tabs.Tab>
                    <Tabs.Tab px="sm" value="display">
                        Map display
                    </Tabs.Tab>
                </Tabs.List>

                <Tabs.Panel value="general">
                    <Layout />
                </Tabs.Panel>

                <Tabs.Panel value="display">
                    <Display />
                </Tabs.Panel>
            </Tabs>
        </>
    );
});
