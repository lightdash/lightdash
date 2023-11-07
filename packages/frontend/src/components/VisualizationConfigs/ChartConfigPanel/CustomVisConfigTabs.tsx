import { Button, JsonInput, Stack, Tabs, Text } from '@mantine/core';
import React, { memo, useState } from 'react';
import { useCustomVisualizationContext } from '../../CustomVisualization';

const CustomVisConfigTabs: React.FC = memo(() => {
    const { echartsConfig, setChartConfig } = useCustomVisualizationContext();

    const [draftConfig, setDraftConfig] = useState<string>(
        JSON.stringify(echartsConfig, null, 2),
    );

    const updateChart = () => {
        setChartConfig(JSON.parse(draftConfig));
    };

    return (
        <Tabs defaultValue="config" keepMounted={false}>
            <Tabs.List mb="sm">
                <Tabs.Tab value="config">Configuration</Tabs.Tab>
                <Tabs.Tab value="data">Data</Tabs.Tab>
            </Tabs.List>

            <Tabs.Panel value="config">
                <Stack>
                    <JsonInput
                        label="Chart config"
                        validationError="Invalid JSON"
                        value={draftConfig}
                        onChange={(config) => setDraftConfig(config)}
                        formatOnBlur
                        autosize
                        minRows={20}
                    />
                    <Button onClick={updateChart}>Make a chart</Button>
                </Stack>
            </Tabs.Panel>
            <Tabs.Panel value="data">
                <Text>Transform data</Text>
            </Tabs.Panel>
        </Tabs>
    );
});

export default CustomVisConfigTabs;
