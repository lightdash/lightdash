import { Button, FormGroup } from '@blueprintjs/core';
import { Tooltip2 } from '@blueprintjs/popover2';
import {
    CompiledField,
    ConditionalFormattingConfig,
    ConditionalFormattingRule as ConditionalFormattingRuleT,
    ConditionalOperator,
    createConditionalFormatingRule,
    FilterType,
    getItemId,
} from '@lightdash/common';
import produce from 'immer';
import React, { FC, useMemo, useState } from 'react';
import SeriesColorPicker from '../ChartConfigPanel/Series/SeriesColorPicker';
import FieldAutoComplete from '../common/Filters/FieldAutoComplete';
import { FiltersProvider } from '../common/Filters/FiltersProvider';
import {
    ConditionalFormattingConfigWrapper,
    ConditionalFormattingGroupHeader,
    ConditionalFormattingGroupTitle,
    ConditionalFormattingRuleAndLabel,
    ConditionalFormattingWrapper,
} from './ConditionalFormatting.styles';
import ConditionalFormattingRule from './ConditionalFormattingRule';

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
    const [isAddingRule, setIsAddingRule] = useState(false);
    const [isOpen, setIsOpen] = useState(isDefaultOpen);
    const [config, setConfig] = useState<ConditionalFormattingConfig>(value);

    const field = useMemo(
        () => fields.find((f) => getItemId(f) === config?.target?.fieldId),
        [fields, config],
    );

    const handleRemove = () => {
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
        setIsAddingRule(true);
        handleChange(
            produce(config, (draft) => {
                draft.rules.push(createConditionalFormatingRule());
            }),
        );
    };

    const handleRemoveRule = (index: number) => {
        handleChange(
            produce(config, (draft) => {
                draft.rules.splice(index, 1);
            }),
        );
    };

    const handleChangeRuleOperator = (
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
        newRule: ConditionalFormattingRuleT,
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

    return (
        <FiltersProvider>
            <ConditionalFormattingWrapper>
                <ConditionalFormattingGroupHeader>
                    <Button
                        minimal
                        small
                        onClick={() => setIsOpen(!isOpen)}
                        icon={isOpen ? 'chevron-down' : 'chevron-right'}
                    />

                    <ConditionalFormattingGroupTitle>
                        Rule {configIndex + 1}
                    </ConditionalFormattingGroupTitle>

                    <Tooltip2
                        content="Remove rule"
                        position="left"
                        renderTarget={({ ref, ...tooltipProps }) => (
                            <Button
                                style={{ marginLeft: 'auto' }}
                                {...tooltipProps}
                                elementRef={ref}
                                minimal
                                small
                                icon="cross"
                                onClick={handleRemove}
                            />
                        )}
                    />
                </ConditionalFormattingGroupHeader>

                {isOpen ? (
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

                        {config.rules.map((rule, ruleIndex) => (
                            <React.Fragment key={ruleIndex}>
                                <ConditionalFormattingRule
                                    isDefaultOpen={
                                        config.rules.length === 1 ||
                                        isAddingRule
                                    }
                                    hasRemove={config.rules.length > 1}
                                    ruleIndex={ruleIndex}
                                    rule={rule}
                                    field={field || fields[0]}
                                    onChangeRule={(newRule) =>
                                        handleChangeRule(ruleIndex, newRule)
                                    }
                                    onChangeRuleOperator={(newOperator) =>
                                        handleChangeRuleOperator(
                                            ruleIndex,
                                            newOperator,
                                        )
                                    }
                                    onRemoveRule={() =>
                                        handleRemoveRule(ruleIndex)
                                    }
                                />

                                {ruleIndex !== config.rules.length - 1 && (
                                    <ConditionalFormattingRuleAndLabel>
                                        AND
                                    </ConditionalFormattingRuleAndLabel>
                                )}
                            </React.Fragment>
                        ))}

                        <Button
                            style={{ alignSelf: 'flex-start' }}
                            minimal
                            icon="plus"
                            onClick={handleAddRule}
                        >
                            Add new condition
                        </Button>
                    </ConditionalFormattingConfigWrapper>
                ) : null}
            </ConditionalFormattingWrapper>
        </FiltersProvider>
    );
};
export default ConditionalFormatting;
