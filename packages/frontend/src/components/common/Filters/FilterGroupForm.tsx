import {
    createFilterRuleFromField,
    FilterableField,
    FilterGroup,
    FilterGroupOperator,
    FilterRule,
    getFilterGroupItemsPropertyName,
    getItemsFromFilterGroup,
    isAndFilterGroup,
    isFilterGroup,
} from '@lightdash/common';
import { Button, Group, Select, Stack, Text } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import React, { FC, useCallback } from 'react';
import MantineIcon from '../MantineIcon';
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
        <Stack spacing="lg" sx={{ flex: 1 }}>
            <Group>
                <Select
                    w="6xl"
                    className={!isEditMode ? 'disabled-filter' : ''}
                    disabled={!isEditMode}
                    data={[
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
                    onChange={(value: FilterGroupOperator) =>
                        onChangeOperator(value)
                    }
                />

                <Text color="gray">
                    of the following {conditionLabel} conditions match:
                </Text>
            </Group>

            {items.length > 0 ? (
                <Stack spacing="sm" pl="4xl">
                    {items.map((item, index) =>
                        !isFilterGroup(item) ? (
                            <FilterRuleForm
                                key={item.id}
                                filterRule={item}
                                fields={fields}
                                isEditMode={isEditMode}
                                onChange={(value) => onChangeItem(index, value)}
                                onDelete={() => onDeleteItem(index)}
                            />
                        ) : (
                            <FilterGroupForm
                                key={item.id}
                                isEditMode={isEditMode}
                                filterGroup={item}
                                conditionLabel={conditionLabel}
                                fields={fields}
                                onChange={(value) => onChangeItem(index, value)}
                                onDelete={() => onDeleteItem(index)}
                            />
                        ),
                    )}
                </Stack>
            ) : null}

            {!hideButtons && fields.length > 0 && (
                <Button
                    w="fit-content"
                    size="sm"
                    ml="4xl"
                    variant="light"
                    disabled={fields.length <= 0}
                    leftIcon={<MantineIcon size="md" icon={IconPlus} />}
                    onClick={onAddFilterRule}
                >
                    Add filter
                </Button>
            )}
        </Stack>
    );
};

export default FilterGroupForm;
