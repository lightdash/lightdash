import { Button, FormGroup, HTMLSelect } from '@blueprintjs/core';
import { Tooltip2 } from '@blueprintjs/popover2';
import {
    CompiledField,
    ConditionalFormattingConfig,
    ConditionalFormattingRule,
    createConditionalFormatingRule,
    fieldId,
    FilterOperator,
    FilterType,
    getItemId,
    getVisibleFields,
} from '@lightdash/common';
import produce from 'immer';
import React, { FC, useEffect, useMemo, useState } from 'react';
import { useExplorerContext } from '../../providers/ExplorerProvider';
import SeriesColorPicker from '../ChartConfigPanel/Series/SeriesColorPicker';
import { FilterTypeConfig } from '../common/Filters/configs';
import FieldAutoComplete from '../common/Filters/FieldAutoComplete';
import { FiltersProvider } from '../common/Filters/FiltersProvider';
import { useVisualizationContext } from '../LightdashVisualization/VisualizationProvider';
import { Icon } from '../Mobile/Mobile.styles';
import {
    ConditionalFormattingWrapper,
    StyledCloseButton,
} from './ConditionalFormatting.styles';

const ConditionalFormatting: FC = () => {
    const {
        explore,
        tableConfig: { conditionalFormattings, onSetConditionalFormattings },
    } = useVisualizationContext();

    const activeFields = useExplorerContext((c) => c.state.activeFields);
    const visibleActiveNumericFields = useMemo(() => {
        return explore
            ? getVisibleFields(explore)
                  .filter((field) => activeFields.has(fieldId(field)))
                  .filter((field) => field.type === 'number')
            : [];
    }, [explore, activeFields]);

    const conditionalFormatting = conditionalFormattings[0];
    const field = useMemo(
        () =>
            visibleActiveNumericFields.find(
                (f) => getItemId(f) === conditionalFormatting?.target?.fieldId,
            ),
        [conditionalFormatting, visibleActiveNumericFields],
    );

    const [config, setConfig] = useState<ConditionalFormattingConfig | null>(
        conditionalFormatting,
    );

    const handleAddEmptyConditionalFormatting = () => {
        setConfig({
            target: null,
            color: '#BBAAFF',
            rules: [createConditionalFormatingRule()],
        });
    };

    const handleRemoveConditionalFormatting = () => {
        setConfig(null);
    };

    const handleChangeField = (newField: CompiledField | undefined) => {
        if (!config) return;

        setConfig({
            ...config,
            target: newField ? { fieldId: getItemId(newField) } : null,
        });
    };

    const handleChangeFilterOperator = (newOperator: FilterOperator) => {
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
        onSetConditionalFormattings(config ? [config] : []);
    }, [config, onSetConditionalFormattings]);

    // conditional formatting only supports number fields for now
    const filterConfig = FilterTypeConfig[FilterType.NUMBER];

    return (
        <FiltersProvider>
            {!config ? (
                <FormGroup>
                    <Button
                        icon="plus"
                        onClick={handleAddEmptyConditionalFormatting}
                    >
                        Add new rule
                    </Button>
                </FormGroup>
            ) : (
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
                            fields={visibleActiveNumericFields}
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
                                        onClick={() =>
                                            handleChangeField(undefined)
                                        }
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
                                    onChange={(color) =>
                                        handleChangeColor(color)
                                    }
                                />
                            </FormGroup>

                            <FormGroup label="Value">
                                <HTMLSelect
                                    fill
                                    onChange={(e) =>
                                        handleChangeFilterOperator(
                                            e.target.value as FilterOperator,
                                        )
                                    }
                                    options={filterConfig.operatorOptions}
                                    value={rule.operator}
                                />
                            </FormGroup>

                            <FormGroup>
                                <filterConfig.inputs
                                    filterType={FilterType.NUMBER}
                                    field={
                                        field ?? visibleActiveNumericFields[0]
                                    }
                                    rule={rule}
                                    onChange={handleChangeRule}
                                />
                            </FormGroup>
                        </React.Fragment>
                    ))}
                </ConditionalFormattingWrapper>
            )}
        </FiltersProvider>
    );
};
export default ConditionalFormatting;
