import { Button, Tag } from '@blueprintjs/core';
import {
    fieldId,
    FilterableDimension,
    FilterOperator,
    FilterRule,
    Filters,
    getTotalFilterRules,
    isFilterRule,
} from 'common';
import React, { FC, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import FilterRuleForm from './FilterRuleForm';

type Props = {
    fields: FilterableDimension[];
    filters: Filters;
    setFilters: (value: Filters) => void;
};

const FiltersForm: FC<Props> = ({ fields, filters, setFilters }) => {
    const rules: Array<FilterRule> = getTotalFilterRules(filters);

    const onDeleteFilterRule = useCallback(
        (index: number) => {
            setFilters({
                dimensions: {
                    id: uuidv4(),
                    and: [...rules.slice(0, index), ...rules.slice(index + 1)],
                },
            });
        },
        [rules, setFilters],
    );

    const onChangeFilterRule = useCallback(
        (index: number, filterRule: FilterRule) => {
            setFilters({
                dimensions: {
                    id: uuidv4(),
                    and: [
                        ...rules.slice(0, index),
                        filterRule,
                        ...rules.slice(index + 1),
                    ],
                },
            });
        },
        [rules, setFilters],
    );

    const onAddFilterRule = useCallback(() => {
        if (fields.length > 0) {
            setFilters({
                dimensions: {
                    id: uuidv4(),
                    and: [
                        ...rules,
                        {
                            id: uuidv4(),
                            target: {
                                fieldId: fieldId(fields[0]),
                            },
                            operator: FilterOperator.NULL,
                        },
                    ],
                },
            });
        }
    }, [fields, rules, setFilters]);

    return (
        <div
            style={{
                margin: '10px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'flex-start',
                alignItems: 'start',
            }}
        >
            <div
                style={{
                    width: '100%',
                    paddingBottom: '20px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '5px',
                }}
            >
                {rules.length > 0 && (
                    <div
                        style={{ display: 'inline-flex', alignItems: 'center' }}
                    >
                        <p style={{ margin: 0, marginRight: 10 }}>
                            Operator: <Tag minimal>AND</Tag>
                        </p>
                    </div>
                )}
                {rules.map((filterRule, index) =>
                    isFilterRule(filterRule) ? (
                        <React.Fragment key={filterRule.id}>
                            <FilterRuleForm
                                filterRule={filterRule}
                                fields={fields}
                                onChange={(value) =>
                                    onChangeFilterRule(index, value)
                                }
                                onDelete={() => onDeleteFilterRule(index)}
                            />
                        </React.Fragment>
                    ) : null,
                )}
            </div>
            {fields.length > 0 && (
                <div style={{ display: 'inline-flex', alignItems: 'center' }}>
                    <Button
                        minimal
                        icon="plus"
                        intent="primary"
                        onClick={onAddFilterRule}
                    >
                        Add filter
                    </Button>
                </div>
            )}
        </div>
    );
};

export default FiltersForm;
