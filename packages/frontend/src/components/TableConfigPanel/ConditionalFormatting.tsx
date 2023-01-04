import { Button, FormGroup, HTMLSelect } from '@blueprintjs/core';
import {
    CompiledField,
    createFilterRuleFromField,
    FilterOperator,
    FilterRule,
    FilterType,
    getFilterTypeFromField,
} from '@lightdash/common';
import { FC, useState } from 'react';
import ColorInput from '../common/ColorInput';
import { FilterTypeConfig } from '../common/Filters/configs';
import FieldAutoComplete from '../common/Filters/FieldAutoComplete';
import { FiltersProvider } from '../common/Filters/FiltersProvider';

interface ConditionalFormattingProps {
    fields: CompiledField[];
    value: ConditionalFormattingConfig | undefined;
    onChange: (value: ConditionalFormattingConfig) => void;
}

interface ConditionalFormattingConfig {
    field: CompiledField;
    filter: FilterRule;
    color: string;
}

const ConditionalFormatting: FC<ConditionalFormattingProps> = ({
    fields,
    value,
    onChange,
}) => {
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
        onChange({ field, color, filter });
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
                    fields={fields}
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
