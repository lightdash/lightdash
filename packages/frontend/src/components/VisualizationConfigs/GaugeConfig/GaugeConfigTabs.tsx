import { MantineProvider, Tabs, useMantineColorScheme } from '@mantine/core';
import { memo, useMemo, type FC } from 'react';
import { useDrillFeatureFlag } from '../../../hooks/useDrillFeatureFlag';
import DrillConfigPanel from '../DrillConfigPanel/DrillConfigPanel';
import { getVizConfigThemeOverride } from '../mantineTheme';
import { GaugeDisplayConfig } from './GaugeDisplayConfig';
import { GaugeFieldsConfig } from './GaugeFieldsConfig';

export const ConfigTabs: FC = memo(() => {
    const { colorScheme } = useMantineColorScheme();
    const themeOverride = useMemo(
        () => getVizConfigThemeOverride(colorScheme),
        [colorScheme],
    );

    const drillEnabled = useDrillFeatureFlag();

    return (
        <MantineProvider inherit theme={themeOverride}>
            <Tabs defaultValue="fields" keepMounted={false}>
                <Tabs.List mb="sm">
                    <Tabs.Tab px="sm" value="fields">
                        Layout
                    </Tabs.Tab>
                    <Tabs.Tab px="sm" value="display">
                        Display
                    </Tabs.Tab>
                    {drillEnabled && (
                        <Tabs.Tab px="sm" value="drill">
                            Drill
                        </Tabs.Tab>
                    )}
                </Tabs.List>

                <Tabs.Panel value="fields">
                    <GaugeFieldsConfig />
                </Tabs.Panel>

                <Tabs.Panel value="display">
                    <GaugeDisplayConfig />
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
