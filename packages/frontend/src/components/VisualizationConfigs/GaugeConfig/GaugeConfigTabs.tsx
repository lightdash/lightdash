import { Tabs } from '@mantine-8/core';
import { memo, type FC } from 'react';
import { GaugeDisplayConfig } from './GaugeDisplayConfig';
import { GaugeFieldsConfig } from './GaugeFieldsConfig';

export const ConfigTabs: FC = memo(() => {
    return (
        <>
            <Tabs defaultValue="fields" keepMounted={false}>
                <Tabs.List mb="sm">
                    <Tabs.Tab px="sm" value="fields">
                        Layout
                    </Tabs.Tab>
                    <Tabs.Tab px="sm" value="display">
                        Display
                    </Tabs.Tab>
                </Tabs.List>

                <Tabs.Panel value="fields">
                    <GaugeFieldsConfig />
                </Tabs.Panel>

                <Tabs.Panel value="display">
                    <GaugeDisplayConfig />
                </Tabs.Panel>
            </Tabs>
        </>
    );
});
