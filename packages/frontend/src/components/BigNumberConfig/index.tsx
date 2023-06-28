import { Button, Popover } from '@mantine/core';
import React from 'react';
import {
    COLLAPSABLE_CARD_BUTTON_PROPS,
    COLLAPSABLE_CARD_POPOVER_PROPS,
} from '../common/CollapsableCard';
import { useVisualizationContext } from '../LightdashVisualization/VisualizationProvider';
import BigNumberConfigTabs from './BigNumberConfigTabs';

const BigNumberConfigPanel: React.FC = () => {
    const {
        bigNumberConfig: { selectedField },
    } = useVisualizationContext();
    const disabled = !selectedField;

    return (
        <Popover
            {...COLLAPSABLE_CARD_POPOVER_PROPS}
            disabled={disabled}
            zIndex={15}
            closeOnClickOutside={false}
        >
            <Popover.Target>
                <Button {...COLLAPSABLE_CARD_BUTTON_PROPS} disabled={disabled}>
                    Configure
                </Button>
            </Popover.Target>

            <Popover.Dropdown>
                <BigNumberConfigTabs />
            </Popover.Dropdown>
        </Popover>
    );
};

export default BigNumberConfigPanel;
