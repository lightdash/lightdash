import { Tabs } from '@mantine/core';
import React from 'react';
import ConditionalFormattingList from './ConditionalFormattingList';
import GeneralSettings from './GeneralSettings';
const TableConfigTabs: React.FC = () => {
    return (
        <Tabs w={320} defaultValue="general">
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
};

export default TableConfigTabs;
