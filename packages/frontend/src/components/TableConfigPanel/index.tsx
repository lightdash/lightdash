import { Button, Tab, Tabs } from '@blueprintjs/core';
import { Popover2 } from '@blueprintjs/popover2';
import React, { useState } from 'react';

import { useVisualizationContext } from '../LightdashVisualization/VisualizationProvider';
import ConditionalFormatting from './ConditionalFormatting';
import GeneralSettings from './GeneralSettings';
import { ConfigWrapper } from './TableConfig.styles';

export const TableConfigPanel: React.FC = () => {
    const [isOpen, setIsOpen] = useState(false);

    const { resultsData } = useVisualizationContext();
    const disabled = !resultsData;

    return (
        <Popover2
            disabled={disabled}
            content={
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
                            panel={<ConditionalFormatting />}
                        />
                    </Tabs>
                </ConfigWrapper>
            }
            interactionKind="click"
            isOpen={isOpen}
            onInteraction={setIsOpen}
            position="bottom"
        >
            <Button
                minimal
                rightIcon="caret-down"
                text="Configure"
                disabled={disabled}
            />
        </Popover2>
    );
};

export default TableConfigPanel;
