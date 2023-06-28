import { Tab, Tabs } from '@blueprintjs/core';
import { Button, Popover } from '@mantine/core';
import React from 'react';
import {
    COLLAPSABLE_CARD_BUTTON_PROPS,
    COLLAPSABLE_CARD_POPOVER_PROPS,
} from '../common/CollapsableCard';
import { useVisualizationContext } from '../LightdashVisualization/VisualizationProvider';
import ConditionalFormattingList from './ConditionalFormattingList';
import GeneralSettings from './GeneralSettings';
import { ConfigWrapper } from './TableConfig.styles';

const TableConfigPanel: React.FC = () => {
    const { resultsData } = useVisualizationContext();
    const disabled = !resultsData;

    return (
        <Popover {...COLLAPSABLE_CARD_POPOVER_PROPS} disabled={disabled}>
            <Popover.Target>
                <Button {...COLLAPSABLE_CARD_BUTTON_PROPS} disabled={disabled}>
                    Configure
                </Button>
            </Popover.Target>

            <Popover.Dropdown>
                <ConfigWrapper>
                    <Tabs>
                        <Tab
                            id="general"
                            title="General"
                            panel={<GeneralSettings />}
                        />
                        <Tab
                            id="conditional-formatting"
                            title="Conditional formatting"
                            panel={<ConditionalFormattingList />}
                        />
                    </Tabs>
                </ConfigWrapper>
            </Popover.Dropdown>
        </Popover>
    );
};

export default TableConfigPanel;
