import { Button } from '@blueprintjs/core';
import { Popover2 } from '@blueprintjs/popover2';
import React, { useState } from 'react';
import { useVisualizationContext } from '../LightdashVisualization/VisualizationProvider';
import BigNumberConfigTabs from './BigNumberConfigTabs';

const BigNumberConfigPanel: React.FC = () => {
    const {
        bigNumberConfig: { selectedField },
    } = useVisualizationContext();
    const [isOpen, setIsOpen] = useState(false);
    const disabled = !selectedField;

    return (
        <Popover2
            disabled={disabled}
            content={<BigNumberConfigTabs />}
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

export default BigNumberConfigPanel;
