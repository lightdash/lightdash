import {
    createFilterRuleFromField,
    FilterGroupOperator,
    getFilterGroupItemsPropertyName,
    getItemsFromFilterGroup,
    isAndFilterGroup,
    isFilterGroup,
    type FilterableField,
    type FilterGroup,
    type FilterRule,
} from '@lightdash/common';
import {
    Box,
    Button,
    Divider,
    Group,
    Select,
    Stack,
    Text,
} from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import React, { useCallback, type FC } from 'react';
import { v4 as uuidv4 } from 'uuid';
import MantineIcon from '../MantineIcon';
import FilterRuleForm from './FilterRuleForm';

type Props = {
    hideButtons?: boolean;
    hideLine?: boolean;
    allowConvertToGroup?: boolean;
    conditionLabel: string;
    fields: FilterableField[];
    filterGroup: FilterGroup;
    isEditMode: boolean;
    onChange: (value: FilterGroup) => void;
    onDelete: () => void;
};

const FilterGroupForm: FC<Props> = ({
    hideButtons,
    hideLine,
    allowConvertToGroup,
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
        <Stack pos="relative" spacing="sm" mb="xxs">
            {!hideLine && (
                <Divider
                    orientation="vertical"
                    pos="absolute"
                    h="100%"
                    top={0}
                    left={18}
                    style={{ zIndex: 1 }}
                />
            )}

            <Group spacing="xs">
                <Box bg="white" pos="relative" style={{ zIndex: 3 }}>
                    <Select
                        size="xs"
                        w={70}
                        withinPortal
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
                        onChange={(operator: FilterGroupOperator) =>
                            onChangeOperator(operator)
                        }
                    />
                </Box>

                <Text color="dimmed" size="xs">
                    of the following {conditionLabel} conditions match:
                </Text>
            </Group>

            <Stack
                spacing="xs"
                pl={36}
                style={{ flexGrow: 1, overflowY: 'auto' }}
            >
                {items.map((item, index) => (
                    <React.Fragment key={item.id}>
                        {!isFilterGroup(item) ? (
                            <FilterRuleForm
                                filterRule={item}
                                fields={fields}
                                isEditMode={isEditMode}
                                onChange={(value) => onChangeItem(index, value)}
                                onDelete={() => onDeleteItem(index)}
                                onConvertToGroup={
                                    allowConvertToGroup
                                        ? () =>
                                              onChangeItem(index, {
                                                  id: uuidv4(),
                                                  and: [item],
                                              })
                                        : undefined
                                }
                            />
                        ) : (
                            <FilterGroupForm
                                allowConvertToGroup={false}
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
            </Stack>

            {isEditMode && !hideButtons && fields.length > 0 && (
                <Box bg="white" pos="relative" style={{ zIndex: 2 }}>
                    <Button
                        variant="outline"
                        size="xs"
                        leftIcon={<MantineIcon icon={IconPlus} />}
                        onClick={onAddFilterRule}
                    >
                        Add group rule
                    </Button>
                </Box>
            )}
        </Stack>
    );
};

export default FilterGroupForm;
