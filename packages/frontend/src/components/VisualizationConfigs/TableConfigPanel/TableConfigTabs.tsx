import { Tabs } from '@mantine/core';
import { memo, type FC } from 'react';
import ConfigTabsList from '../../common/ChartGallery/ConfigTabsList';
import { ColumnCellDisplay } from './ColumnCellDisplay';
import ConditionalFormattingList from './ConditionalFormattingList';
import GeneralSettings from './GeneralSettings';

export const ConfigTabs: FC = memo(() => {
    return (
        <Tabs defaultValue="general" keepMounted={false}>
            <ConfigTabsList mb="sm">
                <Tabs.Tab px="sm" value="general">
                    General
                </Tabs.Tab>
                <Tabs.Tab px="sm" value="conditional-formatting">
                    Conditional formatting
                </Tabs.Tab>
                <Tabs.Tab px="sm" value="cell-display">
                    Cell display
                </Tabs.Tab>
            </ConfigTabsList>

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
    );
});
