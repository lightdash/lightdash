import { MantineProvider, Tabs, useMantineColorScheme } from '@mantine/core';
import { memo, useMemo, type FC } from 'react';
import { useDrillFeatureFlag } from '../../../hooks/useDrillFeatureFlag';
import DrillConfigPanel from '../DrillConfigPanel/DrillConfigPanel';
import { getVizConfigThemeOverride } from '../mantineTheme';
import { Display } from './MapDisplayConfig';
import { Layout } from './MapLayoutConfig';

export const ConfigTabs: FC = memo(() => {
    const { colorScheme } = useMantineColorScheme();
    const themeOverride = useMemo(
        () => getVizConfigThemeOverride(colorScheme),
        [colorScheme],
    );
    const drillEnabled = useDrillFeatureFlag();

    return (
        <MantineProvider inherit theme={themeOverride}>
            <Tabs defaultValue="general" keepMounted={false}>
                <Tabs.List mb="sm">
                    <Tabs.Tab px="sm" value="general">
                        General
                    </Tabs.Tab>
                    <Tabs.Tab px="sm" value="display">
                        Map display
                    </Tabs.Tab>
                    {drillEnabled && (
                        <Tabs.Tab px="sm" value="drill">
                            Drill
                        </Tabs.Tab>
                    )}
                </Tabs.List>

                <Tabs.Panel value="general">
                    <Layout />
                </Tabs.Panel>

                <Tabs.Panel value="display">
                    <Display />
                </Tabs.Panel>

                {drillEnabled && (
                    <Tabs.Panel value="drill">
                        <DrillConfigPanel allowedTypes={['drillThrough']} />
                    </Tabs.Panel>
                )}
            </Tabs>
        </MantineProvider>
    );
});
