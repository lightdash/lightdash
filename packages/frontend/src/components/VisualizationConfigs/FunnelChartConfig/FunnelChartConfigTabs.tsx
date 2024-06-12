import { MantineProvider, Tabs } from '@mantine/core';
import { memo, type FC } from 'react';
import { themeOverride } from '../mantineTheme';

export const ConfigTabs: FC = memo(() => {
    return (
        <MantineProvider inherit theme={themeOverride}>
            <Tabs defaultValue="layout" keepMounted={false}>
                <Tabs.List mb="sm">
                    <Tabs.Tab px="sm" value="layout">
                        General
                    </Tabs.Tab>
                </Tabs.List>

                <Tabs.Panel value="layout">
                    <div>Fun fun fun</div>
                </Tabs.Panel>
            </Tabs>
        </MantineProvider>
    );
});
