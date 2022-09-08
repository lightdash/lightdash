import { Button, FormGroup, HTMLSelect, InputGroup } from '@blueprintjs/core';
import { Popover2 } from '@blueprintjs/popover2';
import { getItemId, NumberStyle } from '@lightdash/common';
import React from 'react';
import FieldAutoComplete from '../../common/Filters/FieldAutoComplete';
import { useVisualizationContext } from '../../LightdashVisualization/VisualizationProvider';
import { ConfigWrapper } from '../VisualizationConfigPanel.styles';

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
    const disabled = !selectedField;

    const styleOptions = [
        { value: '', label: 'none' },
        { value: NumberStyle.THOUSANDS, label: 'thousands (K)' },
        { value: NumberStyle.MILLIONS, label: 'millions (M)' },
        { value: NumberStyle.BILLIONS, label: 'billions (B)' },
    ];
    return (
        <Popover2
            lazy
            disabled={disabled}
            position="bottom"
            content={
                <ConfigWrapper>
                    <FormGroup label="Select field">
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
                    </FormGroup>

                    <FormGroup label="Label">
                        <InputGroup
                            placeholder={defaultLabel}
                            defaultValue={bigNumberLabel}
                            onBlur={(e) =>
                                setBigNumberLabel(e.currentTarget.value)
                            }
                        />
                    </FormGroup>

                    {showStyle && (
                        <>
                            <FormGroup label="Style">
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
                            </FormGroup>
                        </>
                    )}
                </ConfigWrapper>
            }
            renderTarget={({ isOpen, ref, ...targetProps }) => (
                <Button
                    {...targetProps}
                    elementRef={ref}
                    minimal
                    rightIcon="caret-down"
                    text="Configure"
                    disabled={disabled}
                />
            )}
        />
    );
};

export default BigNumberConfigPanel;
