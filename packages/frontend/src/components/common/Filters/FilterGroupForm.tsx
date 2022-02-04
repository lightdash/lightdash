import { Button, Colors, HTMLSelect } from '@blueprintjs/core';
import {
    fieldId,
    FilterableField,
    FilterGroup,
    FilterGroupOperator,
    FilterOperator,
    FilterRule,
    isAndFilterGroup,
    isFilterRule,
} from 'common';
import React, { FC, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import FilterRuleForm from './FilterRuleForm';

type Props = {
    hideButtons?: boolean;
    conditionLabel: string;
    fields: FilterableField[];
    filterGroup: FilterGroup;
    onChange: (value: FilterGroup) => void;
    onDelete: () => void;
};

const FilterGroupForm: FC<Props> = ({
    hideButtons,
    conditionLabel,
    fields,
    filterGroup,
    onChange,
    onDelete,
}) => {
    const items = isAndFilterGroup(filterGroup)
        ? filterGroup.and
        : filterGroup.or;

    const onDeleteItem = useCallback(
        (index: number) => {
            if (items.length <= 1) {
                onDelete();
            } else {
                onChange({
                    ...filterGroup,
                    and: [...items.slice(0, index), ...items.slice(index + 1)],
                });
            }
        },
        [filterGroup, items, onChange, onDelete],
    );

    const onChangeItem = useCallback(
        (index: number, item: FilterRule | FilterGroup) => {
            onChange({
                ...filterGroup,
                and: [
                    ...items.slice(0, index),
                    item,
                    ...items.slice(index + 1),
                ],
            });
        },
        [filterGroup, items, onChange],
    );

    const onAddFilterRule = useCallback(() => {
        if (fields.length > 0) {
            onChange({
                ...filterGroup,
                and: [
                    ...items,
                    {
                        id: uuidv4(),
                        target: {
                            fieldId: fieldId(fields[0]),
                        },
                        operator: FilterOperator.EQUALS,
                    },
                ],
            });
        }
    }, [fields, filterGroup, items, onChange]);

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
                    marginBottom: '20px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                }}
            >
                <div style={{ display: 'inline-flex', alignItems: 'center' }}>
                    <HTMLSelect
                        fill={false}
                        disabled
                        iconProps={{ icon: 'caret-down' }}
                        options={[
                            {
                                value: FilterGroupOperator.and,
                                label: 'All',
                            },
                            {
                                value: FilterGroupOperator.or,
                                label: 'Any',
                            },
                        ]}
                        value={FilterGroupOperator.and}
                    />
                    <p
                        style={{
                            margin: 0,
                            marginLeft: 10,
                            color: Colors.GRAY2,
                        }}
                    >
                        of the following conditions match:
                    </p>
                </div>
                <div
                    style={{
                        width: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '10px',
                    }}
                >
                    {items.map((item, index) => (
                        <div
                            key={item.id}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                            }}
                        >
                            <div style={{ width: 60 }} />
                            {isFilterRule(item) ? (
                                <FilterRuleForm
                                    filterRule={item}
                                    fields={fields}
                                    onChange={(value) =>
                                        onChangeItem(index, value)
                                    }
                                    onDelete={() => onDeleteItem(index)}
                                />
                            ) : (
                                <FilterGroupForm
                                    filterGroup={item}
                                    conditionLabel={conditionLabel}
                                    fields={fields}
                                    onChange={(value) =>
                                        onChangeItem(index, value)
                                    }
                                    onDelete={() => onDeleteItem(index)}
                                />
                            )}
                        </div>
                    ))}
                </div>
            </div>
            {!hideButtons && fields.length > 0 && (
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

export default FilterGroupForm;
