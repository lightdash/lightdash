import { MantineProvider, Tabs } from '@mantine/core';
import { memo, type FC } from 'react';
import { themeOverride } from '../mantineTheme';
import { MapFieldsConfig } from './MapFieldsConfig';

export const ConfigTabs: FC = memo(() => {
    return (
        <MantineProvider inherit theme={themeOverride}>
            <Tabs defaultValue="fields" keepMounted={false}>
                <Tabs.List mb="sm">
                    <Tabs.Tab px="sm" value="fields">
                        Fields
                    </Tabs.Tab>
                </Tabs.List>

                <Tabs.Panel value="fields">
                    <MapFieldsConfig />
                </Tabs.Panel>
            </Tabs>
        </MantineProvider>
    );
});
