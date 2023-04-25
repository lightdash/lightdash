import { FilterableField, FilterRule } from '@lightdash/common';
import { Stack, Text, Tooltip } from '@mantine/core';
import { FC, useCallback } from 'react';
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
        <Stack spacing="sm">
            <Tooltip
                withArrow
                position="top-start"
                label="You can only use the 'and' operator when combining metrics & dimensions"
                disabled={filterRules.length > 1}
            >
                <Text component="span" color="gray">
                    All of the following conditions match:
                </Text>
            </Tooltip>

            <Stack spacing="lg">
                {filterRules.map((item, index) => (
                    <FilterRuleForm
                        key={item.id}
                        isEditMode={isEditMode}
                        filterRule={item}
                        fields={fields}
                        onChange={(value) => onChangeItem(index, value)}
                        onDelete={() => onDeleteItem(index)}
                    />
                ))}
            </Stack>
        </Stack>
    );
};

export default SimplifiedFilterGroupForm;
