import { MantineProvider, Tabs, useMantineColorScheme } from '@mantine/core';
import { memo, useMemo, type FC } from 'react';
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
            </Tabs>
        </MantineProvider>
    );
});
