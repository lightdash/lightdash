import { MantineProvider, Tabs, useMantineColorScheme } from '@mantine/core';
import { memo, useMemo, type FC } from 'react';
import { getVizConfigThemeOverride } from '../mantineTheme';
import { SankeyDisplayConfig } from './SankeyDisplayConfig';
import { SankeyFieldsConfig } from './SankeyFieldsConfig';

export const ConfigTabs: FC = memo(() => {
    const { colorScheme } = useMantineColorScheme();
    const themeOverride = useMemo(
        () => getVizConfigThemeOverride(colorScheme),
        [colorScheme],
    );

    return (
        <MantineProvider inherit theme={themeOverride}>
            <Tabs defaultValue="fields" keepMounted={false}>
                <Tabs.List mb="sm">
                    <Tabs.Tab px="sm" value="fields">
                        Fields
                    </Tabs.Tab>
                    <Tabs.Tab px="sm" value="display">
                        Display
                    </Tabs.Tab>
                </Tabs.List>

                <Tabs.Panel value="fields">
                    <SankeyFieldsConfig />
                </Tabs.Panel>

                <Tabs.Panel value="display">
                    <SankeyDisplayConfig />
                </Tabs.Panel>
            </Tabs>
        </MantineProvider>
    );
});
