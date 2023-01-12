import { Button, Collapse, FormGroup, HTMLSelect } from '@blueprintjs/core';
import { Tooltip2 } from '@blueprintjs/popover2';
import {
    CompiledField,
    ConditionalFormattingConfig,
    ConditionalFormattingRule,
    ConditionalOperator,
    createConditionalFormatingRule,
    FilterType,
    getItemId,
} from '@lightdash/common';
import produce from 'immer';
import React, { FC, useMemo, useState } from 'react';
import { SectionTitle } from '../ChartConfigPanel/ChartConfigPanel.styles';
import SeriesColorPicker from '../ChartConfigPanel/Series/SeriesColorPicker';
import { FilterTypeConfig } from '../common/Filters/configs';
import FieldAutoComplete from '../common/Filters/FieldAutoComplete';
import { FiltersProvider } from '../common/Filters/FiltersProvider';
import {
    ConditionalFormattingCloseButton,
    ConditionalFormattingConfigWrapper,
    ConditionalFormattingRuleAndLabel,
    ConditionalFormattingRuleHeader,
    ConditionalFormattingRuleListWrapper,
    ConditionalFormattingRuleWrapper,
    ConditionalFormattingWrapper,
} from './ConditionalFormatting.styles';

interface ConditionalFormattingProps {
    isDefaultOpen?: boolean;
    index: number;
    fields: CompiledField[];
    usedFieldIds: string[];
    value: ConditionalFormattingConfig;
    onChange: (newConfig: ConditionalFormattingConfig) => void;
    onRemove: () => void;
}

const ConditionalFormatting: FC<ConditionalFormattingProps> = ({
    isDefaultOpen = true,
    index: configIndex,
    fields,
    usedFieldIds,
    value,
    onChange,
    onRemove,
}) => {
    const [isOpen, setIsOpen] = useState(isDefaultOpen);
    const [config, setConfig] = useState<ConditionalFormattingConfig>(value);

    const field = useMemo(
        () => fields.find((f) => getItemId(f) === config?.target?.fieldId),
        [fields, config],
    );

    const handleRemoveConditionalFormatting = () => {
        onRemove();
    };

    const handleChange = (newConfig: ConditionalFormattingConfig) => {
        setConfig(newConfig);
        onChange(newConfig);
    };

    const handleChangeField = (newField: CompiledField | undefined) => {
        handleChange(
            produce(config, (draft) => {
                draft.target = newField
                    ? { fieldId: getItemId(newField) }
                    : null;
            }),
        );
    };

    const handleAddRule = () => {
        handleChange(
            produce(config, (draft) => {
                draft.rules.push(createConditionalFormatingRule());
            }),
        );
    };

    const handleChangeConditionalOperator = (
        index: number,
        newOperator: ConditionalOperator,
    ) => {
        handleChange(
            produce(config, (draft) => {
                draft.rules[index].operator = newOperator;
            }),
        );
    };

    const handleChangeRule = (
        index: number,
        newRule: ConditionalFormattingRule,
    ) => {
        handleChange(
            produce(config, (draft) => {
                draft.rules[index] = newRule;
                // FIXME: check if we can fix this problem in number input
                draft.rules[index].values = draft.rules[index].values.map((v) =>
                    Number(v),
                );
            }),
        );
    };

    const handleChangeColor = (newColor: string) => {
        handleChange(
            produce(config, (draft) => {
                draft.color = newColor;
            }),
        );
    };

    // conditional formatting only supports number fields for now
    const filterConfig = FilterTypeConfig[FilterType.NUMBER];

    return (
        <FiltersProvider>
            <ConditionalFormattingWrapper>
                <ConditionalFormattingRuleHeader>
                    <Button
                        minimal
                        small
                        onClick={() => setIsOpen(!isOpen)}
                        icon={isOpen ? 'chevron-down' : 'chevron-right'}
                    />

                    <SectionTitle>Rule {configIndex + 1}</SectionTitle>

                    <Tooltip2
                        content="Remove rule"
                        position="left"
                        renderTarget={({ ref, ...tooltipProps }) => (
                            <ConditionalFormattingCloseButton
                                {...tooltipProps}
                                elementRef={ref}
                                minimal
                                small
                                icon="cross"
                                onClick={handleRemoveConditionalFormatting}
                            />
                        )}
                    />
                </ConditionalFormattingRuleHeader>

                <Collapse isOpen={isOpen}>
                    <ConditionalFormattingConfigWrapper>
                        <FormGroup label="Select field">
                            <FieldAutoComplete
                                id="numeric-field-autocomplete"
                                fields={fields}
                                activeField={field}
                                inactiveFieldIds={usedFieldIds}
                                onChange={handleChangeField}
                                popoverProps={{
                                    lazy: true,
                                    matchTargetWidth: true,
                                }}
                                inputProps={{
                                    rightElement: field ? (
                                        <Button
                                            minimal
                                            icon="cross"
                                            onClick={() =>
                                                handleChangeField(undefined)
                                            }
                                        />
                                    ) : undefined,
                                }}
                            />
                        </FormGroup>

                        <FormGroup label="Set color">
                            <SeriesColorPicker
                                color={config.color}
                                onChange={(color) => handleChangeColor(color)}
                            />
                        </FormGroup>

                        <FormGroup label="Conditions">
                            <ConditionalFormattingRuleListWrapper>
                                {config.rules.map((rule, ruleIndex) => (
                                    <React.Fragment key={ruleIndex}>
                                        <ConditionalFormattingRuleWrapper>
                                            <FormGroup>
                                                <HTMLSelect
                                                    fill
                                                    onChange={(e) =>
                                                        handleChangeConditionalOperator(
                                                            ruleIndex,
                                                            e.target
                                                                .value as ConditionalOperator,
                                                        )
                                                    }
                                                    options={
                                                        filterConfig.operatorOptions
                                                    }
                                                    value={rule.operator}
                                                />
                                            </FormGroup>

                                            <FormGroup>
                                                <filterConfig.inputs
                                                    filterType={
                                                        FilterType.NUMBER
                                                    }
                                                    field={field ?? fields[0]}
                                                    rule={rule}
                                                    onChange={(newRule) =>
                                                        handleChangeRule(
                                                            ruleIndex,
                                                            newRule,
                                                        )
                                                    }
                                                />
                                            </FormGroup>
                                        </ConditionalFormattingRuleWrapper>

                                        {ruleIndex !==
                                            config.rules.length - 1 && (
                                            <ConditionalFormattingRuleAndLabel>
                                                AND
                                            </ConditionalFormattingRuleAndLabel>
                                        )}
                                    </React.Fragment>
                                ))}
                            </ConditionalFormattingRuleListWrapper>
                        </FormGroup>

                        <Button minimal icon="plus" onClick={handleAddRule}>
                            Add new condition
                        </Button>
                    </ConditionalFormattingConfigWrapper>
                </Collapse>
            </ConditionalFormattingWrapper>
        </FiltersProvider>
    );
};
export default ConditionalFormatting;
