import { Button, Colors, HTMLSelect } from '@blueprintjs/core';
import {
    createFilterRuleFromField,
    fieldId as getFieldId,
    FilterableField,
    FilterRule,
    FilterType,
    getFilterRuleWithDefaultValue,
    getFilterTypeFromField,
    isField,
} from '@lightdash/common';
import React, { FC, useCallback, useMemo } from 'react';
import { FilterTypeConfig } from './configs';
import FieldAutoComplete from './FieldAutoComplete';

type Props = {
    fields: FilterableField[];
    filterRule: FilterRule;
    isEditMode: boolean;
    onChange: (value: FilterRule) => void;
    onDelete: () => void;
};

const FilterRuleForm: FC<Props> = ({
    fields,
    filterRule,
    isEditMode,
    onChange,
    onDelete,
}) => {
    const activeField = fields.find(
        (field) => getFieldId(field) === filterRule.target.fieldId,
    );

    const filterType = activeField
        ? getFilterTypeFromField(activeField)
        : FilterType.STRING;
    const filterConfig = useMemo(
        () => FilterTypeConfig[filterType],
        [filterType],
    );

    const onFieldChange = useCallback(
        (fieldId: string) => {
            const selectedField = fields.find(
                (field) => getFieldId(field) === fieldId,
            );
            if (selectedField && activeField) {
                if (selectedField.type === activeField.type) {
                    onChange({
                        ...filterRule,
                        target: {
                            fieldId,
                        },
                    });
                } else {
                    onChange(createFilterRuleFromField(selectedField));
                }
            }
        },
        [activeField, fields, filterRule, onChange],
    );

    return (
        <div
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 10,
                flex: 1,
            }}
        >
            {activeField ? (
                <>
                    <FieldAutoComplete
                        activeField={activeField}
                        fields={fields}
                        onChange={(field) => {
                            if (isField(field)) {
                                onFieldChange(getFieldId(field));
                            }
                        }}
                        disabled={!isEditMode}
                    />
                    <HTMLSelect
                        fill={false}
                        disabled={!isEditMode}
                        style={{ width: 150 }}
                        onChange={(e) => {
                            onChange(
                                getFilterRuleWithDefaultValue(
                                    activeField,
                                    {
                                        ...filterRule,
                                        operator: e.currentTarget
                                            .value as FilterRule['operator'],
                                    },
                                    filterRule.values
                                        ? filterRule.values[0]
                                        : 1,
                                ),
                            );
                        }}
                        options={filterConfig.operatorOptions}
                        value={filterRule.operator}
                    />
                    <filterConfig.inputs
                        filterType={filterType}
                        field={activeField}
                        filterRule={filterRule}
                        onChange={onChange}
                        disabled={!isEditMode}
                    />
                </>
            ) : (
                <span style={{ width: '100%', color: Colors.GRAY1 }}>
                    Tried to reference field with unknown id:{' '}
                    {filterRule.target.fieldId}
                </span>
            )}
            {isEditMode && <Button minimal icon="cross" onClick={onDelete} />}
        </div>
    );
};

export default FilterRuleForm;
