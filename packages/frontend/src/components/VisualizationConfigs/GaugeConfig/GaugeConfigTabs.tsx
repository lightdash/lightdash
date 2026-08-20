import { Tabs } from '@mantine/core';
import { memo, type FC } from 'react';
import ConfigTabsList from '../../common/ChartGallery/ConfigTabsList';
import { GaugeDisplayConfig } from './GaugeDisplayConfig';
import { GaugeFieldsConfig } from './GaugeFieldsConfig';

export const ConfigTabs: FC = memo(() => {
    return (
        <Tabs defaultValue="fields" keepMounted={false}>
            <ConfigTabsList mb="sm">
                <Tabs.Tab px="sm" value="fields">
                    Layout
                </Tabs.Tab>
                <Tabs.Tab px="sm" value="display">
                    Display
                </Tabs.Tab>
            </ConfigTabsList>

            <Tabs.Panel value="fields">
                <GaugeFieldsConfig />
            </Tabs.Panel>

            <Tabs.Panel value="display">
                <GaugeDisplayConfig />
            </Tabs.Panel>
        </Tabs>
    );
});
