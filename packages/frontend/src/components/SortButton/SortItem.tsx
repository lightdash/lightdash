import {
    type DraggableProvidedDraggableProps,
    type DraggableProvidedDragHandleProps,
} from '@hello-pangea/dnd';
import { isField, type SortField } from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Group,
    SegmentedControl,
    Text,
    Tooltip,
} from '@mantine-8/core';
import { IconGripVertical, IconMinus } from '@tabler/icons-react';
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
import classes from './SortItem.module.css';

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
                wrap="nowrap"
                justify="space-between"
                pl="xs"
                pr="xxs"
                py="two"
                miw={560}
                className={`${classes.sortItem} ${isDragging ? classes.sortItemDragging : ''}`}
            >
                <Group gap="xs">
                    {isEditMode && !isOnlyItem && (
                        <Box
                            {...dragHandleProps}
                            className={classes.dragHandle}
                        >
                            <MantineIcon icon={IconGripVertical} />
                        </Box>
                    )}

                    <Text fz="xs">{isFirstItem ? 'Sort by' : 'then by'}</Text>

                    <Text fz="sm" fw={500}>
                        {(isField(item) ? item.label : item.name) ||
                            sort.fieldId}
                    </Text>
                </Group>

                <Group gap="xs">
                    <SegmentedControl
                        disabled={!isEditMode}
                        value={selectedSortDirection}
                        size="xs"
                        radius="md"
                        color="ldDark.5"
                        data={getSortDirectionOrder(item).map((direction) => ({
                            label: getSortLabel(item, direction),
                            value: direction,
                        }))}
                        onChange={(value) => {
                            if (value) {
                                onAddSortField({
                                    descending: value === SortDirection.DESC,
                                });
                            }
                        }}
                    />

                    <Text ml="lg" fz="xs" fw={500}>
                        Nulls
                    </Text>

                    <SegmentedControl
                        disabled={!isEditMode}
                        value={selectedSortNullsFirst}
                        size="xs"
                        radius="md"
                        color="ldDark.5"
                        data={Object.entries(sortNullsFirstLabels).map(
                            ([value, label]) => ({
                                label,
                                value,
                            }),
                        )}
                        onChange={(value) => {
                            if (value) {
                                onSetSortFieldNullsFirst(
                                    value === SortNullsFirst.FIRST
                                        ? true
                                        : value === SortNullsFirst.LAST
                                          ? false
                                          : undefined,
                                );
                            }
                        }}
                    />

                    {isEditMode && (
                        <Tooltip label="Remove sort">
                            <ActionIcon
                                onClick={onRemoveSortField}
                                size="xs"
                                variant="subtle"
                                color="ldGray.6"
                            >
                                <MantineIcon icon={IconMinus} />
                            </ActionIcon>
                        </Tooltip>
                    )}
                </Group>
            </Group>
        );
    },
);

export default SortItem;
