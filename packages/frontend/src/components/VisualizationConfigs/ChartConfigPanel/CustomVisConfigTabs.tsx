import { json } from '@codemirror/lang-json';
import { Tabs, Text } from '@mantine/core';
import CodeMirror from '@uiw/react-codemirror';
import React, { memo } from 'react';
import { useCustomVisualizationContext } from '../../CustomVisualization';

const CustomVisConfigTabs: React.FC = memo(() => {
    const { chartConfig, setChartConfig } = useCustomVisualizationContext();

    return (
        <Tabs defaultValue="config" keepMounted={false}>
            <Tabs.List mb="sm">
                <Tabs.Tab value="config">Configuration</Tabs.Tab>
                <Tabs.Tab value="data">Data</Tabs.Tab>
            </Tabs.List>

            <Tabs.Panel value="config">
                <CodeMirror
                    value={chartConfig}
                    extensions={[json()]}
                    onChange={(config) => setChartConfig(config)}
                />
            </Tabs.Panel>

            <Tabs.Panel value="data">
                <Text>Transform data</Text>
            </Tabs.Panel>
        </Tabs>
    );
});

export default CustomVisConfigTabs;
