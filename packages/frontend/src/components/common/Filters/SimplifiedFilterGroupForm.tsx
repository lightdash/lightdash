import { FilterableField, FilterRule } from '@lightdash/common';
import { Group, Text, Tooltip } from '@mantine/core';
import { FC, useCallback } from 'react';
import {
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
            <Group>
                <Tooltip
                    label="You can only use the 'and' operator when combining metrics & dimensions"
                    disabled={filterRules.length > 1}
                    position="bottom"
                    arrowPosition="center"
                >
                    <Text color="dimmed">
                        All of the following conditions match:
                    </Text>
                </Tooltip>
            </Group>

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
