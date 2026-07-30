import { type VizColumn } from '@lightdash/common';
import { Tabs } from '@mantine-8/core';
import { BigNumberComparisonConfig } from './BigNumberComparisonConfig';
import { BigNumberDataConfig } from './BigNumberDataConfig';
import { BigNumberDisplayConfig } from './BigNumberDisplayConfig';

export const BigNumberConfiguration = ({
    columns,
}: {
    columns: VizColumn[];
}) => (
    <Tabs defaultValue="data" keepMounted={false}>
        <Tabs.List mb="md">
            <Tabs.Tab value="data">Data</Tabs.Tab>
            <Tabs.Tab value="display">Display</Tabs.Tab>
            <Tabs.Tab value="comparison">Comparison</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="data">
            <BigNumberDataConfig columns={columns} />
        </Tabs.Panel>

        <Tabs.Panel value="display">
            <BigNumberDisplayConfig />
        </Tabs.Panel>

        <Tabs.Panel value="comparison">
            <BigNumberComparisonConfig columns={columns} />
        </Tabs.Panel>
    </Tabs>
);
