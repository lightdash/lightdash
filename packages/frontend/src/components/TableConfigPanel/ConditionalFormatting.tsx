import { FormGroup, HTMLSelect } from '@blueprintjs/core';
import {
    CompiledField,
    createFilterRuleFromField,
    FilterOperator,
    FilterRule,
    FilterType,
} from '@lightdash/common';
import { FC, useState } from 'react';
import ColorInput from '../common/ColorInput';
import { FilterTypeConfig } from '../common/Filters/configs';
import FieldAutoComplete from '../common/Filters/FieldAutoComplete';
import {
    FieldsWithSuggestions,
    FiltersProvider,
} from '../common/Filters/FiltersProvider';

interface ConditionalFormattingProps {
    numericFields: CompiledField[];
}

const ConditionalFormatting: FC<ConditionalFormattingProps> = ({
    numericFields,
}) => {
    const [field, setField] = useState<CompiledField>();
    const [color, setColor] = useState<string>();
    const [filter, setFilter] = useState<FilterRule>();

    const handleChangeField = (newField: CompiledField) => {
        setField(newField);
        setFilter(createFilterRuleFromField(newField));
    };

    const handleChangeFilterOperator = (newOperator: FilterOperator) => {
        if (!filter) return;
        setFilter({ ...filter, operator: newOperator });
    };

    const config = FilterTypeConfig.number;

    return (
        <FiltersProvider projectUuid="BLAH." fieldsMap={{}}>
            <FormGroup label="Select field">
                <FieldAutoComplete
                    id="numeric-field-autocomplete"
                    fields={numericFields}
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
                            options={config.operatorOptions}
                            value={filter?.operator}
                        />
                    </FormGroup>

                    <FormGroup>
                        <config.inputs
                            filterType={FilterType.NUMBER}
                            field={field}
                            filterRule={filter}
                            onChange={(newFilterRule) =>
                                setFilter(newFilterRule)
                            }
                        />
                    </FormGroup>
                </>
            )}
        </FiltersProvider>
    );
};
export default ConditionalFormatting;
