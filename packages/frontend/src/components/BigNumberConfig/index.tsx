import { Button, HTMLSelect, InputGroup } from '@blueprintjs/core';
import { Popover2 } from '@blueprintjs/popover2';
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
            bigNumber,
        },
    } = useVisualizationContext();
    const [isOpen, setIsOpen] = useState(false);

    const isANumber = !Number.isNaN(parseFloat(bigNumber));

    const styleOptions = [
        { value: 'none', label: 'none' },
        { value: 'k', label: 'thousands (K)' },
        { value: 'm', label: 'millions (M)' },
        { value: 'b', label: 'billions (B)' },
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
                    {isANumber && (
                        <>
                            <InputWrapper label="Style">
                                <HTMLSelect
                                    fill
                                    options={styleOptions}
                                    value={bigNumberStyle}
                                    onChange={(e) => {
                                        setBigNumberStyle(e.target.value);
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
