import { Button, HTMLSelect, InputGroup } from '@blueprintjs/core';
import { Popover2 } from '@blueprintjs/popover2';
import { getItemId, NumberStyle } from '@lightdash/common';
import React, { useState } from 'react';
import FieldAutoComplete from '../common/Filters/FieldAutoComplete';
import { useVisualizationContext } from '../LightdashVisualization/VisualizationProvider';
import { InputWrapper } from './BigNumberConfig.styles';

export const BigNumberConfigPanel: React.FC = () => {
    const {
        bigNumberConfig: {
            bigNumberLabel,
            defaultLabel,
            setBigNumberLabel,
            bigNumberStyle,
            setBigNumberStyle,
            showStyle,
            availableFields,
            selectedField,
            setSelectedField,
            getField,
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
                    <InputWrapper label="Select field">
                        <FieldAutoComplete
                            fields={availableFields}
                            activeField={
                                selectedField
                                    ? getField(selectedField)
                                    : undefined
                            }
                            onChange={(item) => {
                                setSelectedField(getItemId(item));
                            }}
                        />
                    </InputWrapper>
                    <InputWrapper label="Label">
                        <InputGroup
                            placeholder={defaultLabel}
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
        >
            <Button minimal rightIcon="caret-down" text="Configure" />
        </Popover2>
    );
};

export default BigNumberConfigPanel;
