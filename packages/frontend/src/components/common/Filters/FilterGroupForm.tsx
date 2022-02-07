import { Button, HTMLSelect } from '@blueprintjs/core';
import {
    fieldId,
    FilterableField,
    FilterGroup,
    FilterGroupOperator,
    FilterOperator,
    FilterRule,
    getFilterGroupItemsPropertyName,
    getItemsFromFilterGroup,
    isAndFilterGroup,
    isFilterRule,
} from 'common';
import React, { FC, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import {
    FilterGroupHeader,
    FilterGroupItemsWrapper,
    FilterGroupWrapper,
} from './FilterGroupForm.styles';
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
    const items = getItemsFromFilterGroup(filterGroup);

    const onDeleteItem = useCallback(
        (index: number) => {
            if (items.length <= 1) {
                onDelete();
            } else {
                onChange({
                    ...filterGroup,
                    [getFilterGroupItemsPropertyName(filterGroup)]: [
                        ...items.slice(0, index),
                        ...items.slice(index + 1),
                    ],
                });
            }
        },
        [filterGroup, items, onChange, onDelete],
    );

    const onChangeItem = useCallback(
        (index: number, item: FilterRule | FilterGroup) => {
            onChange({
                ...filterGroup,
                [getFilterGroupItemsPropertyName(filterGroup)]: [
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
                [getFilterGroupItemsPropertyName(filterGroup)]: [
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

    const onChangeOperator = useCallback(
        (value: FilterGroupOperator) => {
            console.log('value', value);
            onChange({
                id: filterGroup.id,
                [value]: items,
            } as FilterGroup);
        },
        [filterGroup, items, onChange],
    );

    return (
        <FilterGroupWrapper>
            <FilterGroupHeader>
                <HTMLSelect
                    fill={false}
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
                    value={
                        isAndFilterGroup(filterGroup)
                            ? FilterGroupOperator.and
                            : FilterGroupOperator.or
                    }
                    onChange={(e) =>
                        onChangeOperator(
                            e.currentTarget.value as FilterGroupOperator,
                        )
                    }
                />
                <p>of the following ${conditionLabel} conditions match:</p>
            </FilterGroupHeader>
            <FilterGroupItemsWrapper>
                {items.map((item, index) => (
                    <React.Fragment key={item.id}>
                        {isFilterRule(item) ? (
                            <FilterRuleForm
                                filterRule={item}
                                fields={fields}
                                onChange={(value) => onChangeItem(index, value)}
                                onDelete={() => onDeleteItem(index)}
                            />
                        ) : (
                            <FilterGroupForm
                                filterGroup={item}
                                conditionLabel={conditionLabel}
                                fields={fields}
                                onChange={(value) => onChangeItem(index, value)}
                                onDelete={() => onDeleteItem(index)}
                            />
                        )}
                    </React.Fragment>
                ))}
            </FilterGroupItemsWrapper>
            {!hideButtons && fields.length > 0 && (
                <Button
                    minimal
                    icon="plus"
                    intent="primary"
                    onClick={onAddFilterRule}
                >
                    Add filter
                </Button>
            )}
        </FilterGroupWrapper>
    );
};

export default FilterGroupForm;
