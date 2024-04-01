import { MantineProvider, Tabs } from '@mantine/core';
import React, { memo } from 'react';
import { themeOverride } from '../../theme';
import { ConditionalFormatting } from '../ConditionalFormatting';
import { General } from '../General';

export const ConfigTabs: React.FC = memo(() => {
    return (
        <MantineProvider inherit theme={themeOverride}>
            <Tabs defaultValue="general" keepMounted={false}>
                <Tabs.List mb="sm">
                    <Tabs.Tab value="general">General</Tabs.Tab>
                    <Tabs.Tab value="conditional-formatting">
                        Conditional formatting
                    </Tabs.Tab>
                </Tabs.List>

                <Tabs.Panel value="general">
                    <General />
                </Tabs.Panel>
                <Tabs.Panel value="conditional-formatting">
                    <ConditionalFormatting />
                </Tabs.Panel>
            </Tabs>
        </MantineProvider>
    );
});
