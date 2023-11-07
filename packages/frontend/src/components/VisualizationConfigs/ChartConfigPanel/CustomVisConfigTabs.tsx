import { JsonInput, Tabs, Text } from '@mantine/core';

import React, { memo } from 'react';
const CustomVisConfigTabs: React.FC = memo(() => {
    return (
        <Tabs defaultValue="config" keepMounted={false}>
            <Tabs.List mb="sm">
                <Tabs.Tab value="config">Configuration</Tabs.Tab>
                <Tabs.Tab value="data">Data</Tabs.Tab>
            </Tabs.List>

            <Tabs.Panel value="config">
                <JsonInput
                    label="Chart config"
                    validationError="Invalid JSON"
                    formatOnBlur
                    autosize
                    minRows={20}
                />
            </Tabs.Panel>
            <Tabs.Panel value="data">
                <Text>Transform data</Text>
            </Tabs.Panel>
        </Tabs>
    );
});

export default CustomVisConfigTabs;
