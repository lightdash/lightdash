import { Button, FormGroup, HTMLSelect, InputGroup } from '@blueprintjs/core';
import { Popover2 } from '@blueprintjs/popover2';
import {
    CompactConfigMap,
    CompactOrAlias,
    CompiledDimension,
    getItemId,
    Metric,
    TableCalculation,
} from '@lightdash/common';
import React, { useState } from 'react';
import FieldAutoComplete from '../common/Filters/FieldAutoComplete';
import { useVisualizationContext } from '../LightdashVisualization/VisualizationProvider';
import { InputWrapper } from './BigNumberConfig.styles';

const StyleOptions = [
    { value: '', label: 'none' },
    ...Object.values(CompactConfigMap).map(({ compact, label }) => ({
        value: compact,
        label,
    })),
];

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
    const disabled = !selectedField;

    return (
        <Popover2
            disabled={disabled}
            content={
                <InputWrapper>
                    <FormGroup labelFor="bignumber-field" label="Select field">
                        <FieldAutoComplete
                            id="bignumber-field"
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
                    </FormGroup>

                    <FormGroup labelFor="bignumber-label" label="Label">
                        <InputGroup
                            id="bignumber-label"
                            placeholder={defaultLabel}
                            defaultValue={bigNumberLabel}
                            onBlur={(e) =>
                                setBigNumberLabel(e.currentTarget.value)
                            }
                        />
                    </FormGroup>

                    {showStyle && (
                        <FormGroup labelFor="bignumber-style" label="Style">
                            <HTMLSelect
                                id="bignumber-style"
                                fill
                                options={StyleOptions}
                                value={bigNumberStyle}
                                onChange={(e) => {
                                    if (e.target.value === '') {
                                        setBigNumberStyle(undefined);
                                    } else {
                                        setBigNumberStyle(
                                            e.target.value as CompactOrAlias,
                                        );
                                    }
                                }}
                            />
                        </FormGroup>
                    )}
                </InputWrapper>
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

export default BigNumberConfigPanel;
