import {
    Button,
    FormGroup,
    HTMLSelect,
    InputGroup,
    Radio,
    RadioGroup,
    Switch,
    Tab,
    Tabs,
} from '@blueprintjs/core';
import {
    CompactConfigMap,
    CompactOrAlias,
    ComparisonFormatTypes,
    getItemId,
} from '@lightdash/common';
import { IconEye, IconEyeOff } from '@tabler/icons-react';
import React, { useState } from 'react';
import {
    InputWrapper,
    Wrapper,
} from '../ChartConfigPanel/ChartConfigPanel.styles';
import FieldAutoComplete from '../common/Filters/FieldAutoComplete';
import { useVisualizationContext } from '../LightdashVisualization/VisualizationProvider';

const StyleOptions = [
    { value: '', label: 'none' },
    ...Object.values(CompactConfigMap).map(({ compact, label }) => ({
        value: compact,
        label,
    })),
];

const BigNumberConfigTabs = () => {
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
            showBigNumberLabel,
            setShowBigNumberLabel,
            showComparison,
            setShowComparison,
            comparisonFormat,
            setComparisonFormat,
            flipColors,
            setFlipColors,
            comparisonLabel,
            setComparisonLabel,
        },
    } = useVisualizationContext();
    const [tab, setTab] = useState<string | number>('layout');
    return (
        <Wrapper>
            <Tabs
                onChange={setTab}
                selectedTabId={tab}
                renderActiveTabPanelOnly
            >
                <Tab
                    id="layout"
                    title="Layout"
                    panel={
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
                                            active={showBigNumberLabel}
                                            icon={
                                                showBigNumberLabel ? (
                                                    <IconEye size={18} />
                                                ) : (
                                                    <IconEyeOff size={18} />
                                                )
                                            }
                                            onClick={() => {
                                                setShowBigNumberLabel(
                                                    !showBigNumberLabel,
                                                );
                                            }}
                                        />
                                    }
                                />
                            </FormGroup>

                            {showStyle && (
                                <FormGroup
                                    labelFor="bignumber-style"
                                    label="Format"
                                >
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
                                                    e.target
                                                        .value as CompactOrAlias,
                                                );
                                            }
                                        }}
                                    />
                                </FormGroup>
                            )}
                        </InputWrapper>
                    }
                />

                <Tab
                    id="comparison"
                    title="Comparison"
                    panel={
                        <InputWrapper>
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
                            {showComparison ? (
                                <>
                                    <FormGroup
                                        labelFor="comparison-format"
                                        label="Compare by:"
                                    >
                                        <RadioGroup
                                            onChange={(e) => {
                                                setComparisonFormat(
                                                    e.currentTarget.value ===
                                                        'raw'
                                                        ? ComparisonFormatTypes.RAW
                                                        : ComparisonFormatTypes.PERCENTAGE,
                                                );
                                            }}
                                            selectedValue={comparisonFormat}
                                        >
                                            <Radio
                                                label="Raw value"
                                                value={
                                                    ComparisonFormatTypes.RAW
                                                }
                                            />
                                            <Radio
                                                label="Percentage"
                                                value={
                                                    ComparisonFormatTypes.PERCENTAGE
                                                }
                                            />
                                        </RadioGroup>
                                    </FormGroup>
                                    <FormGroup
                                        labelFor="comparison-color"
                                        label="Flip positive color"
                                        inline
                                        style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            marginBottom: 'none',
                                        }}
                                    >
                                        <Switch
                                            alignIndicator="right"
                                            checked={flipColors}
                                            onChange={() => {
                                                setFlipColors(!flipColors);
                                            }}
                                        />
                                    </FormGroup>
                                    <FormGroup
                                        labelFor="comparison-label"
                                        label="Comparison label"
                                    >
                                        <InputGroup
                                            id="comparison-label"
                                            placeholder="Add an optional label"
                                            defaultValue={comparisonLabel}
                                            onBlur={(e) =>
                                                setComparisonLabel(
                                                    e.currentTarget.value,
                                                )
                                            }
                                        />
                                    </FormGroup>
                                </>
                            ) : null}
                        </InputWrapper>
                    }
                />
            </Tabs>
        </Wrapper>
    );
};

export default BigNumberConfigTabs;
