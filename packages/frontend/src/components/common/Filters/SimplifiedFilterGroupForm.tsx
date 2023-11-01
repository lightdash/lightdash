import { FilterableField, FilterRule } from '@lightdash/common';
import { Tooltip } from '@mantine/core';
import React, { FC, useCallback } from 'react';
import {
    FilterGroupHeader,
    FilterGroupItemsWrapper,
    FilterGroupWrapper,
} from './FilterGroupForm.styles';
import FilterRuleForm from './FilterRuleForm';

type Props = {
    fields: FilterableField[];
    filterRules: FilterRule[];
    isEditMode: boolean;
    onChange: (value: FilterRule[]) => void;
};

const SimplifiedFilterGroupForm: FC<Props> = ({
    isEditMode,
    fields,
    filterRules,
    onChange,
}) => {
    const onDeleteItem = useCallback(
        (index: number) => {
            onChange([
                ...filterRules.slice(0, index),
                ...filterRules.slice(index + 1),
            ]);
        },
        [filterRules, onChange],
    );

    const onChangeItem = useCallback(
        (index: number, item: FilterRule) => {
            onChange([
                ...filterRules.slice(0, index),
                item,
                ...filterRules.slice(index + 1),
            ]);
        },
        [filterRules, onChange],
    );

    return (
        <FilterGroupWrapper>
            <FilterGroupHeader>
                <Tooltip
                    label="You can only use the 'and' operator when combining metrics & dimensions"
                    disabled={filterRules.length > 1}
                    position="bottom"
                    arrowPosition="center"
                >
                    <p>All of the following conditions match:</p>
                </Tooltip>
            </FilterGroupHeader>
            <FilterGroupItemsWrapper>
                {filterRules.map((item, index) => (
                    <FilterRuleForm
                        isEditMode={isEditMode}
                        key={item.id}
                        filterRule={item}
                        fields={fields}
                        onChange={(value) => onChangeItem(index, value)}
                        onDelete={() => onDeleteItem(index)}
                    />
                ))}
            </FilterGroupItemsWrapper>
        </FilterGroupWrapper>
    );
};

export default SimplifiedFilterGroupForm;
