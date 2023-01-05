import { Button, FormGroup, HTMLSelect } from '@blueprintjs/core';
import {
    CompiledField,
    ConditionalFormattingConfig,
    createFilterRuleFromField,
    fieldId,
    FilterOperator,
    FilterRule,
    FilterType,
    getFilterTypeFromField,
    getVisibleFields,
} from '@lightdash/common';
import { FC, useMemo, useState } from 'react';
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
            ? getVisibleFields(explore).filter(
                  (field) =>
                      activeFields.has(fieldId(field)) &&
                      field.type === 'number',
              )
            : [];
    }, [explore, activeFields]);

    const value = conditionalFormattings[0];

    const [field, setField] = useState<CompiledField | undefined>(value?.field);
    const [color, setColor] = useState<string | undefined>(value?.color);
    const [filter, setFilter] = useState<FilterRule | undefined>(value?.filter);

    const handleChangeField = (newField: CompiledField) => {
        setField(newField);
        setFilter(createFilterRuleFromField(newField));
    };

    const handleChangeFilterOperator = (newOperator: FilterOperator) => {
        if (!filter) return;
        setFilter({ ...filter, operator: newOperator });
    };

    const handleChange = () => {
        if (!field || !filter || !color) return;

        const newConfig: ConditionalFormattingConfig = {
            field,
            filter,
            color,
        };

        onSetConditionalFormattings([newConfig]);
    };

    const fieldConfig =
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

            {field && filter && (
                <>
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
                            options={fieldConfig.operatorOptions}
                            value={filter?.operator}
                        />
                    </FormGroup>

                    <FormGroup>
                        <fieldConfig.inputs
                            filterType={FilterType.NUMBER}
                            field={field}
                            filterRule={filter}
                            onChange={(newFilterRule) =>
                                setFilter(newFilterRule)
                            }
                        />
                    </FormGroup>

                    <div
                        style={{
                            display: 'flex',
                            justifyContent: 'flex-end',
                        }}
                    >
                        <Button
                            disabled={!field || !filter || !color}
                            intent="primary"
                            onClick={handleChange}
                        >
                            Apply
                        </Button>
                    </div>
                </>
            )}
        </FiltersProvider>
    );
};
export default ConditionalFormatting;
