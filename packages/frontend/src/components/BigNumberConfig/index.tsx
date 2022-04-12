import { Button, InputGroup } from '@blueprintjs/core';
import { Popover2 } from '@blueprintjs/popover2';
import React, { useState } from 'react';
import { useVisualizationContext } from '../LightdashVisualization/VisualizationProvider';
import { InputWrapper } from './BigNumberConfig.styles';

export const BigNumberConfigPanel: React.FC = () => {
    const { bigNumberLabel, setBigNumberLabel } = useVisualizationContext();
    const [isOpen, setIsOpen] = useState(false);

    return (
        <Popover2
            content={
                <InputWrapper label="Label">
                    <InputGroup
                        placeholder="Enter label"
                        defaultValue={bigNumberLabel}
                        onBlur={(e) => setBigNumberLabel(e.currentTarget.value)}
                    />
                </InputWrapper>
            }
            interactionKind="click"
            isOpen={isOpen}
            onInteraction={setIsOpen}
            position="bottom"
            lazy={false}
        >
            <Button minimal rightIcon="caret-down" text="Configure" />
        </Popover2>
    );
};

export default BigNumberConfigPanel;
