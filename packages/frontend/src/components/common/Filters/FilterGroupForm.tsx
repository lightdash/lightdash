import { Button, HTMLSelect } from '@blueprintjs/core';
import {
    createFilterRuleFromField,
    FilterableField,
    FilterGroup,
    FilterGroupOperator,
    FilterRule,
    getFilterGroupItemsPropertyName,
    getItemsFromFilterGroup,
    isAndFilterGroup,
    isFilterRule,
} from '@lightdash/common';
import React, { FC, useCallback } from 'react';
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
    isEditMode: boolean;
    onChange: (value: FilterGroup) => void;
    onDelete: () => void;
};

const FilterGroupForm: FC<Props> = ({
    hideButtons,
    conditionLabel,
    fields,
    filterGroup,
    isEditMode,
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
                    createFilterRuleFromField(fields[0]),
                ],
            });
        }
    }, [fields, filterGroup, items, onChange]);

    const onChangeOperator = useCallback(
        (value: FilterGroupOperator) => {
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
                    className={!isEditMode ? 'disabled-filter' : ''}
                    fill={false}
                    disabled={!isEditMode}
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
                <p style={{ marginLeft: 10 }}>
                    of the following {conditionLabel} conditions match:
                </p>
            </FilterGroupHeader>
            <FilterGroupItemsWrapper>
                {items.map((item, index) => (
                    <React.Fragment key={item.id}>
                        {isFilterRule(item) ? (
                            <FilterRuleForm
                                filterRule={item}
                                fields={fields}
                                isEditMode={isEditMode}
                                onChange={(value) => onChangeItem(index, value)}
                                onDelete={() => onDeleteItem(index)}
                            />
                        ) : (
                            <FilterGroupForm
                                isEditMode={isEditMode}
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
