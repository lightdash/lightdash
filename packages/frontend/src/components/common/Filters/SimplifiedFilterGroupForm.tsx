import { type FilterableField, type FilterRule } from '@lightdash/common';
import { Stack, Text, Tooltip } from '@mantine/core';
import { useCallback, type FC } from 'react';
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
        <Stack style={{ flexGrow: 1 }}>
            <Tooltip
                label="You can only use the 'and' operator when combining metrics & dimensions"
                disabled={filterRules.length > 1}
                arrowPosition="center"
            >
                <Text color="dimmed" size="xs">
                    All of the following conditions match:
                </Text>
            </Tooltip>

            <Stack spacing="sm">
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
            </Stack>
        </Stack>
    );
};

export default SimplifiedFilterGroupForm;
