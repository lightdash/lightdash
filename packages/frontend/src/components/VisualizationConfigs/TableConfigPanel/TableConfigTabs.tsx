import { MantineProvider, Tabs, useMantineColorScheme } from '@mantine/core';
import { memo, useMemo, type FC } from 'react';
import { useDrillFeatureFlag } from '../../../hooks/useDrillFeatureFlag';
import DrillConfigPanel from '../DrillConfigPanel/DrillConfigPanel';
import { getVizConfigThemeOverride } from '../mantineTheme';
import { ColumnCellDisplay } from './ColumnCellDisplay';
import ConditionalFormattingList from './ConditionalFormattingList';
import GeneralSettings from './GeneralSettings';

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
                    <Tabs.Tab px="sm" value="conditional-formatting">
                        Conditional formatting
                    </Tabs.Tab>
                    <Tabs.Tab px="sm" value="cell-display">
                        Cell display
                    </Tabs.Tab>
                    {drillEnabled && (
                        <Tabs.Tab px="sm" value="drill">
                            Drill
                        </Tabs.Tab>
                    )}
                </Tabs.List>

                <Tabs.Panel value="general">
                    <GeneralSettings />
                </Tabs.Panel>
                <Tabs.Panel value="conditional-formatting">
                    <ConditionalFormattingList />
                </Tabs.Panel>
                <Tabs.Panel value="cell-display">
                    <ColumnCellDisplay />
                </Tabs.Panel>
                {drillEnabled && (
                    <Tabs.Panel value="drill">
                        <DrillConfigPanel />
                    </Tabs.Panel>
                )}
            </Tabs>
        </MantineProvider>
    );
});
