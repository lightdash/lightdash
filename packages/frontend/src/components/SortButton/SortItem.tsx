import {
    type DraggableProvidedDraggableProps,
    type DraggableProvidedDragHandleProps,
} from '@hello-pangea/dnd';
import { isField, type SortField } from '@lightdash/common';
import { ActionIcon, Box, Group, SegmentedControl, Text } from '@mantine/core';
import { IconGripVertical, IconX } from '@tabler/icons-react';
import { forwardRef } from 'react';
import { type ExplorerContext } from '../../providers/ExplorerProvider';
import {
    getSortDirectionOrder,
    getSortLabel,
    SortDirection,
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
    onAddSortField: (
        options: Parameters<ExplorerContext['actions']['addSortField']>[1],
    ) => void;
    onRemoveSortField: () => void;
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
        },
        ref,
    ) => {
        const selectedSortDirection = sort.descending
            ? SortDirection.DESC
            : SortDirection.ASC;

        const item = column?.meta?.item;

        if (!item) {
            return null;
        }

        return (
            <Group
                ref={ref}
                {...draggableProps}
                noWrap
                position="apart"
                bg="white"
                pl="xs"
                pr="xxs"
                py="two"
                miw={420}
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
