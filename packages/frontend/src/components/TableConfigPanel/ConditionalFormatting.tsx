import { Button, FormGroup, HTMLSelect } from '@blueprintjs/core';
import { Tooltip2 } from '@blueprintjs/popover2';
import {
    CompiledField,
    ConditionalFormattingConfig,
    ConditionalFormattingRule,
    ConditionalOperator,
    FilterType,
    getItemId,
} from '@lightdash/common';
import produce from 'immer';
import React, { FC, useEffect, useMemo, useState } from 'react';
import SeriesColorPicker from '../ChartConfigPanel/Series/SeriesColorPicker';
import { FilterTypeConfig } from '../common/Filters/configs';
import FieldAutoComplete from '../common/Filters/FieldAutoComplete';
import { FiltersProvider } from '../common/Filters/FiltersProvider';
import {
    ConditionalFormattingWrapper,
    StyledCloseButton,
} from './ConditionalFormatting.styles';

interface ConditionalFormattingProps {
    fields: CompiledField[];
    value: ConditionalFormattingConfig;
    onChange: (newConfig: ConditionalFormattingConfig) => void;
    onRemove: () => void;
}

const ConditionalFormatting: FC<ConditionalFormattingProps> = ({
    fields,
    value,
    onChange,
    onRemove,
}) => {
    const [config, setConfig] = useState<ConditionalFormattingConfig>(value);

    const field = useMemo(
        () => fields.find((f) => getItemId(f) === config?.target?.fieldId),
        [fields, config],
    );

    const handleRemoveConditionalFormatting = () => {
        onRemove();
    };

    const handleChangeField = (newField: CompiledField | undefined) => {
        if (!config) return;

        setConfig({
            ...config,
            target: newField ? { fieldId: getItemId(newField) } : null,
        });
    };

    const handleChangeConditionalOperator = (
        newOperator: ConditionalOperator,
    ) => {
        if (!config) return;

        setConfig(
            produce(config, (draft) => {
                draft.rules[0].operator = newOperator;
            }),
        );
    };

    const handleChangeRule = (newRule: ConditionalFormattingRule) => {
        if (!config) return;

        setConfig(
            produce(config, (draft) => {
                draft.rules[0] = newRule;
                // FIXME: check if we can fix this problem in number input
                draft.rules[0].values = draft.rules[0].values.map((v) =>
                    Number(v),
                );
                return draft;
            }),
        );
    };

    const handleChangeColor = (newColor: string) => {
        if (!config) return;

        setConfig({ ...config, color: newColor });
    };

    useEffect(() => {
        onChange(config);
    }, [config, onChange]);

    // conditional formatting only supports number fields for now
    const filterConfig = FilterTypeConfig[FilterType.NUMBER];

    return (
        <FiltersProvider>
            <ConditionalFormattingWrapper>
                <Tooltip2
                    content="Remove rule"
                    position="left"
                    renderTarget={({ ref, ...tooltipProps }) => (
                        <StyledCloseButton
                            {...tooltipProps}
                            elementRef={ref}
                            minimal
                            small
                            icon="cross"
                            onClick={handleRemoveConditionalFormatting}
                        />
                    )}
                />

                <FormGroup label="Select field">
                    <FieldAutoComplete
                        id="numeric-field-autocomplete"
                        fields={fields}
                        activeField={field}
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
                                    onClick={() => handleChangeField(undefined)}
                                />
                            ) : undefined,
                        }}
                    />
                </FormGroup>

                {config.rules.map((rule, index) => (
                    <React.Fragment key={index}>
                        <FormGroup label="Set color">
                            <SeriesColorPicker
                                color={config.color}
                                onChange={(color) => handleChangeColor(color)}
                            />
                        </FormGroup>

                        <FormGroup label="Value">
                            <HTMLSelect
                                fill
                                onChange={(e) =>
                                    handleChangeConditionalOperator(
                                        e.target.value as ConditionalOperator,
                                    )
                                }
                                options={filterConfig.operatorOptions}
                                value={rule.operator}
                            />
                        </FormGroup>

                        <FormGroup>
                            <filterConfig.inputs
                                filterType={FilterType.NUMBER}
                                field={field ?? fields[0]}
                                rule={rule}
                                onChange={handleChangeRule}
                            />
                        </FormGroup>
                    </React.Fragment>
                ))}
            </ConditionalFormattingWrapper>
        </FiltersProvider>
    );
};
export default ConditionalFormatting;
