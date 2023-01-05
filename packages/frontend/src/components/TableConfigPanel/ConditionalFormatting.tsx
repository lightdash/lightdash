import { FormGroup, HTMLSelect } from '@blueprintjs/core';
import {
    CompiledField,
    ConditionalFormattingConfig,
    ConditionalFormattingRule,
    createConditionalFormatingRule,
    fieldId,
    FilterOperator,
    FilterType,
    getFilterTypeFromField,
    getVisibleFields,
} from '@lightdash/common';
import produce from 'immer';
import { FC, useEffect, useMemo, useState } from 'react';
import { useExplorerContext } from '../../providers/ExplorerProvider';
import ColorInput from '../common/ColorInput';
import { FilterTypeConfig } from '../common/Filters/configs';
import FieldAutoComplete from '../common/Filters/FieldAutoComplete';
import { FiltersProvider } from '../common/Filters/FiltersProvider';
import { useVisualizationContext } from '../LightdashVisualization/VisualizationProvider';

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

    const value = conditionalFormattings[0];

    const [field, setField] = useState<CompiledField | undefined>(value?.field);
    const [color, setColor] = useState<string | undefined>(value?.color);
    const [rules, setRules] = useState<ConditionalFormattingRule[]>(
        value?.rules ?? [],
    );

    const handleChangeField = (newField: CompiledField) => {
        setField(newField);
        setRules([createConditionalFormatingRule(newField)]);
    };

    const handleChangeFilterOperator = (newOperator: FilterOperator) => {
        setRules(
            produce(rules, (draft) => {
                draft[0].operator = newOperator;
                return draft;
            }),
        );
    };

    useEffect(() => {
        if (!field || !color || rules.length === 0) return;

        const newConfig: ConditionalFormattingConfig = {
            field,
            rules,
            color,
        };

        onSetConditionalFormattings([newConfig]);
    }, [field, color, rules, onSetConditionalFormattings]);

    const filterConfig =
        FilterTypeConfig[
            field ? getFilterTypeFromField(field) : FilterType.STRING
        ];

    return (
        <FiltersProvider projectUuid="BLAH." fieldsMap={{}}>
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
                />
            </FormGroup>

            {field &&
                rules.map((rule) => (
                    <div key={rule.id}>
                        <FormGroup label="Set color">
                            <ColorInput
                                placeholder="Enter hex color"
                                value={color}
                                onChange={(e) => setColor(e.target.value)}
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
                                value={rules[0]?.operator}
                            />
                        </FormGroup>

                        <FormGroup>
                            <filterConfig.inputs<ConditionalFormattingRule>
                                filterType={FilterType.NUMBER}
                                field={field}
                                filterRule={rules[0]}
                                onChange={(newFilterRule) =>
                                    setRules([newFilterRule])
                                }
                            />
                        </FormGroup>
                    </div>
                ))}
        </FiltersProvider>
    );
};
export default ConditionalFormatting;
