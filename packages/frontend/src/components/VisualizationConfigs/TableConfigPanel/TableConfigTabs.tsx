import { Tabs } from '@mantine/core';
import React, { memo } from 'react';
import ConditionalFormattingList from './ConditionalFormattingList';
import GeneralSettings from './GeneralSettings';
const TableConfigTabs: React.FC = memo(() => {
    return (
        <Tabs defaultValue="general" keepMounted={false}>
            <Tabs.List mb="sm">
                <Tabs.Tab value="general">General</Tabs.Tab>
                <Tabs.Tab value="conditional-formatting">
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
    );
});

export default TableConfigTabs;
