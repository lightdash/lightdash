import {
    type DraggableProvidedDraggableProps,
    type DraggableProvidedDragHandleProps,
} from '@hello-pangea/dnd';
import { isField, type SortField } from '@lightdash/common';
import { ActionIcon, Box, Group, SegmentedControl, Text } from '@mantine/core';
import { IconGripVertical, IconX } from '@tabler/icons-react';
import { forwardRef } from 'react';
import {
    getSortDirectionOrder,
    getSortLabel,
    getSortNullsFirstValue,
    SortDirection,
    SortNullsFirst,
    sortNullsFirstLabels,
} from '../../utils/sortUtils';
import MantineIcon from '../common/MantineIcon';
import { type TableColumn } from '../common/Table/types';

interface SortItemProps {
    isFirstItem: boolean;
    isOnlyItem: boolean;
    isDragging: boolean;
    isEditMode: boolean;
    sort: SortField;
    column?: TableColumn;
    draggableProps: DraggableProvidedDraggableProps;
    dragHandleProps?: DraggableProvidedDragHandleProps | null;
    onAddSortField: (options: { descending: boolean }) => void;
    onRemoveSortField: () => void;
    onSetSortFieldNullsFirst: (nullsFirst: boolean | undefined) => void;
}

const SortItem = forwardRef<HTMLDivElement, SortItemProps>(
    (
        {
            isFirstItem,
            isOnlyItem,
            isDragging,
            isEditMode,
            sort,
            column,
            draggableProps,
            dragHandleProps,
            onAddSortField,
            onRemoveSortField,
            onSetSortFieldNullsFirst,
        },
        ref,
    ) => {
        const selectedSortDirection = sort.descending
            ? SortDirection.DESC
            : SortDirection.ASC;

        const item = column?.meta?.item;

        const selectedSortNullsFirst = getSortNullsFirstValue(sort);

        if (!item) {
            return null;
        }

        return (
            <Group
                ref={ref}
                {...draggableProps}
                noWrap
                position="apart"
                pl="xs"
                pr="xxs"
                py="two"
                miw={560}
                sx={(theme) => ({
                    borderRadius: theme.radius.sm,
                    transition: 'all 100ms ease',
                    boxShadow: isDragging ? theme.shadows.md : 'none',
                })}
            >
                <Group spacing="sm">
                    {isEditMode && !isOnlyItem && (
                        <Box
                            {...dragHandleProps}
                            sx={{
                                opacity: 0.6,
                                '&:hover': { opacity: 1 },
                            }}
                        >
                            <MantineIcon icon={IconGripVertical} />
                        </Box>
                    )}

                    <Text>{isFirstItem ? 'Sort by' : 'then by'}</Text>

                    <Text fw={500}>
                        {(isField(item) ? item.label : item.name) ||
                            sort.fieldId}
                    </Text>
                </Group>

                <Group spacing="xs">
                    <SegmentedControl
                        disabled={!isEditMode}
                        value={selectedSortDirection}
                        size="xs"
                        color="blue"
                        data={getSortDirectionOrder(item).map((direction) => ({
                            label: getSortLabel(item, direction),
                            value: direction,
                        }))}
                        onChange={(value) => {
                            onAddSortField({
                                descending: value === SortDirection.DESC,
                            });
                        }}
                    />

                    <Text ml="lg" fw={500}>
                        Nulls
                    </Text>

                    <SegmentedControl
                        disabled={!isEditMode}
                        value={selectedSortNullsFirst}
                        size="xs"
                        color="blue"
                        data={Object.entries(sortNullsFirstLabels).map(
                            ([value, label]) => ({
                                label,
                                value,
                            }),
                        )}
                        onChange={(value) => {
                            onSetSortFieldNullsFirst(
                                value === SortNullsFirst.FIRST
                                    ? true
                                    : value === SortNullsFirst.LAST
                                    ? false
                                    : undefined,
                            );
                        }}
                    />

                    {isEditMode && (
                        <ActionIcon onClick={onRemoveSortField} size="sm">
                            <MantineIcon icon={IconX} />
                        </ActionIcon>
                    )}
                </Group>
            </Group>
        );
    },
);

export default SortItem;
