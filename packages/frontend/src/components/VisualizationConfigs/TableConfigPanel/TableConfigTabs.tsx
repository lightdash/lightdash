import { MantineProvider, Tabs } from '@mantine/core';
import { memo, type FC } from 'react';
import { themeOverride } from '../mantineTheme';
import ConditionalFormattingList from './ConditionalFormattingList';
import GeneralSettings from './GeneralSettings';

export const ConfigTabs: FC = memo(() => (
    <MantineProvider inherit theme={themeOverride}>
        <Tabs defaultValue="general" keepMounted={false}>
            <Tabs.List mb="sm">
                <Tabs.Tab px="sm" value="general">
                    General
                </Tabs.Tab>
                <Tabs.Tab px="sm" value="conditional-formatting">
                    Conditional formatting
                </Tabs.Tab>
            </Tabs.List>

            <Tabs.Panel value="general">
                <GeneralSettings />
            </Tabs.Panel>
            <Tabs.Panel value="conditional-formatting">
                <ConditionalFormattingList />
            </Tabs.Panel>
        </Tabs>
    </MantineProvider>
));
