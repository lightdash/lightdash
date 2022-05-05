import { Button, HTMLSelect, InputGroup } from '@blueprintjs/core';
import { Popover2 } from '@blueprintjs/popover2';
import { NumberStyle } from 'common';
import React, { useState } from 'react';
import { useVisualizationContext } from '../LightdashVisualization/VisualizationProvider';
import { InputWrapper } from './BigNumberConfig.styles';

export const BigNumberConfigPanel: React.FC = () => {
    const {
        bigNumberConfig: {
            bigNumberLabel,
            setBigNumberLabel,
            bigNumberStyle,
            setBigNumberStyle,
            showStyle,
        },
    } = useVisualizationContext();
    const [isOpen, setIsOpen] = useState(false);

    const styleOptions = [
        { value: '', label: 'none' },
        { value: NumberStyle.THOUSANDS, label: 'thousands (K)' },
        { value: NumberStyle.MILLIONS, label: 'millions (M)' },
        { value: NumberStyle.BILLIONS, label: 'billions (B)' },
    ];
    return (
        <Popover2
            content={
                <>
                    <InputWrapper label="Label">
                        <InputGroup
                            placeholder="Enter label"
                            defaultValue={bigNumberLabel}
                            onBlur={(e) =>
                                setBigNumberLabel(e.currentTarget.value)
                            }
                        />
                    </InputWrapper>
                    {showStyle && (
                        <>
                            <InputWrapper label="Style">
                                <HTMLSelect
                                    fill
                                    options={styleOptions}
                                    value={bigNumberStyle}
                                    onChange={(e) => {
                                        if (e.target.value === '')
                                            setBigNumberStyle(undefined);
                                        else
                                            setBigNumberStyle(
                                                e.target.value as NumberStyle,
                                            );
                                    }}
                                />
                            </InputWrapper>
                        </>
                    )}
                </>
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
