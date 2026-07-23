import { Tabs } from '@mantine-8/core';
import { memo, type FC } from 'react';
import { Comparison } from './BigNumberComparison';
import { BigNumberConditionalFormatting } from './BigNumberConditionalFormatting';
import { Layout } from './BigNumberLayout';

export const ConfigTabs: FC = memo(() => {
    return (
        <>
            <Tabs defaultValue="layout" keepMounted={false}>
                <Tabs.List mb="sm">
                    <Tabs.Tab px="sm" value="layout">
                        Layout
                    </Tabs.Tab>
                    <Tabs.Tab px="sm" value="comparison">
                        Comparison
                    </Tabs.Tab>
                    <Tabs.Tab px="sm" value="conditionalFormatting">
                        Conditional formatting
                    </Tabs.Tab>
                </Tabs.List>

                <Tabs.Panel value="layout">
                    <Layout />
                </Tabs.Panel>
                <Tabs.Panel value="comparison">
                    <Comparison />
                </Tabs.Panel>
                <Tabs.Panel value="conditionalFormatting">
                    <BigNumberConditionalFormatting />
                </Tabs.Panel>
            </Tabs>
        </>
    );
});
