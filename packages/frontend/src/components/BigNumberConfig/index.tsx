import { Button, InputGroup } from '@blueprintjs/core';
import { Popover2 } from '@blueprintjs/popover2';
import { findFieldByIdInExplore, friendlyName, getFieldLabel } from 'common';
import React, { useState } from 'react';
import { useVisualizationContext } from '../LightdashVisualization/VisualizationProvider';
import { InputWrapper } from './BigNumberConfig.styles';

export const BigNumberConfigPanel: React.FC = () => {
    const { bigNumberLabel, setBigNumberLabel, resultsData, explore } =
        useVisualizationContext();
    const [isOpen, setIsOpen] = useState(false);

    const fieldId = resultsData?.metricQuery.metrics[0];
    const field =
        explore && fieldId
            ? findFieldByIdInExplore(explore, fieldId)
            : undefined;
    const label = field
        ? getFieldLabel(field)
        : fieldId && friendlyName(fieldId);

    return (
        <Popover2
            content={
                <InputWrapper label="Label">
                    <InputGroup
                        placeholder="Enter label"
                        defaultValue={bigNumberLabel || label}
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
