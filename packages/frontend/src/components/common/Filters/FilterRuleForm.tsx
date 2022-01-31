import { Button, Colors, HTMLSelect } from '@blueprintjs/core';
import {
    DimensionType,
    fieldId as getFieldId,
    FilterableDimension,
    FilterOperator,
    FilterRule,
} from 'common';
import React, { FC, useCallback, useMemo } from 'react';
import { FilterTypeConfig } from './configs';
import FieldAutoComplete from './FieldAutoComplete';

type Props = {
    fields: FilterableDimension[];
    filterRule: FilterRule;
    onChange: (value: FilterRule) => void;
    onDelete: () => void;
};

const FilterRuleForm: FC<Props> = ({
    fields,
    filterRule,
    onChange,
    onDelete,
}) => {
    const activeField = fields.find(
        (field) => getFieldId(field) === filterRule.target.fieldId,
    );

    const filterConfig = useMemo(
        () => FilterTypeConfig[activeField?.type || DimensionType.STRING],
        [activeField],
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
                    onChange({
                        ...filterRule,
                        target: {
                            fieldId,
                        },
                        operator: FilterOperator.NULL,
                        settings: undefined,
                        values: undefined,
                    });
                }
            }
        },
        [activeField, fields, filterRule, onChange],
    );

    return (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
            {activeField ? (
                <>
                    <FieldAutoComplete
                        activeField={activeField}
                        fields={fields}
                        onChange={onFieldChange}
                    />
                    <HTMLSelect
                        fill={false}
                        style={{ width: 150 }}
                        onChange={(e) =>
                            onChange({
                                ...filterRule,
                                operator: e.currentTarget
                                    .value as FilterRule['operator'],
                            })
                        }
                        options={filterConfig.operatorOptions}
                        value={filterRule.operator}
                    />
                    <filterConfig.inputs
                        field={activeField}
                        filterRule={filterRule}
                        onChange={onChange}
                    />
                </>
            ) : (
                <span style={{ width: '100%', color: Colors.GRAY1 }}>
                    Tried to reference field with unknown id:{' '}
                    {filterRule.target.fieldId}
                </span>
            )}
            <Button minimal icon="cross" intent="danger" onClick={onDelete} />
        </div>
    );
};

export default FilterRuleForm;
