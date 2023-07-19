import { Button, Popover, Tabs } from '@mantine/core';
import { IconChevronDown } from '@tabler/icons-react';
import React from 'react';
import {
    COLLAPSABLE_CARD_BUTTON_PROPS,
    COLLAPSABLE_CARD_POPOVER_PROPS,
} from '../../common/CollapsableCard';
import MantineIcon from '../../common/MantineIcon';
import { useVisualizationContext } from '../../LightdashVisualization/VisualizationProvider';
import ConditionalFormattingList from './ConditionalFormattingList';
import GeneralSettings from './GeneralSettings';

const TableConfigPanel: React.FC = () => {
    const { resultsData } = useVisualizationContext();
    const disabled = !resultsData;

    return (
        <Popover {...COLLAPSABLE_CARD_POPOVER_PROPS} disabled={disabled}>
            <Popover.Target>
                <Button
                    {...COLLAPSABLE_CARD_BUTTON_PROPS}
                    disabled={disabled}
                    rightIcon={
                        <MantineIcon icon={IconChevronDown} color="gray" />
                    }
                >
                    Configure
                </Button>
            </Popover.Target>

            <Popover.Dropdown>
                <Tabs w={320} defaultValue="general">
                    <Tabs.List mb="sm">
                        <Tabs.Tab value="general">General</Tabs.Tab>
                        <Tabs.Tab value="conditional-formatting">
                            Conditional formatting
                        </Tabs.Tab>
                    </Tabs.List>

                    <Tabs.Panel value="general">
                        <GeneralSettings />
                    </Tabs.Panel>
                    <Tabs.Panel value="conditional-formatting">
                        <ConditionalFormattingList />
                    </Tabs.Panel>
                </Tabs>
            </Popover.Dropdown>
        </Popover>
    );
};

export default TableConfigPanel;
