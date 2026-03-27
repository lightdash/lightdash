import { DrillPathType } from '@lightdash/common';
import { MantineProvider, Tabs, useMantineColorScheme } from '@mantine/core';
import { memo, useMemo, type FC } from 'react';
import { useDrillFeatureFlag } from '../../../hooks/useDrillFeatureFlag';
import DrillConfigPanel from '../DrillConfigPanel/DrillConfigPanel';
import { getVizConfigThemeOverride } from '../mantineTheme';
import { Comparison } from './BigNumberComparison';
import { BigNumberConditionalFormatting } from './BigNumberConditionalFormatting';
import { Layout } from './BigNumberLayout';

export const ConfigTabs: FC = memo(() => {
    const { colorScheme } = useMantineColorScheme();
    const themeOverride = useMemo(
        () => getVizConfigThemeOverride(colorScheme),
        [colorScheme],
    );

    const drillEnabled = useDrillFeatureFlag();

    return (
        <MantineProvider inherit theme={themeOverride}>
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
                    {drillEnabled && (
                        <Tabs.Tab px="sm" value="drill">
                            Drill
                        </Tabs.Tab>
                    )}
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
                {drillEnabled && (
                    <Tabs.Panel value="drill">
                        <DrillConfigPanel
                            allowedTypes={[DrillPathType.DRILL_THROUGH]}
                        />
                    </Tabs.Panel>
                )}
            </Tabs>
        </MantineProvider>
    );
});
