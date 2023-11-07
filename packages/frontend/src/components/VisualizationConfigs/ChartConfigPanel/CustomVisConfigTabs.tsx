import { Tabs, Text, TextInput } from '@mantine/core';
import React, { memo } from 'react';
const CustomVisConfigTabs: React.FC = memo(() => {
    return (
        <Tabs defaultValue="config" keepMounted={false}>
            <Tabs.List mb="sm">
                <Tabs.Tab value="config">Configuration</Tabs.Tab>
                <Tabs.Tab value="data">Data</Tabs.Tab>
            </Tabs.List>

            <Tabs.Panel value="config">
                <TextInput />
            </Tabs.Panel>
            <Tabs.Panel value="data">
                <Text>Transform data</Text>
            </Tabs.Panel>
        </Tabs>
    );
});

export default CustomVisConfigTabs;
