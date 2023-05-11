import {
    Button,
    FormGroup,
    HTMLSelect,
    InputGroup,
    Radio,
    RadioGroup,
    Switch,
} from '@blueprintjs/core';
import { Popover2 } from '@blueprintjs/popover2';
import { CompactConfigMap, CompactOrAlias, getItemId } from '@lightdash/common';
import { IconEye, IconEyeOff } from '@tabler/icons-react';
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

const BigNumberConfigPanel: React.FC = () => {
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
            showLabel,
            setShowLabel,
            showComparison,
            setShowComparison,
            comparisonFormat,
            setComparisonFormat,
            comparisonFormatTypes,
        },
    } = useVisualizationContext();
    const [isOpen, setIsOpen] = useState(false);
    const disabled = !selectedField;

    return (
        <Popover2
            disabled={disabled}
            content={
                <InputWrapper>
                    <FormGroup labelFor="bignumber-field" label="Field">
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
                            rightElement={
                                <Button
                                    active={showLabel}
                                    icon={
                                        showLabel ? (
                                            <IconEye size={18} />
                                        ) : (
                                            <IconEyeOff size={18} />
                                        )
                                    }
                                    onClick={() => {
                                        setShowLabel(!showLabel);
                                    }}
                                />
                            }
                        />
                    </FormGroup>

                    {showStyle && (
                        <FormGroup labelFor="bignumber-style" label="Format">
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
                    <FormGroup
                        labelFor="bignumber-comparison"
                        label="Compare to previous row"
                        inline
                        style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            marginBottom: 'none',
                        }}
                    >
                        <Switch
                            alignIndicator="right"
                            checked={showComparison}
                            onChange={() => {
                                setShowComparison(!showComparison);
                            }}
                        />
                    </FormGroup>
                    {showComparison && (
                        <RadioGroup
                            onChange={(e) => {
                                setComparisonFormat(
                                    e.currentTarget.value === 'raw'
                                        ? comparisonFormatTypes.RAW
                                        : comparisonFormatTypes.PERCENTAGE,
                                );
                            }}
                            selectedValue={comparisonFormat}
                        >
                            <Radio
                                label="By raw value"
                                value={comparisonFormatTypes.RAW}
                            />
                            <Radio
                                label="By percentage"
                                value={comparisonFormatTypes.PERCENTAGE}
                            />
                        </RadioGroup>
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
